import { describe, expect, it, vi } from "vitest";
import { extractArticleText, fetchArticleText } from "./article";

const PAGE = `<!doctype html><html><head><title>T</title></head><body>
	<nav>Home About Subscribe</nav>
	<article><h1>Real Title</h1>
		<p>${"The quick brown fox jumps over the lazy dog. ".repeat(20)}</p>
	</article>
	<footer>Cookie banner and copyright noise</footer>
</body></html>`;

describe("extractArticleText", () => {
	it("returns main prose and strips nav/footer boilerplate", () => {
		const result = extractArticleText(PAGE);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.text).toContain("quick brown fox");
		expect(result.text).not.toContain("Cookie banner");
		expect(result.text).not.toContain("Home About Subscribe");
	});

	it("fails when there is no article content", () => {
		expect(extractArticleText("<html><body></body></html>").ok).toBe(false);
	});
});

describe("fetchArticleText", () => {
	it("fetches and extracts an HTML article", async () => {
		const fetchFn = vi.fn(
			async () =>
				new Response(PAGE, {
					status: 200,
					headers: { "content-type": "text/html" },
				}),
		) as unknown as typeof fetch;
		const result = await fetchArticleText("https://x.example/post", {
			fetchFn,
		});
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.text).toContain("quick brown fox");
	});

	it("rejects non-http(s) urls without fetching", async () => {
		const fetchFn = vi.fn() as unknown as typeof fetch;
		const result = await fetchArticleText("ftp://x.example/post", { fetchFn });
		expect(result.ok).toBe(false);
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it("falls back (errors) on a non-HTML response", async () => {
		const fetchFn = vi.fn(
			async () =>
				new Response("%PDF-1.7 binary", {
					status: 200,
					headers: { "content-type": "application/pdf" },
				}),
		) as unknown as typeof fetch;
		const result = await fetchArticleText("https://x.example/file.pdf", {
			fetchFn,
		});
		expect(result.ok).toBe(false);
	});

	it("returns an error on a non-2xx response", async () => {
		const fetchFn = vi.fn(
			async () => new Response("nope", { status: 404 }),
		) as unknown as typeof fetch;
		const result = await fetchArticleText("https://x.example/missing", {
			fetchFn,
		});
		expect(result.ok).toBe(false);
	});
});
