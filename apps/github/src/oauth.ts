// Signing in with GitHub, as the GitHub App's own user authorization: a
// `state` held in a short cookie against forgery, the code traded for a
// token, the token used once to learn who this is, and then dropped.
import type { BridgeConfig } from "./app";
import { cookieOf, sessionCookie } from "./session";

const STATE = "wake_state";

export async function signIn(config: BridgeConfig): Promise<Response> {
  const state = crypto.randomUUID();
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", config.clientId);
  authorize.searchParams.set("redirect_uri", `${config.origin}/auth/callback`);
  authorize.searchParams.set("state", state);
  return new Response(null, {
    status: 302,
    headers: {
      location: authorize.toString(),
      "set-cookie": `${STATE}=${state}; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  });
}

export async function signInCallback(
  config: BridgeConfig,
  req: Request,
  fetcher: typeof fetch,
): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || state !== cookieOf(req, STATE)) {
    return new Response("That sign-in has expired; start again from the home page.", {
      status: 400,
    });
  }
  const traded = await fetcher("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret, code }),
  });
  const token = ((await traded.json()) as { access_token?: string }).access_token;
  if (!token) return new Response("GitHub didn't sign you in; try again.", { status: 400 });
  const user = (await (
    await fetcher("https://api.github.com/user", {
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "user-agent": "wake-github",
      },
    })
  ).json()) as { id?: number; login?: string };
  if (typeof user.id !== "number" || typeof user.login !== "string") {
    return new Response("GitHub didn't say who you are; try again.", { status: 400 });
  }
  const headers = new Headers({ location: `${config.origin}/pair` });
  headers.append(
    "set-cookie",
    await sessionCookie(config.sessionSecret, { id: user.id, login: user.login }),
  );
  headers.append("set-cookie", `${STATE}=; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  return new Response(null, { status: 303, headers });
}
