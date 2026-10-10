// A webhook's JSON is `unknown` until narrowed here: only the fields the
// bridge reads, each checked, so a field GitHub drops or renames is a
// skipped event rather than a crash.

export type Obj = Record<string, unknown>;

export function obj(v: unknown): Obj | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : null;
}

export function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

export function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export type Person = { id: number; login: string };
export type Repo = { id: number; fullName: string };
export type Issue = { number: number; title: string; url: string; isPull: boolean };

export function personOf(v: unknown): Person | null {
  const o = obj(v);
  const id = num(o?.id);
  const login = str(o?.login);
  // An app or a bot (dependabot, this bridge) never summons anyone.
  if (id === null || !login || str(o?.type) === "Bot") return null;
  return { id, login };
}

export function repoOf(v: unknown): Repo | null {
  const o = obj(v);
  const id = num(o?.id);
  const fullName = str(o?.full_name);
  return id !== null && fullName ? { id, fullName } : null;
}

export function issueOf(v: unknown): Issue | null {
  const o = obj(v);
  const number = num(o?.number);
  const title = str(o?.title);
  const url = str(o?.html_url);
  if (number === null || title === null || !url) return null;
  return { number, title, url, isPull: obj(o?.pull_request) !== null || str(o?.head) !== null };
}

export function installationOf(payload: Obj): number | null {
  return num(obj(payload.installation)?.id);
}
