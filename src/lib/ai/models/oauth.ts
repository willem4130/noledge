import crypto from "node:crypto";
import type { Database } from "better-sqlite3";
import { getDatabase } from "@/lib/ai/db/client";
import {
	type ProviderOAuthCredential,
	saveProviderOAuthCredential,
} from "./provider-config";
import type { ProviderId } from "./types";

export type OAuthProviderId = Extract<
	ProviderId,
	"anthropic" | "openai" | "kimi"
>;

export type OAuthStartResult =
	| {
			ok: true;
			provider: OAuthProviderId;
			mode: "code";
			stateId: string;
			authUrl: string;
			instructions: string;
	  }
	| {
			ok: true;
			provider: "kimi";
			mode: "device";
			stateId: string;
			verificationUri: string;
			verificationUriComplete: string;
			userCode: string;
			intervalSeconds: number;
			expiresAt: number;
	  }
	| { ok: false; error: string };

type OAuthStateRow = {
	id: string;
	provider: OAuthProviderId;
	state: string | null;
	verifier: string | null;
	device_code: string | null;
	expires_at: number;
};

const OPENAI_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const OPENAI_AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
const OPENAI_TOKEN_URL = "https://auth.openai.com/oauth/token";
const OPENAI_REDIRECT_URI = "http://localhost:1455/auth/callback";
const OPENAI_SCOPE =
	"openid profile email offline_access api.connectors.read api.connectors.invoke";

const ANTHROPIC_CLIENT_ID = atob(
	"OWQxYzI1MGEtZTYxYi00NGQ5LTg4ZWQtNTk0NGQxOTYyZjVl",
);
const ANTHROPIC_AUTHORIZE_URL = "https://claude.ai/oauth/authorize";
const ANTHROPIC_TOKEN_URLS = [
	"https://platform.claude.com/v1/oauth/token",
	"https://console.anthropic.com/v1/oauth/token",
] as const;
const ANTHROPIC_REDIRECT_URI =
	"https://platform.claude.com/oauth/code/callback";
const ANTHROPIC_SCOPE =
	"org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload";

const KIMI_CLIENT_ID = "17e5f671-d194-4dfb-9706-5516cb48c098";
const KIMI_OAUTH_HOST = "https://auth.kimi.com";
const KIMI_CODE_BASE_URL = "https://api.kimi.com/coding/v1";
const KIMI_DEVICE_TIMEOUT_MS = 15 * 60 * 1000;

export function isOAuthProvider(provider: string): provider is OAuthProviderId {
	return (
		provider === "anthropic" || provider === "openai" || provider === "kimi"
	);
}

function randomId(): string {
	return crypto.randomUUID();
}

