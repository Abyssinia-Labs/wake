// The two secrets of wake/v1 (the spec's "Pairing"). Making one needs real
// randomness, so `newPlaceKey` and `newPairCode` run in actions and HTTP
// actions only (the client's `issueCode` and the pair route); the
// component's queries and mutations only hash and compare. One SHA-256 of a
// short random string is microseconds and deterministic: it is no password
// hash, and it is fine in a query.

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
export const CODE_TTL_MS = 10 * 60_000;
export const KEY_SHAPE = /^[\x21-\x7e]{16,512}$/;

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** 256 bits, with the app's prefix so a leaked key says whose it is. */
export function newPlaceKey(prefix = "wk_"): string {
  return `${prefix}${hex(crypto.getRandomValues(new Uint8Array(32)))}`;
}

/** `K7QD-2M9X`: eight characters, about 39 bits, one use, ten minutes. */
export function newPairCode(): string {
  // Bytes past the last whole multiple of the alphabet are drawn again, so
  // every letter is as likely as every other.
  const limit = 256 - (256 % CODE_ALPHABET.length);
  const chars: string[] = [];
  while (chars.length < 8) {
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
      if (byte < limit && chars.length < 8)
        chars.push(CODE_ALPHABET[byte % CODE_ALPHABET.length] ?? "A");
    }
  }
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

/** As a person may type it: case and the dash don't matter. */
export function normalizeCode(code: string): string {
  const bare = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return bare.length === 8 ? `${bare.slice(0, 4)}-${bare.slice(4)}` : bare;
}

export async function hashSecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return hex(new Uint8Array(digest));
}
