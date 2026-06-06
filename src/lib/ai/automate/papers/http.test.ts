import { afterEach, describe, expect, it, vi } from "vitest";
import { httpText } from "./http";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("httpText retry", () => {
	it("retries once on a 5xx and returns the eventual success", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response("busy", { status: 503 }))
			.mockResolvedValueOnce(new Response("ok-body", { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		const result = await httpText("https://x.example/data");
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.status).toBe(200);
			expect(result.body).toBe("ok-body");
		}
	});

	it("retries once on a thrown network error", async () => {
		const fetchMock = vi
			.fn()
			.mockRejectedValueOnce(new TypeError("network down"))
			.mockResolvedValueOnce(new Response("recovered", { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		const result = await httpText("https://x.example/data");
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(result.ok).toBe(true);
	});

	it("does not retry a deterministic 4xx", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response("forbidden", { status: 403 }));
		vi.stubGlobal("fetch", fetchMock);

		const result = await httpText("https://x.example/blocked");
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.status).toBe(403);
	});

	it("does not retry when the caller aborts", async () => {
		const controller = new AbortController();
		const fetchMock = vi.fn(async () => {
			controller.abort();
			throw new DOMException("Aborted", "AbortError");
		});
		vi.stubGlobal("fetch", fetchMock);

		const result = await httpText("https://x.example/slow", {
			signal: controller.signal,
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(result.ok).toBe(false);
	});
});