function base64url(bytes: Buffer): string {
	return bytes
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

function createPkce(): { verifier: string; challenge: string } {
	const verifier = base64url(crypto.randomBytes(32));
	const challenge = base64url(
		crypto.createHash("sha256").update(verifier).digest(),
	);
	return { verifier, challenge };
}

function saveState(row: OAuthStateRow, db: Database): void {
	db.prepare(
		`INSERT INTO provider_oauth_states (id, provider, state, verifier, device_code, expires_at, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET
			provider = excluded.provider,
			state = excluded.state,
			verifier = excluded.verifier,
			device_code = excluded.device_code,
			expires_at = excluded.expires_at,
			created_at = excluded.created_at`,
	).run(
		row.id,
		row.provider,
		row.state,
		row.verifier,
		row.device_code,
		row.expires_at,
		Date.now(),
	);
}

function getState(id: string, db: Database): OAuthStateRow | undefined {
	const row = db
		.prepare(
			"SELECT id, provider, state, verifier, device_code, expires_at FROM provider_oauth_states WHERE id = ?",
		)
		.get(id) as OAuthStateRow | undefined;
	if (!row || row.expires_at < Date.now()) return undefined;
	return row;
}

function deleteState(id: string, db: Database): void {
	db.prepare("DELETE FROM provider_oauth_states WHERE id = ?").run(id);
}

export async function startOAuth(
	provider: OAuthProviderId,
	db: Database = getDatabase(),
): Promise<OAuthStartResult> {
	if (provider === "kimi") return startKimiDevice(db);

	const stateId = randomId();
	const state = crypto.randomBytes(16).toString("hex");
	const { verifier, challenge } = createPkce();
	saveState(
		{
			id: stateId,
			provider,
			state,
			verifier,
			device_code: null,
			expires_at: Date.now() + 15 * 60 * 1000,
		},
		db,
	);

	if (provider === "anthropic") {
		const params = new URLSearchParams({
			code: "true",
			client_id: ANTHROPIC_CLIENT_ID,
			response_type: "code",
			redirect_uri: ANTHROPIC_REDIRECT_URI,
			scope: ANTHROPIC_SCOPE,
			code_challenge: challenge,
			code_challenge_method: "S256",
			state,
		});
		return {
			ok: true,
			provider,
			mode: "code",
			stateId,
			authUrl: `${ANTHROPIC_AUTHORIZE_URL}?${params}`,
			instructions:
				"Sign in, then paste the code shown by Claude (code#state).",
		};
	}

	const url = new URL(OPENAI_AUTHORIZE_URL);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("client_id", OPENAI_CLIENT_ID);
	url.searchParams.set("redirect_uri", OPENAI_REDIRECT_URI);
	url.searchParams.set("scope", OPENAI_SCOPE);
	url.searchParams.set("code_challenge", challenge);
	url.searchParams.set("code_challenge_method", "S256");
	url.searchParams.set("state", state);
	url.searchParams.set("id_token_add_organizations", "true");
	url.searchParams.set("codex_cli_simplified_flow", "true");
	url.searchParams.set("originator", "ggcoder");
	return {
		ok: true,
		provider: "openai",
		mode: "code",
		stateId,
		authUrl: url.toString(),
		instructions:
			"Sign in. If localhost cannot load afterward, copy the full callback URL from the address bar and paste it here.",
	};
}

async function startKimiDevice(db: Database): Promise<OAuthStartResult> {
	const response = await fetch(
		`${KIMI_OAUTH_HOST}/api/oauth/device_authorization`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Accept: "application/json",
			},
			body: new URLSearchParams({ client_id: KIMI_CLIENT_ID }).toString(),
		},
	);
	if (!response.ok) {
		return {
			ok: false,
			error: `Kimi authorization failed (${response.status}).`,
		};
	}
	const data = (await response.json()) as {
		user_code?: string;
		device_code?: string;
		verification_uri?: string;
		verification_uri_complete?: string;
		interval?: number;
	};
	if (!data.user_code || !data.device_code || !data.verification_uri) {
		return { ok: false, error: "Kimi authorization response was incomplete." };
	}
	const stateId = randomId();
	const expiresAt = Date.now() + KIMI_DEVICE_TIMEOUT_MS;
	saveState(
		{
			id: stateId,
			provider: "kimi",
			state: null,
			verifier: null,
			device_code: data.device_code,
			expires_at: expiresAt,
		},
		db,
	);
	return {
		ok: true,
		provider: "kimi",
		mode: "device",
		stateId,
		verificationUri: data.verification_uri,
		verificationUriComplete:
			data.verification_uri_complete ?? data.verification_uri,
		userCode: data.user_code,
		intervalSeconds: data.interval ?? 5,
		expiresAt,
	};
}

export async function completeOAuth(
	stateId: string,
	input: string,
	db: Database = getDatabase(),
): Promise<
	{ ok: true; provider: OAuthProviderId } | { ok: false; error: string }
> {
	const row = getState(stateId, db);
	if (!row) return { ok: false, error: "OAuth session expired. Start again." };
	if (row.provider === "kimi") return pollKimi(row, db);
	if (!row.verifier || !row.state) {
		return { ok: false, error: "OAuth session is invalid. Start again." };
	}
	const parsed = parseCodeInput(input);
	if (!parsed.code) return { ok: false, error: "No authorization code found." };
	if (parsed.state && parsed.state !== row.state) {
		return { ok: false, error: "OAuth state mismatch. Start again." };
	}

	const credential = await exchangeCode(
		row.provider,
		parsed.code,
		row.verifier,
		row.state,
	);
	saveProviderOAuthCredential(row.provider, credential, db);
	deleteState(stateId, db);
	return { ok: true, provider: row.provider };
}

export async function completeOAuthCallback(
	provider: OAuthProviderId,
	stateValue: string,
	code: string,
	db: Database = getDatabase(),
): Promise<{ ok: true } | { ok: false; error: string }> {
	const [stateId, state] = stateValue.split(":", 2);
	if (!stateId || !state) return { ok: false, error: "Invalid OAuth state." };
	const row = getState(stateId, db);
	if (
		provider === "kimi" ||
		!row ||
		row.provider !== provider ||
		row.state !== state ||
		!row.verifier
	) {
		return { ok: false, error: "OAuth session expired or mismatched." };
	}
	const credential = await exchangeCode(
		provider,
		code,
		row.verifier,
		row.state,
	);
	saveProviderOAuthCredential(provider, credential, db);
	deleteState(stateId, db);
	return { ok: true };
}

