import type { ProviderId } from "./types";

export type ValidateResult = { ok: true } | { ok: false; error: string };

const TIMEOUT_MS = 12_000;

async function withTimeout(
	run: (signal: AbortSignal) => Promise<Response>,
): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		return await run(controller.signal);
	} finally {
		clearTimeout(timer);
	}
}

/** Probe an OpenAI-compatible `/chat/completions` endpoint with Bearer auth. */
async function checkOpenAiCompatible(
	baseURL: string,
	apiKey: string,
	model: string,
): Promise<ValidateResult> {
	const response = await withTimeout((signal) =>
		fetch(`${baseURL}/chat/completions`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model,
				messages: [{ role: "user", content: "ping" }],
				max_tokens: 1,
			}),
			signal,
		}),
	);
	if (response.status === 401 || response.status === 403) {
		return { ok: false, error: "Invalid API key." };
	}
	return { ok: true };
}

/** Anthropic `GET /v1/models` with `x-api-key` + version header. */
async function checkAnthropic(apiKey: string): Promise<ValidateResult> {
	const response = await withTimeout((signal) =>
		fetch("https://api.anthropic.com/v1/models", {
			headers: {
				"x-api-key": apiKey,
				"anthropic-version": "2023-06-01",
			},
			signal,
		}),
	);
	if (response.ok) return { ok: true };
	if (response.status === 401 || response.status === 403) {
		return { ok: false, error: "Invalid API key." };
	}
	return { ok: false, error: `Provider returned ${response.status}.` };
}

/** Probe an Anthropic-compatible `/messages` endpoint with a tiny request. */
async function checkAnthropicCompatible(
	baseURL: string,
	apiKey: string,
	model: string,
): Promise<ValidateResult> {
	const response = await withTimeout((signal) =>
		fetch(`${baseURL}/messages`, {
			method: "POST",
			headers: {
				"x-api-key": apiKey,
				"anthropic-version": "2023-06-01",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model,
				messages: [{ role: "user", content: "ping" }],
				max_tokens: 1,
			}),
			signal,
		}),
	);
	if (response.status === 401 || response.status === 403) {
		return { ok: false, error: "Invalid API key." };
	}
	return { ok: true };
}

/**
 * Validate an API key against the live provider. Returns a `Result`; network
 * failures surface as a friendly error rather than throwing.
 */
export async function validateProviderKey(
	provider: ProviderId,
	apiKey: string,
): Promise<ValidateResult> {
	if (apiKey.trim().length === 0) {
		return { ok: false, error: "API key is empty." };
	}

	try {
		switch (provider) {
			case "openai":
				return await checkOpenAiCompatible(
					"https://api.openai.com/v1",
					apiKey,
					"gpt-5.5",
				);
			case "gemini":
				return await checkOpenAiCompatible(
					"https://generativelanguage.googleapis.com/v1beta/openai",
					apiKey,
					"gemini-3.1-flash-lite-preview",
				);
			case "kimi":
				return await checkOpenAiCompatible(
					"https://api.moonshot.ai/v1",
					apiKey,
					"kimi-k2.6",
				);
			case "glm":
				return await checkOpenAiCompatible(
					"https://api.z.ai/api/coding/paas/v4",
					apiKey,
					"glm-5.1",
				);
			case "xiaomi":
				return await checkOpenAiCompatible(
					"https://token-plan-sgp.xiaomimimo.com/v1",
					apiKey,
					"mimo-v2.5-pro",
				);
			case "deepseek":
				return await checkOpenAiCompatible(
					"https://api.deepseek.com/v1",
					apiKey,
					"deepseek-v4-pro",
				);
			case "openrouter":
				return await checkOpenAiCompatible(
					"https://openrouter.ai/api/v1",
					apiKey,
					"qwen/qwen3.6-plus",
				);
			case "anthropic":
				return await checkAnthropic(apiKey);
			case "minimax":
				return await checkAnthropicCompatible(
					"https://api.minimax.io/anthropic",
					apiKey,
					"MiniMax-M3",
				);
		}
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") {
			return { ok: false, error: "Validation timed out." };
		}
		return {
			ok: false,
			error:
				error instanceof Error
					? `Could not reach provider: ${error.message}`
					: "Could not reach provider.",
		};
	}
}
