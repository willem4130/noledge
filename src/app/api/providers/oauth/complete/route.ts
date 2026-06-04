import { z } from "zod";
import { completeOAuth } from "@/lib/ai/models/oauth";

const bodySchema = z.object({
	stateId: z.string().min(1),
	input: z.string().default(""),
});

export async function POST(request: Request): Promise<Response> {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return Response.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	const parsed = bodySchema.safeParse(raw);
	if (!parsed.success) {
		return Response.json({ error: "Invalid request" }, { status: 400 });
	}

	try {
		const result = await completeOAuth(parsed.data.stateId, parsed.data.input);
		return Response.json(result, { status: result.ok ? 200 : 422 });
	} catch (error) {
		return Response.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Could not complete OAuth login.",
			},
			{ status: 422 },
		);
	}
}
