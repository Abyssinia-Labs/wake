// Place keys live in the system's own secret store, never in the config
// file, and are never passed on a command line where `ps` could read them:
// the Keychain on macOS, the Secret Service (libsecret) on Linux. A Linux
// machine with no Secret Service running, a server or a container, keeps
// them in a file only its user can read (0600, in Wake's 0700 folder)
// instead, and `wakectl doctor` says which (WAK-6).
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { secrets } from "bun";
import { paths, writeJson } from "./config";

const SERVICE = "dev.abyssinia.wake";

export type KeyStore = {
  get(domain: string): Promise<string | null>;
  set(domain: string, key: string): Promise<void>;
  delete(domain: string): Promise<void>;
};

function keysFile(): string {
  return join(paths().home, "keys.json");
}

async function fileKeys(): Promise<Record<string, string>> {
  try {
    const raw: unknown = JSON.parse(await readFile(keysFile(), "utf8"));
    if (typeof raw !== "object" || raw === null) return {};
    return Object.fromEntries(
      Object.entries(raw).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

/** A store that answers; on Linux with no Secret Service, `Bun.secrets` throws. */
async function systemStore<T>(
  use: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await use() };
  } catch {
    return { ok: false };
  }
}

export const keychain: KeyStore = {
  async get(domain) {
    const kept = await systemStore(() => secrets.get({ service: SERVICE, name: domain }));
    if (kept.ok && kept.value) return kept.value;
    return (await fileKeys())[domain] ?? null;
  },
  async set(domain, key) {
    const kept = await systemStore(() =>
      secrets.set({ service: SERVICE, name: domain, value: key }),
    );
    if (kept.ok) return;
    await writeJson(keysFile(), { ...(await fileKeys()), [domain]: key });
  },
  async delete(domain) {
    await systemStore(() => secrets.delete({ service: SERVICE, name: domain }));
    const keys = await fileKeys();
    if (domain in keys) {
      delete keys[domain];
      await writeJson(keysFile(), keys);
    }
  },
};

/** Where keys are kept on this machine, for doctor. */
export async function keyStoreName(platform = process.platform): Promise<string> {
  if (platform === "darwin") return "the Keychain";
  const probe = await systemStore(() => secrets.get({ service: SERVICE, name: "doctor-probe" }));
  return probe.ok ? "the Secret Service" : "a file only you can read";
}
