import { Innertube } from "youtubei.js";

/**
 * Process-wide singleton InnerTube client (LuanRT/YouTube.js). Creating a client
 * negotiates a session, so we do it once and share it across channel resolution,
 * video listing, and transcript fetching.
 *
 * `generate_session_locally` derives the session without an extra network round
 * trip. On failure the cached promise is cleared so a later call can retry rather
 * than being stuck with a rejected singleton.
 */

let clientPromise: Promise<Innertube> | null = null;

export function getYoutubeClient(): Promise<Innertube> {
	if (!clientPromise) {
		clientPromise = Innertube.create({ generate_session_locally: true }).catch(
			(error: unknown) => {
				clientPromise = null;
				throw error;
			},
		);
	}
	return clientPromise;
}
