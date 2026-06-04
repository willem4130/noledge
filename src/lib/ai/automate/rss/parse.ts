import { XMLParser } from "fast-xml-parser";
import { normalizeText } from "@/lib/ai/rag/normalize";

/**
 * RSS 2.0 / Atom / RDF feed parser built on `fast-xml-parser`. The parser handles
 * the fiddly XML details (CDATA, entity decoding, attribute extraction, repeated
 * elements); this module maps the resulting object tree onto the small
 * {@link FeedItem} shape the poller needs and reduces HTML bodies to plain text.
 */

export type FeedItem = {
	/** Stable per-source identity: RSS guid / Atom id, falling back to the link. */
	guid: string;
	/** Canonical article URL for display. */
	link: string;
	title: string;
	/** Plain-text body (HTML stripped + normalized). May be empty. */
	content: string;
	/** Publication time in epoch ms, when parseable. */
	publishedAt: number | null;
};

export type ParsedFeed = {
	title: string;
	items: FeedItem[];
};

export type FetchFeedResult =
	| { ok: true; feed: ParsedFeed }
	| { ok: false; error: string };

/** Any parsed XML node — a string, a primitive, or an object with `#text`/attrs. */
type XmlNode = unknown;
type XmlObject = Record<string, unknown>;

const FEED_TITLE_FALLBACK = "Untitled feed";

// Keep attributes (Atom `<link href>`, `guid isPermaLink`) and leave tag values
// as raw strings — `parseTagValue: false` stops numeric guids/ids being coerced
// to numbers. CDATA + entity decoding are handled by the parser.
const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: "@_",
	trimValues: true,
	parseTagValue: false,
	parseAttributeValue: false,
	processEntities: true,
});

function isObject(value: XmlNode): value is XmlObject {
	return typeof value === "object" && value !== null;
}

/** Wrap a possibly-absent / possibly-single node as an array. */
function toArray<T = XmlNode>(value: XmlNode): T[] {
	if (value === undefined || value === null) return [];
	return (Array.isArray(value) ? value : [value]) as T[];
}

/** Plain text of a node: the string itself, or its `#text` child. */
function textValue(node: XmlNode): string {
	if (node === undefined || node === null) return "";
	if (typeof node === "string") return node;
	if (typeof node === "number" || typeof node === "boolean") {
		return String(node);
	}
	if (isObject(node)) {
		const text = node["#text"];
		if (text !== undefined && text !== null) return String(text);
	}
	return "";
}

/** First non-empty text value among the given keys of a node. */
function firstText(node: XmlObject, keys: string[]): string {
	for (const key of keys) {
		const value = textValue(node[key]);
		if (value.length > 0) return value;
	}
	return "";
}

/** Strip HTML tags then normalize whitespace into clean plain text. */
function htmlToText(html: string): string {
	const withoutTags = html
		.replace(/<br\s*\/?>(?=\s*\S)/gi, "\n")
		.replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
		.replace(/<[^>]+>/g, " ")
		// Collapse the horizontal whitespace left by stripped inline tags, while
		// preserving the block-level newlines inserted above.
		.replace(/[ \t]+/g, " ");
	return normalizeText(withoutTags);
}

function parseDate(value: string): number | null {
	if (value.length === 0) return null;
	const ms = Date.parse(value.trim());
	return Number.isNaN(ms) ? null : ms;
}

/** Choose an Atom entry's preferred link href: `rel=alternate`, else the first. */
function atomLinkHref(link: XmlNode): string {
	let fallback = "";
	for (const candidate of toArray(link)) {
		if (typeof candidate === "string") {
			if (!fallback) fallback = candidate;
			continue;
		}
		if (!isObject(candidate)) continue;
		const href = candidate["@_href"];
		if (typeof href !== "string" || href.length === 0) continue;
		const rel = candidate["@_rel"];
		if (rel === undefined || rel === "alternate") return href;
		if (!fallback) fallback = href;
	}
	return fallback;
}

function parseRssItem(node: XmlObject): FeedItem {
	const link = textValue(node.link);
	const guid = firstText(node, ["guid"]) || link;
	return {
		guid,
		link,
		title: textValue(node.title),
		content: htmlToText(firstText(node, ["content:encoded", "description"])),
		publishedAt: parseDate(firstText(node, ["pubDate", "dc:date"])),
	};
}

