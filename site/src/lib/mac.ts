// Wake for Mac's newest build, read from the download bucket's mac.json when
// the site is built, as the changelogs are read from the repository's files.
// Wake.dmg always serves the newest build, so the link holds between deploys
// and only the version and size beside it date from the build. The bucket
// sends no CORS headers, so a page couldn't refresh them itself.

/** The newest build's DMG, whatever its version. */
export const macDownload = "https://downloads.wakectl.dev/Wake.dmg";
const manifest = "https://downloads.wakectl.dev/mac.json";

/** What the site shows of a build. mac.json also has its build number, SHA-256 and own URL. */
export type MacBuild = { version: string; sizeBytes: number; minimumSystem: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asMacBuild(v: unknown): MacBuild | null {
  if (!isRecord(v)) return null;
  const { version, sizeBytes, minimumSystem } = v;
  if (typeof version !== "string" || !/^[\w.-]{1,32}$/.test(version)) return null;
  if (typeof sizeBytes !== "number" || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    return null;
  }
  if (typeof minimumSystem !== "string" || !/^\d{1,3}(\.\d{1,3}){0,2}$/.test(minimumSystem)) {
    return null;
  }
  return { version, sizeBytes, minimumSystem };
}

async function read(): Promise<MacBuild | null> {
  try {
    const response = await fetch(manifest, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`it answered ${response.status}`);
    const build = asMacBuild(await response.json());
    if (!build) throw new Error("it isn't the shape the site reads");
    return build;
  } catch (error) {
    // Unlike a broken changelog, this doesn't fail the build: the download
    // works without them, and a pull request here shouldn't fail on a bucket
    // another repository publishes to.
    const why = error instanceof Error ? error.message : String(error);
    console.warn(`The Mac download shows no version or size: mac.json couldn't be read (${why}).`);
    return null;
  }
}

/** The newest build as this build of the site read it, or null when mac.json couldn't be read. */
export const macBuild = await read();

/** The oldest macOS it opens on, as a person names it: "26.0" is macOS 26. */
export function macOS(build: MacBuild | null): string {
  return `macOS ${(build?.minimumSystem ?? "26.0").replace(/(\.0)+$/, "")}`;
}

/** A size as Finder shows it, in decimal megabytes: 47,575,797 bytes is 47.6 MB. */
export function megabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}
