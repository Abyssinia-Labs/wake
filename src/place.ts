// A paired app, live: a Convex subscription to `wake:pending` with the place
// key as its argument. The key is the whole credential (the pattern's
// contract, as amended on 2026-10-08): nobody signs in, and each of the three
// functions finds the place by the key's hash. An idle subscription costs
// nothing and nothing polls (the pattern's "Cost").
import { ConvexClient } from "convex/browser";
import { ConvexError } from "convex/values";
import type { PairedApp } from "./config";
import {
  asClaim,
  asSummonses,
  claimRef,
  finishRef,
  type Outcome,
  pendingRef,
  type Summons,
  UNPAIRED,
} from "./contract";
import { messageOf } from "./log";
import type { Place } from "./scheduler";

export type LivePlace = {
  place: Place;
  connected(): boolean;
  close(): Promise<void>;
};

export type PlaceEvents = {
  onList: (place: Place, summonses: Summons[]) => void;
  /** The app refused the key: the place was forgotten or its agent revoked. */
  onUnpaired: (domain: string) => void;
  note: (line: string) => void;
};

/** Whether an error from a wake:* function means the key opens nothing now. */
export function isUnpairedError(error: unknown): boolean {
  if (error instanceof ConvexError) return error.data === UNPAIRED;
  return error instanceof Error && error.message.includes(UNPAIRED);
}

export function connectPlace(app: PairedApp, key: string, events: PlaceEvents): LivePlace {
  const client = new ConvexClient(app.convexUrl);
  let unpaired = false;

  const refused = (error: unknown): boolean => {
    if (!isUnpairedError(error)) return false;
    if (!unpaired) {
      unpaired = true;
      events.onUnpaired(app.domain);
    }
    return true;
  };

  const place: Place = {
    domain: app.domain,
    claim: async (id) => {
      try {
        return asClaim(await client.mutation(claimRef, { key, id }));
      } catch (error) {
        // A key that stopped working loses every race from here on.
        if (refused(error)) return { claimed: false };
        throw error;
      }
    },
    finish: async (outcome: Outcome) => {
      try {
        await client.mutation(finishRef, { ...outcome, key });
      } catch (error) {
        if (!refused(error)) throw error;
      }
    },
  };

  client.onUpdate(
    pendingRef,
    { key },
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
    (error) => {
      if (!refused(error)) events.note(`${app.domain}: ${messageOf(error)}`);
    },
  );

  return {
    place,
    connected: () => client.connectionState().isWebSocketConnected && !unpaired,
    close: () => client.close(),
  };
}
