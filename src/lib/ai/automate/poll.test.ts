import type { Database } from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "@/lib/ai/db/client";
import type { Embedder } from "@/lib/ai/rag/ingest";
import { runPoll, type YoutubeDeps } from "./poll";
import { addSource, documentExists } from "./store";

/** Deterministic embedder: one-hot vector so ingest always succeeds. */
const embedder: Embedder = async (values) => ({
	ok: true,
	embeddings: values.map(() => {
		const vector = new Array<number>(1536).fill(0);
		vector[0] = 1;
		return vector;
	}),
});

let db: Database | null = null;

afterEach(() => {
	db?.close();
	db = null;
});

const RSS_BODY = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Blog</title>
	<item><title>Post One</title><link>https://b.example/1</link><guid>g-1</guid><description>Body one about cats.</description></item>
	<item><title>Post Two</title><link>https://b.example/2</link><guid>g-2</guid><description>Body two about dogs.</description></item>
</channel></rss>`;

describe("runPoll (RSS)", () => {
	it("ingests new feed items and dedups on a second run", async () => {
		db = openDatabase(":memory:");
		const source = addSource(
			{ type: "rss", url: "https://b.example/feed.xml", title: "Blog" },
			db,
		);

		const fetchFn = vi.fn(async () => new Response(RSS_BODY, { status: 200 }));

		const first = await runPoll({ db, embedder, fetchFn });
		expect(first.added).toBe(2);
		expect(first.skipped).toBe(0);
		expect(first.errors).toBe(0);
		expect(documentExists(source.id, "g-1", db)).toBe(true);

		// Second poll: same items are all skipped, nothing re-ingested.
		const second = await runPoll({ db, embedder, fetchFn });
		expect(second.added).toBe(0);
		expect(second.skipped).toBe(2);
	});

	it("records a source error without aborting the run", async () => {
		db = openDatabase(":memory:");
		addSource(
			{ type: "rss", url: "https://bad.example/feed", title: "Bad" },
			db,
		);

		const fetchFn = vi.fn(async () => new Response("nope", { status: 500 }));
		const summary = await runPoll({ db, embedder, fetchFn });
		expect(summary.added).toBe(0);
		expect(summary.errors).toBe(1);
		expect(summary.perSource[0]?.status).toBe("error");
	});
});

describe("runPoll (YouTube)", () => {
	it("lists videos, fetches transcripts, ingests, and dedups", async () => {
		db = openDatabase(":memory:");
		const source = addSource(
			{
				type: "youtube",
				url: "https://youtube.com/@chan",
				identifier: "UC123",
				title: "Chan",
			},
			db,
		);

		const youtube: YoutubeDeps = {
			listVideos: async () => ({
				ok: true,
				videos: [
					{
						videoId: "vid-a",
						title: "Vid A",
						url: "https://www.youtube.com/watch?v=vid-a",
						publishedAt: null,
					},
				],
			}),
			fetchTranscript: async () => ({ ok: true, text: "Hello world" }),
		};

		const summary = await runPoll({ db, embedder, youtube });
		expect(summary.added).toBe(1);
		expect(documentExists(source.id, "vid-a", db)).toBe(true);

		const second = await runPoll({ db, embedder, youtube });
		expect(second.added).toBe(0);
		expect(second.skipped).toBe(1);
	});

	it("skips a video with no captions rather than failing", async () => {
		db = openDatabase(":memory:");
		addSource(
			{
				type: "youtube",
				url: "https://youtube.com/@chan",
				identifier: "UC999",
				title: "Chan",
			},
			db,
		);

		const youtube: YoutubeDeps = {
			listVideos: async () => ({
				ok: true,
				videos: [
					{
						videoId: "v-x",
						title: "No Caps",
						url: "https://www.youtube.com/watch?v=v-x",
						publishedAt: null,
					},
				],
			}),
			fetchTranscript: async () => ({
				ok: false,
				skipped: true,
				reason: "No transcript available for this video.",
			}),
		};

		const summary = await runPoll({ db, embedder, youtube });
		expect(summary.added).toBe(0);
		expect(summary.skipped).toBe(1);
		expect(summary.errors).toBe(0);
	});
});
