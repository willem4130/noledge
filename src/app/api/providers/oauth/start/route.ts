import { z } from "zod";
import { isOAuthProvider, startOAuth } from "@/lib/ai/models/oauth";
import { PROVIDER_IDS } from "@/lib/ai/models/types";

const bodySchema = z.object({ provider: z.enum(PROVIDER_IDS) });

export async function POST(request: Request): Promise<Response> {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return Response.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	const parsed = bodySchema.safeParse(raw);
	if (!parsed.success) {
		return Response.json({ error: "Unknown provider" }, { status: 400 });
	}
	if (!isOAuthProvider(parsed.data.provider)) {
		return Response.json(
			{ error: "OAuth is not available for this provider." },
			{ status: 400 },
		);
	}

	try {
		const result = await startOAuth(parsed.data.provider);
		return Response.json(result, { status: result.ok ? 200 : 502 });
	} catch (error) {
		return Response.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Could not start OAuth login.",
			},
			{ status: 502 },
		);
	}
}
