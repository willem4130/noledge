import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Cross-origin / DNS-rebinding guard for the unauthenticated `/api/*` routes.
 *
 * This is a local-first, single-user app with no auth by design. Next.js'
 * built-in cross-site protection only covers internal `/_next`/`/__nextjs`
 * endpoints, so application route handlers under `/api/*` would otherwise be
 * reachable from any web page the user happens to have open (CSRF via
 * CORS-"simple" requests) or via DNS-rebinding. This proxy closes that gap by
 * rejecting any request that isn't a genuine same-origin call to a loopback
 * host.
 *
 * Defenses (any failure -> 403):
 *  (a) Origin header, when present, must have the same host as the `Host`
 *      header. Defeats CSRF "simple" POSTs (multipart/form-data, text/plain)
 *      from foreign origins, which always carry an `Origin`.
 *  (b) Sec-Fetch-Site, when present, must be `same-origin`, `same-site`, or
 *      `none` (direct navigation / address bar). `cross-site` is rejected.
 *  (c) The `Host` must be a loopback name (`localhost`, `127.0.0.1`, `[::1]`),
 *      optionally with a port. Defeats DNS-rebinding, where an attacker points
 *      a domain they control at 127.0.0.1 to bypass the same-origin checks.
 */

const ALLOWED_HOSTNAMES: ReadonlySet<string> = new Set([
	"localhost",
	"127.0.0.1",
	"[::1]",
	"::1",
]);

const ALLOWED_FETCH_SITES: ReadonlySet<string> = new Set([
	"same-origin",
	"same-site",
	"none",
]);

/** Extract the bare hostname (no port) from a `Host` header value. */
function hostnameOf(hostHeader: string): string {
	const value = hostHeader.trim().toLowerCase();
	// IPv6 literal, e.g. "[::1]" or "[::1]:3000".
	if (value.startsWith("[")) {
		const end = value.indexOf("]");
		return end === -1 ? value : value.slice(0, end + 1);
	}
	// "host" or "host:port".
	const colon = value.indexOf(":");
	return colon === -1 ? value : value.slice(0, colon);
}

function forbidden(reason: string): NextResponse {
	return NextResponse.json(
		{ error: "Forbidden", reason },
		{ status: 403, headers: { "Cache-Control": "no-store" } },
	);
}

export function proxy(request: NextRequest): NextResponse {
	const host = request.headers.get("host") ?? "";

	// (c) DNS-rebinding: only serve loopback hosts.
	if (!ALLOWED_HOSTNAMES.has(hostnameOf(host))) {
		return forbidden("host");
	}

	// (a) CSRF: a cross-origin request carries an Origin whose host differs.
	const origin = request.headers.get("origin");
	if (origin !== null) {
		let originHost: string;
		try {
			originHost = new URL(origin).host;
		} catch {
			// Opaque/"null" origins are treated as cross-origin.
			return forbidden("origin");
		}
		if (originHost.toLowerCase() !== host.toLowerCase()) {
			return forbidden("origin");
		}
	}

	// (b) Fetch metadata: reject explicit cross-site requests.
	const secFetchSite = request.headers.get("sec-fetch-site");
	if (secFetchSite !== null && !ALLOWED_FETCH_SITES.has(secFetchSite)) {
		return forbidden("sec-fetch-site");
	}

	return NextResponse.next();
}

export const config = {
	matcher: "/api/:path*",
};