function parseAtomEntry(node: XmlObject): FeedItem {
	const link = atomLinkHref(node.link);
	const id = textValue(node.id) || link;
	return {
		guid: id,
		link,
		title: textValue(node.title),
		content: htmlToText(firstText(node, ["content", "summary"])),
		publishedAt: parseDate(firstText(node, ["published", "updated"])),
	};
}

/** Normalize a `channel`/`feed` container that may be wrapped in an array. */
function unwrap(node: XmlNode): XmlObject | undefined {
	const first = Array.isArray(node) ? node[0] : node;
	return isObject(first) ? first : undefined;
}

/** Parse a feed document (RSS 2.0, Atom, or RSS 1.0/RDF) into a {@link ParsedFeed}. */
export function parseFeed(xml: string): ParsedFeed {
	let root: XmlObject;
	try {
		const parsed = parser.parse(xml) as XmlNode;
		if (!isObject(parsed)) return { title: FEED_TITLE_FALLBACK, items: [] };
		root = parsed;
	} catch {
		return { title: FEED_TITLE_FALLBACK, items: [] };
	}

	// Atom: <feed><entry>…
	const feed = unwrap(root.feed);
	if (feed) {
		return {
			title: textValue(feed.title) || FEED_TITLE_FALLBACK,
			items: toArray<XmlObject>(feed.entry)
				.filter(isObject)
				.map(parseAtomEntry),
		};
	}

	// RSS 1.0/RDF: <rdf:RDF><channel/><item>… — items are siblings of <channel>.
	const rdf = unwrap(root["rdf:RDF"]);
	if (rdf) {
		const rdfChannel = unwrap(rdf.channel);
		return {
			title: textValue(rdfChannel?.title) || FEED_TITLE_FALLBACK,
			items: toArray<XmlObject>(rdf.item).filter(isObject).map(parseRssItem),
		};
	}

	// RSS 2.0: <rss><channel><item>…
	const rss = unwrap(root.rss);
	const channel = unwrap(rss?.channel);
	if (channel) {
		return {
			title: textValue(channel.title) || FEED_TITLE_FALLBACK,
			items: toArray<XmlObject>(channel.item)
				.filter(isObject)
				.map(parseRssItem),
		};
	}

	return { title: FEED_TITLE_FALLBACK, items: [] };
}

const FETCH_TIMEOUT_MS = 15_000;
const MAX_FEED_BYTES = 8 * 1024 * 1024;

/** Fetch and parse a feed URL. Network/parse failures return a `Result`. */
export async function fetchFeed(
	url: string,
	options: { fetchFn?: typeof fetch; signal?: AbortSignal } = {},
): Promise<FetchFeedResult> {
	const fetchFn = options.fetchFn ?? fetch;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	if (options.signal) {
		options.signal.addEventListener("abort", () => controller.abort(), {
			once: true,
		});
	}
	try {
		const response = await fetchFn(url, {
			headers: {
				Accept:
					"application/rss+xml, application/atom+xml, application/xml, text/xml; q=0.9, */*; q=0.8",
				"User-Agent": "noledge-automation/1.0 (+feed-poller)",
			},
			signal: controller.signal,
		});
		if (!response.ok) {
			return { ok: false, error: `Feed returned ${response.status}.` };
		}
		const xml = await response.text();
		if (xml.length > MAX_FEED_BYTES) {
			return { ok: false, error: "Feed exceeds the size limit." };
		}
		if (!/<rss[\s>]|<feed[\s>]|<rdf:RDF[\s>]/i.test(xml)) {
			return {
				ok: false,
				error: "URL did not return a recognizable RSS/Atom feed.",
			};
		}
		const feed = parseFeed(xml);
		if (feed.items.length === 0) {
			return { ok: false, error: "Feed contained no items." };
		}
		return { ok: true, feed };
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") {
			return { ok: false, error: "Feed fetch timed out." };
		}
		return {
			ok: false,
			error: error instanceof Error ? error.message : "Failed to fetch feed.",
		};
	} finally {
		clearTimeout(timer);
	}
}
