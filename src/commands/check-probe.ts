// What `wakectl check`'s probes share: each calls the app with something it
// must refuse and says whether it did, the way the spec says it must.
import { messageOf } from "../log";
import { isUnpairedError } from "../place";

export type Probe = { what: string; ok: boolean; detail?: string };

/** A key of the right shape that no app ever issued. */
export const NOBODY = `wk_${"0".repeat(64)}`;

/** The `error` of a JSON body, if it has one; a stream or no body has none. */
async function errorOf(res: Response): Promise<string | undefined> {
  try {
    const code = ((await res.json()) as { error?: unknown }).error;
    return typeof code === "string" ? code : undefined;
  } catch {
    return undefined;
  }
}

const answered = (status: number, code?: string): string =>
  `answered ${status}${code ? ` ${code}` : ""}`;

export async function expectStatus(
  what: string,
  call: () => Promise<Response>,
  status: number,
  error?: string,
): Promise<Probe> {
  try {
    const res = await call();
    const code = await errorOf(res);
    const ok = res.status === status && (error === undefined || code === error);
    return { what, ok, ...(ok ? {} : { detail: answered(res.status, code) }) };
  } catch (e) {
    return { what, ok: false, detail: messageOf(e) };
  }
}

/**
 * A route that must answer 401 unpaired. An optional one may answer 404
 * instead, and `optional` says what Wake does without it.
 */
export async function expectRefused(
  what: string,
  call: () => Promise<Response>,
  optional?: string,
): Promise<Probe> {
  try {
    const res = await call();
    const code = await errorOf(res);
    if (res.status === 401 && code === "unpaired") return { what, ok: true };
    if (optional !== undefined && res.status === 404) {
      return { what: what.replace(/ refuses .*$/, " isn't served"), ok: true, detail: optional };
    }
    return { what, ok: false, detail: answered(res.status, code) };
  } catch (error) {
    return { what, ok: false, detail: messageOf(error) };
  }
}

/**
 * A function that must throw UNPAIRED. An optional one passes either way:
 * Wake does without it, and a production deployment won't say whether it
 * is missing or failed.
 */
export async function expectUnpaired(
  what: string,
  call: () => Promise<unknown>,
  optional?: string,
): Promise<Probe> {
  try {
    await call();
    return { what, ok: false, detail: "answered instead of throwing UNPAIRED" };
  } catch (error) {
    if (isUnpairedError(error)) return { what, ok: true };
    if (optional !== undefined) {
      return {
        what: what.replace(/ throws UNPAIRED$/, " isn't served"),
        ok: true,
        detail: optional,
      };
    }
    return { what, ok: false, detail: messageOf(error) };
  }
}

/** Several probes as one line: ok when each is, saying which weren't, or what each noted. */
export function together(what: string, probes: Probe[], note?: string): Probe {
  const failed = probes.filter((probe) => !probe.ok);
  const said = (failed.length > 0 ? failed : probes.filter((probe) => probe.detail))
    .map((probe) => `${probe.what}: ${probe.detail ?? "failed"}`)
    .concat(failed.length === 0 && note ? [note] : []);
  return { what, ok: failed.length === 0, ...(said.length > 0 ? { detail: said.join("; ") } : {}) };
}
