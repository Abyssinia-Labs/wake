// A paired app, live: a Convex subscription to `wake:pending` under the
// place's own JWT. An idle subscription costs nothing and nothing polls
// (the pattern's "Cost"). The place key never leaves this process except
// to the app's token route.
import { ConvexClient } from "convex/browser";
import type { PairedApp } from "./config";
import {
  asClaim,
  asSummonses,
  claimRef,
  finishRef,
  type Outcome,
  type PlaceToken,
  pendingRef,
  type Summons,
} from "./contract";
import { isUnpaired, placeToken } from "./http";
import { messageOf } from "./log";
import type { Place } from "./scheduler";

export type LivePlace = {
  place: Place;
  connected(): boolean;
  close(): Promise<void>;
};

export type PlaceEvents = {
  onList: (place: Place, summonses: Summons[]) => void;
  /** The app refused the key: the place was forgotten or its agent stopped. */
  onUnpaired: (domain: string) => void;
  note: (line: string) => void;
};

/** A token with less than this left is fetched again rather than reused. */
const REFRESH_MARGIN_MS = 5 * 60_000;

export function tokenSource(
  app: Pick<PairedApp, "httpBase">,
  key: string,
  fetchToken: typeof placeToken = placeToken,
  now: () => number = Date.now,
): (force: boolean) => Promise<string> {
  let cached: PlaceToken | undefined;
  return async (force) => {
    if (!force && cached && cached.expiresAt - now() > REFRESH_MARGIN_MS) return cached.token;
    cached = await fetchToken(app, key);
    return cached.token;
  };
}

export function connectPlace(app: PairedApp, key: string, events: PlaceEvents): LivePlace {
  const client = new ConvexClient(app.convexUrl);
  const token = tokenSource(app, key);
  let unpaired = false;

  client.setAuth(async ({ forceRefreshToken }) => {
    if (unpaired) return null;
    try {
      return await token(forceRefreshToken);
    } catch (error) {
      if (isUnpaired(error)) {
        unpaired = true;
        events.onUnpaired(app.domain);
        return null;
      }
      events.note(`No token from ${app.domain}: ${messageOf(error)}`);
      return null;
    }
  });

  const place: Place = {
    domain: app.domain,
    claim: async (id) => asClaim(await client.mutation(claimRef, { id })),
    finish: async (outcome: Outcome) => {
      await client.mutation(finishRef, outcome);
    },
  };

  client.onUpdate(
    pendingRef,
    {},
    (value) => {
      try {
        const { summonses, rejected } = asSummonses(value);
        if (rejected > 0) {
          events.note(`${app.domain} listed ${rejected} summons Wake cannot read; update Wake?`);
        }
        events.onList(place, summonses);
      } catch (error) {
        events.note(messageOf(error));
      }
    },
    (error) => events.note(`${app.domain}: ${messageOf(error)}`),
  );

  return {
    place,
    connected: () => client.connectionState().isWebSocketConnected && !unpaired,
    close: () => client.close(),
  };
}
