// Who is signed in, as a cookie the bridge signs (HMAC-SHA-256): the GitHub
// user's id and login, and when it lapses. Nothing else is kept about them.

export type Session = { id: number; login: string };

const DAY = 24 * 60 * 60_000;

async function hmac(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(mac))).replace(
    /[+/=]/g,
    (c) => ({ "+": "-", "/": "_", "=": "" })[c] ?? "",
  );
}

export async function sessionCookie(
  secret: string,
  who: Session,
  now = Date.now(),
): Promise<string> {
  const value = `${who.id}.${encodeURIComponent(who.login)}.${now + 30 * DAY}`;
  const signed = `${value}.${await hmac(secret, value)}`;
  return `wake_session=${signed}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 3600}`;
}

export function cookieOf(req: Request, name: string): string | null {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

export async function sessionOf(
  secret: string,
  req: Request,
  now = Date.now(),
): Promise<Session | null> {
  const raw = cookieOf(req, "wake_session");
  const [id, login, until, mac] = raw?.split(".") ?? [];
  if (!id || !login || !until || !mac) return null;
  if (mac !== (await hmac(secret, `${id}.${login}.${until}`)) || Number(until) < now) return null;
  return { id: Number(id), login: decodeURIComponent(login) };
}

export const signedOut = "wake_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
