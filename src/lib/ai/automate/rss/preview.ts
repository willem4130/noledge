import { fetchFeed } from "./parse";

export type RssPreview = {
	title: string;
	itemCount: number;
	latestTitles: string[];
};

export type RssPreviewResult =
	| { ok: true; preview: RssPreview }
	| { ok: false; error: string };

/**
 * Validate an RSS/Atom URL by fetching it and returning a small preview: feed
 * title, total item count, and the latest few item titles. Used by the "Test"
 * affordance before a source is saved.
 */
export async function previewFeed(
	url: string,
	signal?: AbortSignal,
): Promise<RssPreviewResult> {
	const result = await fetchFeed(url, { signal });
	if (!result.ok) return { ok: false, error: result.error };

	const { feed } = result;
	return {
		ok: true,
		preview: {
			title: feed.title,
			itemCount: feed.items.length,
			latestTitles: feed.items
				.slice(0, 3)
				.map((item) => item.title)
				.filter((title) => title.length > 0),
		},
	};
}
