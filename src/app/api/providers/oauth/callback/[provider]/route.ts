import { completeOAuthCallback, isOAuthProvider } from "@/lib/ai/models/oauth";

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ provider: string }> },
): Promise<Response> {
	const { provider } = await params;
	if (!isOAuthProvider(provider)) {
		return html("Unknown OAuth provider.", false);
	}

	const url = new URL(request.url);
	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");
	if (!code || !state) {
		return html("OAuth callback was missing code or state.", false);
	}

	try {
		const result = await completeOAuthCallback(provider, state, code);
		return html(
			result.ok
				? "Login complete. You can close this tab and return to noledge."
				: result.error,
			result.ok,
		);
	} catch (error) {
		return html(
			error instanceof Error ? error.message : "OAuth login failed.",
			false,
		);
	}
}

function html(message: string, ok: boolean): Response {
	return new Response(
		`<!doctype html><html><body style="font-family: system-ui; padding: 2rem;"><h1>${ok ? "Success" : "OAuth failed"}</h1><p>${escapeHtml(message)}</p></body></html>`,
		{
			status: ok ? 200 : 400,
			headers: { "Content-Type": "text/html; charset=utf-8" },
		},
	);
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}
