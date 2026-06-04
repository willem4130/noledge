import { z } from "zod";
import { getConfig, putSchedule } from "@/lib/ai/automate/store";

/** Return the schedule config + last run timestamp. */
export async function GET(): Promise<Response> {
	const config = getConfig();
	return Response.json({
		scheduleHour: config.scheduleHour,
		timezone: config.timezone,
		lastRunAt: config.lastRunAt,
	});
}

const putSchema = z.object({
	scheduleHour: z.number().int().min(0).max(23).nullable(),
	timezone: z.string().min(1).max(64).nullable(),
});

/** Upsert the schedule hour + timezone. */
export async function PUT(request: Request): Promise<Response> {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return Response.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	const parsed = putSchema.safeParse(raw);
	if (!parsed.success) {
		return Response.json(
			{ error: parsed.error.issues[0]?.message ?? "Invalid request" },
			{ status: 400 },
		);
	}

	putSchedule(parsed.data.scheduleHour, parsed.data.timezone);
	const config = getConfig();
	return Response.json({
		scheduleHour: config.scheduleHour,
		timezone: config.timezone,
		lastRunAt: config.lastRunAt,
	});
}
