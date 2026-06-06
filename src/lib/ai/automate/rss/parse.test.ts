import { describe, expect, it, vi } from "vitest";
import { fetchFeed, parseFeed } from "./parse";

const RSS_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
	<channel>
		<title>Example Blog</title>
		<link>https://example.com</link>
		<item>
			<title>First &amp; Foremost</title>
			<link>https://example.com/first</link>
			<guid isPermaLink="false">post-0001</guid>
			<pubDate>Tue, 03 Jun 2025 09:00:00 GMT</pubDate>
			<content:encoded><![CDATA[<p>Hello <strong>world</strong>.</p>]]></content:encoded>
		</item>
		<item>
			<title>No GUID Here</title>
			<link>https://example.com/second</link>
			<description>Plain &lt;b&gt;summary&lt;/b&gt; text.</description>
		</item>
	</channel>
</rss>`;

const ATOM_SAMPLE = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
	<title>Atom Example</title>
	<entry>
		<title>Atom Entry One</title>
		<id>urn:uuid:1225c695-cfb8</id>
		<link rel="alternate" href="https://example.org/atom-one"/>
		<published>2025-06-01T12:30:00Z</published>
		<content type="html">&lt;p&gt;Body of the entry.&lt;/p&gt;</content>
	</entry>
</feed>`;

describe("parseFeed (RSS)", () => {
	it("extracts title, items, and normalized content", () => {
		const feed = parseFeed(RSS_SAMPLE);
		expect(feed.title).toBe("Example Blog");
		expect(feed.items).toHaveLength(2);

		const [first, second] = feed.items;
		expect(first?.title).toBe("First & Foremost");
		expect(first?.guid).toBe("post-0001");
		expect(first?.link).toBe("https://example.com/first");
		expect(first?.content).toContain("Hello world");
		expect(first?.content).not.toContain("<strong>");
		expect(first?.publishedAt).toBe(
			Date.parse("Tue, 03 Jun 2025 09:00:00 GMT"),
		);

		// guid falls back to the link when absent.
		expect(second?.guid).toBe("https://example.com/second");
		expect(second?.content).toContain("summary");
		expect(second?.publishedAt).toBeNull();
	});
});

const RDF_SAMPLE = `<?xml version="1.0"?>
<rdf:RDF xmlns="http://purl.org/rss/1.0/" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/">
	<channel rdf:about="https://rdf.example/">
		<title>RDF Example</title>
	</channel>
	<item rdf:about="https://rdf.example/a">
		<title>RDF Item</title>
		<link>https://rdf.example/a</link>
		<description>RDF body text.</description>
		<dc:date>2025-06-02T08:00:00Z</dc:date>
	</item>
</rdf:RDF>`;

describe("parseFeed (RDF / RSS 1.0)", () => {
	it("reads channel title and sibling items", () => {
		const feed = parseFeed(RDF_SAMPLE);
		expect(feed.title).toBe("RDF Example");
		expect(feed.items).toHaveLength(1);
		const [item] = feed.items;
		expect(item?.title).toBe("RDF Item");
		expect(item?.guid).toBe("https://rdf.example/a");
		expect(item?.content).toContain("RDF body text");
		expect(item?.publishedAt).toBe(Date.parse("2025-06-02T08:00:00Z"));
	});
});

describe("parseFeed (Atom)", () => {
	it("extracts entries via id + alternate link", () => {
		const feed = parseFeed(ATOM_SAMPLE);
		expect(feed.title).toBe("Atom Example");
		expect(feed.items).toHaveLength(1);

		const [entry] = feed.items;
		expect(entry?.title).toBe("Atom Entry One");
		expect(entry?.guid).toBe("urn:uuid:1225c695-cfb8");
		expect(entry?.link).toBe("https://example.org/atom-one");
		expect(entry?.content).toContain("Body of the entry");
		expect(entry?.publishedAt).toBe(Date.parse("2025-06-01T12:30:00Z"));
	});
});

describe("fetchFeed retry", () => {
	it("retries once on a transient 503 then succeeds", async () => {
		const fetchFn = vi
			.fn()
			.mockResolvedValueOnce(new Response("busy", { status: 503 }))
			.mockResolvedValueOnce(
				new Response(RSS_SAMPLE, { status: 200 }),
			) as unknown as typeof fetch;

		const result = await fetchFeed("https://b.example/feed.xml", { fetchFn });
		expect(fetchFn).toHaveBeenCalledTimes(2);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.feed.title).toBe("Example Blog");
	});

	it("does not retry a deterministic 404", async () => {
		const fetchFn = vi.fn(
			async () => new Response("nope", { status: 404 }),
		) as unknown as typeof fetch;

		const result = await fetchFeed("https://b.example/missing", { fetchFn });
		expect(fetchFn).toHaveBeenCalledTimes(1);
		expect(result.ok).toBe(false);
	});
});