function parseCodeInput(input: string): { code?: string; state?: string } {
	const value = input.trim();
	if (!value) return {};
	try {
		const url = new URL(value);
		return {
			code: url.searchParams.get("code") ?? undefined,
			state: url.searchParams.get("state") ?? undefined,
		};
	} catch {}
	if (value.includes("#")) {
		const [code, state] = value.split("#", 2);
		return { code, state };
	}
	if (value.includes("code=")) {
		const params = new URLSearchParams(value);
		return {
			code: params.get("code") ?? undefined,
			state: params.get("state") ?? undefined,
		};
	}
	return { code: value };
}

async function exchangeCode(
	provider: Exclude<OAuthProviderId, "kimi">,
	code: string,
	verifier: string,
	state: string,
): Promise<ProviderOAuthCredential> {
	if (provider === "openai") return exchangeOpenAI(code, verifier);
	return exchangeAnthropic(code, verifier, state);
}

async function exchangeOpenAI(
	code: string,
	verifier: string,
): Promise<ProviderOAuthCredential> {
	const response = await fetch(OPENAI_TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "authorization_code",
			client_id: OPENAI_CLIENT_ID,
			code,
			redirect_uri: OPENAI_REDIRECT_URI,
			code_verifier: verifier,
		}),
	});
	if (!response.ok) {
		throw new Error(`OpenAI token exchange failed (${response.status}).`);
	}
	const data = (await response.json()) as {
		access_token: string;
		refresh_token: string;
		expires_in: number;
	};
	return {
		accessToken: data.access_token,
		refreshToken: data.refresh_token,
		expiresAt: Date.now() + data.expires_in * 1000,
	};
}

async function exchangeAnthropic(
	code: string,
	verifier: string,
	state: string,
): Promise<ProviderOAuthCredential> {
	let lastError: Error | null = null;
	for (const url of ANTHROPIC_TOKEN_URLS) {
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"anthropic-beta": "oauth-2025-04-20",
			},
			body: JSON.stringify({
				grant_type: "authorization_code",
				client_id: ANTHROPIC_CLIENT_ID,
				code,
				state,
				redirect_uri: ANTHROPIC_REDIRECT_URI,
				code_verifier: verifier,
			}),
		});
		if (response.ok) {
			const data = (await response.json()) as {
				access_token: string;
				refresh_token: string;
				expires_in: number;
			};
			return {
				accessToken: data.access_token,
				refreshToken: data.refresh_token,
				expiresAt: Date.now() + data.expires_in * 1000 - 5 * 60 * 1000,
			};
		}
		lastError = new Error(
			`Anthropic token exchange failed (${response.status}).`,
		);
	}
	throw lastError ?? new Error("Anthropic token exchange failed.");
}

async function pollKimi(
	row: OAuthStateRow,
	db: Database,
): Promise<{ ok: true; provider: "kimi" } | { ok: false; error: string }> {
	if (!row.device_code)
		return { ok: false, error: "Kimi OAuth session is invalid." };
	const response = await fetch(`${KIMI_OAUTH_HOST}/api/oauth/token`, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			Accept: "application/json",
		},
		body: new URLSearchParams({
			client_id: KIMI_CLIENT_ID,
			grant_type: "urn:ietf:params:oauth:grant-type:device_code",
			device_code: row.device_code,
		}).toString(),
	});
	const data = (await response.json().catch(() => ({}))) as {
		access_token?: string;
		refresh_token?: string;
		expires_in?: number;
		error?: string;
		error_description?: string;
	};
	if (!response.ok) {
		if (data.error === "authorization_pending") {
			return {
				ok: false,
				error: "Authorization pending. Finish sign-in, then try again.",
			};
		}
		return {
			ok: false,
			error:
				data.error_description ??
				data.error ??
				`Kimi token polling failed (${response.status}).`,
		};
	}
	if (!data.access_token || !data.refresh_token || !data.expires_in) {
		return { ok: false, error: "Kimi token response was incomplete." };
	}
	saveProviderOAuthCredential(
		"kimi",
		{
			accessToken: data.access_token,
			refreshToken: data.refresh_token,
			expiresAt: Date.now() + data.expires_in * 1000,
			baseURL: KIMI_CODE_BASE_URL,
		},
		db,
	);
	deleteState(row.id, db);
	return { ok: true, provider: "kimi" };
}
