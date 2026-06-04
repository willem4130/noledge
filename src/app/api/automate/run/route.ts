import { runPoll } from "@/lib/ai/automate/poll";

/**
 * Trigger a poll now. Backs the "Sync now" button and can be driven by an
 * external cron for hosts where the in-process scheduler isn't reliable. Returns
 * the aggregate summary. Long-running for many sources — acceptable for the
 * single-user, self-hosted model.
 */
export async function POST(request: Request): Promise<Response> {
	const summary = await runPoll({ signal: request.signal });
	return Response.json(summary);
}
