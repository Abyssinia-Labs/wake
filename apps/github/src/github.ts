// The GitHub REST calls the bridge makes, as the app's installation: a
// reaction, the run's one status comment, who may push, a pull request's
// branch. Installation tokens are kept until five minutes before they
// expire. `fetch` is passed in, so the tests answer for GitHub.
import { appJwt, importAppKey } from "./app-key";

export type GitHubConfig = { appId: string; privateKey: string; api?: string };

export type GitHub = {
  react(installation: number, path: string, content: "eyes" | "confused"): Promise<void>;
  comment(installation: number, repo: string, number: number, body: string): Promise<number>;
  editComment(installation: number, repo: string, id: number, body: string): Promise<void>;
  /** `admin`, `maintain`, `write`, `triage`, `read` or `none`. */
  permission(installation: number, repo: string, login: string): Promise<string>;
  pull(
    installation: number,
    repo: string,
    number: number,
  ): Promise<{ head: string; headRepo: string | null }>;
};

export function gitHub(config: GitHubConfig, fetcher: typeof fetch = fetch): GitHub {
  const api = (config.api ?? "https://api.github.com").replace(/\/+$/, "");
  const tokens = new Map<number, { token: string; until: number }>();
  let key: Promise<CryptoKey> | undefined;

  const headers = (auth: string) => ({
    authorization: auth,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "wake-github",
  });

  const tokenFor = async (installation: number): Promise<string> => {
    const kept = tokens.get(installation);
    if (kept && kept.until > Date.now()) return kept.token;
    key ??= importAppKey(config.privateKey);
    const jwt = await appJwt(config.appId, await key);
    const res = await fetcher(`${api}/app/installations/${installation}/access_tokens`, {
      method: "POST",
      headers: headers(`Bearer ${jwt}`),
    });
    if (!res.ok) throw new Error(`GitHub refused an installation token: ${res.status}`);
    const body = (await res.json()) as { token: string; expires_at: string };
    tokens.set(installation, {
      token: body.token,
      until: Date.parse(body.expires_at) - 5 * 60_000,
    });
    return body.token;
  };

  const call = async (installation: number, method: string, path: string, body?: unknown) => {
    const res = await fetcher(`${api}${path}`, {
      method,
      headers: {
        ...headers(`Bearer ${await tokenFor(installation)}`),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!res.ok && res.status !== 404)
      throw new Error(`GitHub answered ${res.status} to ${method} ${path}`);
    return res;
  };

  return {
    async react(installation, path, content) {
      await call(installation, "POST", `${path}/reactions`, { content });
    },
    async comment(installation, repo, number, body) {
      const res = await call(installation, "POST", `/repos/${repo}/issues/${number}/comments`, {
        body,
      });
      return ((await res.json()) as { id: number }).id;
    },
    async editComment(installation, repo, id, body) {
      await call(installation, "PATCH", `/repos/${repo}/issues/comments/${id}`, { body });
    },
    async permission(installation, repo, login) {
      const res = await call(
        installation,
        "GET",
        `/repos/${repo}/collaborators/${encodeURIComponent(login)}/permission`,
      );
      if (res.status === 404) return "none";
      return ((await res.json()) as { permission?: string }).permission ?? "none";
    },
    async pull(installation, repo, number) {
      const res = await call(installation, "GET", `/repos/${repo}/pulls/${number}`);
      const pr = (await res.json()) as {
        head?: { ref?: string; repo?: { full_name?: string } | null };
      };
      return { head: pr.head?.ref ?? "", headRepo: pr.head?.repo?.full_name ?? null };
    },
  };
}

/** Who may summon on a repository: someone who can push the branch the run works on. */
export function canPush(permission: string): boolean {
  return permission === "admin" || permission === "maintain" || permission === "write";
}
