import type { Innertube } from "youtubei.js";
import { getYoutubeClient } from "./client";

/**
 * Resolve a user-entered YouTube channel reference (URL or `@handle`) into a
 * concrete channel via the unofficial InnerTube client — no Data API key needed.
 * Discovery and transcripts both go through the same client (see `videos.ts` /
 * `transcript.ts`).
 */

/** What kind of channel lookup an input maps to. */
export type ChannelLookup =
	| { kind: "id"; value: string } // channel id (UC...)
	| { kind: "handle"; value: string } // @handle
	| { kind: "username"; value: string }; // legacy /user/ name

export type ResolvedChannel = {
	channelId: string;
	title: string;
};

export type ResolveResult =
	| { ok: true; channel: ResolvedChannel }
	| { ok: false; error: string };

/**
 * Parse a channel reference into a {@link ChannelLookup}. Accepts:
 *  - bare `@handle` or `handle`
 *  - `youtube.com/@handle`
 *  - `youtube.com/channel/UC...`
 *  - `youtube.com/user/Name` (legacy)
 *  - `youtube.com/c/Name` (custom URL → treated as a handle lookup)
 * Returns null when nothing usable can be extracted.
 */
export function parseChannelInput(input: string): ChannelLookup | null {
	const trimmed = input.trim();
	if (trimmed.length === 0) return null;

	// Bare handle or channel id without a URL.
	if (!trimmed.includes("/") && !trimmed.includes(".")) {
		if (trimmed.startsWith("@")) {
			return { kind: "handle", value: trimmed.slice(1) };
		}
		if (/^UC[\w-]{20,}$/.test(trimmed)) {
			return { kind: "id", value: trimmed };
		}
		return { kind: "handle", value: trimmed };
	}

	let path: string;
	try {
		const url = new URL(
			trimmed.includes("://") ? trimmed : `https://${trimmed}`,
		);
		path = url.pathname;
	} catch {
		return null;
	}

	const segments = path.split("/").filter((part) => part.length > 0);
	if (segments.length === 0) return null;

	const [first, second] = segments;
	if (first?.startsWith("@")) {
		return { kind: "handle", value: first.slice(1) };
	}
	if (first === "channel" && second) {
		return { kind: "id", value: second };
	}
	if (first === "user" && second) {
		return { kind: "username", value: second };
	}
	if (first === "c" && second) {
		return { kind: "handle", value: second };
	}
	return null;
}

/** Canonical youtube.com URL for a non-id lookup, fed to `resolveURL`. */
function lookupUrl(
	lookup: Extract<ChannelLookup, { kind: "handle" | "username" }>,
): string {
	if (lookup.kind === "handle") {
		return `https://www.youtube.com/@${lookup.value}`;
	}
	return `https://www.youtube.com/user/${lookup.value}`;
}

/**
 * Resolve a `UC…` channel id (directly given or resolved from a URL) into its
 * title via `getChannel`. Returns null when the channel can't be loaded.
 */
async function channelFromId(
	client: Innertube,
	channelId: string,
): Promise<ResolvedChannel | null> {
	try {
		const channel = await client.getChannel(channelId);
		const title = channel.metadata?.title ?? channelId;
		const id = channel.metadata?.external_id ?? channelId;
		return { channelId: id, title };
	} catch {
		return null;
	}
}

/**
 * Resolve a channel reference to its id + title via InnerTube. Network/parse
 * failures and unknown channels surface as a friendly `Result` error.
 */
export async function resolveChannel(input: string): Promise<ResolveResult> {
	const lookup = parseChannelInput(input);
	if (!lookup) {
		return { ok: false, error: "Could not parse a channel from that input." };
	}

	let client: Innertube;
	try {
		client = await getYoutubeClient();
	} catch (error) {
		return {
			ok: false,
			error:
				error instanceof Error ? error.message : "Failed to reach YouTube.",
		};
	}

	try {
		// Channel ids can be loaded directly; handles/usernames resolve via URL.
		if (lookup.kind === "id") {
			const channel = await channelFromId(client, lookup.value);
			return channel
				? { ok: true, channel }
				: { ok: false, error: "No channel found for that reference." };
		}

		const endpoint = await client.resolveURL(lookupUrl(lookup));
		const browseId = (endpoint.payload as { browseId?: string } | undefined)
			?.browseId;
		if (!browseId?.startsWith("UC")) {
			return { ok: false, error: "No channel found for that reference." };
		}
		const channel = await channelFromId(client, browseId);
		return channel
			? { ok: true, channel }
			: { ok: false, error: "No channel found for that reference." };
	} catch (error) {
		return {
			ok: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to resolve the channel.",
		};
	}
}
