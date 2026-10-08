// Place keys live in the macOS Keychain, never in the config file, and are
// never passed on a command line where `ps` could read them.
import { secrets } from "bun";

const SERVICE = "dev.abyssinia.wake";

export type KeyStore = {
  get(domain: string): Promise<string | null>;
  set(domain: string, key: string): Promise<void>;
  delete(domain: string): Promise<void>;
};

export const keychain: KeyStore = {
  get: (domain) => secrets.get({ service: SERVICE, name: domain }),
  set: (domain, key) => secrets.set({ service: SERVICE, name: domain, value: key }),
  delete: async (domain) => {
    await secrets.delete({ service: SERVICE, name: domain });
  },
};
