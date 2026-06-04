import { runPoll } from "./poll";
import { shouldRunNow } from "./schedule";
import { getConfig } from "./store";

/**
 * In-process scheduler for the self-hosted, single-user app. A periodic timer
 * wakes every few minutes and runs the poller when {@link shouldRunNow} says the
 * configured local hour has arrived and today's run hasn't happened yet.
 *
 * Caveat: this only fires while the Next server process is alive. For always-on
 * hosts that's sufficient; otherwise the protected `POST /api/automate/run` route
 * lets an external cron drive the same `runPoll`.
 *
 * State is module-level by necessity (one timer per server instance); it is kept
 * minimal: the interval handle and an `isPolling` lock that prevents overlap.
 */

const WAKE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let timer: ReturnType<typeof setInterval> | null = null;
let isPolling = false;

/** Run one scheduled tick: poll only if due, guarding against overlap. */
async function tick(): Promise<void> {
	if (isPolling) return;
	let config: ReturnType<typeof getConfig>;
	try {
		config = getConfig();
	} catch {
		return; // DB not ready yet — try again next wake.
	}
	if (!shouldRunNow(config)) return;

	isPolling = true;
	try {
		await runPoll();
	} catch (error) {
		console.error("[automate] scheduled poll failed:", error);
	} finally {
		isPolling = false;
	}
}

/**
 * Start the scheduler. Idempotent — a second call while a timer is already armed
 * is a no-op. Only runs on the Node.js runtime (the timer + sqlite need it).
 */
export function startScheduler(): void {
	if (timer !== null) return;
	if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") return;

	timer = setInterval(() => {
		void tick();
	}, WAKE_INTERVAL_MS);
	// Don't keep the event loop alive solely for the scheduler.
	if (typeof timer.unref === "function") timer.unref();
}

/** Stop the scheduler (used in tests / graceful shutdown). */
export function stopScheduler(): void {
	if (timer !== null) {
		clearInterval(timer);
		timer = null;
	}
}
