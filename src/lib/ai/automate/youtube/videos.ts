import type { Innertube } from "youtubei.js";
import { YTNodes } from "youtubei.js";
import { getYoutubeClient } from "./client";

/**
 * List recent uploads for a channel via the InnerTube client's Videos tab. The
 * unofficial API returns only relative publish text ("2 days ago"), so
 * `publishedAt` is left null — dedup keys on `videoId`, which is exact.
 */

export type ChannelVideo = {
	videoId: string;
	title: string;
	url: string;
	publishedAt: number | null;
};

export type ListVideosResult =
	| { ok: true; videos: ChannelVideo[] }
	| { ok: false; error: string };

type ClassicVideoNode = {
	video_id?: string;
	id?: string;
	title?: { toString(): string };
};

function pushUnique(
	videos: ChannelVideo[],
	seen: Set<string>,
	videoId: string,
	title: string,
): void {
	if (seen.has(videoId)) return;
	seen.add(videoId);
	videos.push({
		videoId,
		title: title || videoId,
		url: `https://www.youtube.com/watch?v=${videoId}`,
		publishedAt: null,
	});
}

/**
 * Fetch the latest `limit` uploads (most recent first) for a channel id. `limit`
 * is capped at 50 to bound embedding cost per poll.
 *
 * Reads both the newer `LockupView` grid items (the current default layout) and
 * the classic `Video`/`GridVideo` nodes (older layouts) — YouTube serves one or
 * the other depending on the channel, so we merge and dedupe by video id.
 */
export async function listRecentVideos(
	channelId: string,
	limit = 10,
	client?: Innertube,
): Promise<ListVideosResult> {
	const cap = Math.min(Math.max(1, limit), 50);

	let yt: Innertube;
	try {
		yt = client ?? (await getYoutubeClient());
	} catch (error) {
		return {
			ok: false,
			error:
				error instanceof Error ? error.message : "Failed to reach YouTube.",
		};
	}

	try {
		const channel = await yt.getChannel(channelId);
		const videosTab = await channel.getVideos();

		const videos: ChannelVideo[] = [];
		const seen = new Set<string>();

		// New layout: LockupView grid items (filter to video lockups).
		for (const lockup of videosTab.memo.getType(YTNodes.LockupView)) {
			if (videos.length >= cap) break;
			if (lockup.content_type !== "VIDEO" || !lockup.content_id) continue;
			pushUnique(
				videos,
				seen,
				lockup.content_id,
				lockup.metadata?.title?.toString() ?? "",
			);
		}

		// Classic layout fallback: Video / GridVideo nodes.
		for (const node of videosTab.videos as ClassicVideoNode[]) {
			if (videos.length >= cap) break;
			const videoId = node.video_id ?? node.id;
			if (!videoId) continue;
			pushUnique(videos, seen, videoId, node.title?.toString() ?? "");
		}

		return { ok: true, videos };
	} catch (error) {
		return {
			ok: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to list channel videos.",
		};
	}
}
