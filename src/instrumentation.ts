/**
 * Next.js instrumentation hook: `register()` runs once per server instance. We
 * use it to start the in-process automation scheduler on the Node.js runtime so
 * scheduled RSS/YouTube polling begins as soon as the server is ready.
 */
export async function register(): Promise<void> {
	if (process.env.NEXT_RUNTIME !== "nodejs") return;
	const { startScheduler } = await import("@/lib/ai/automate/scheduler");
	startScheduler();
}
