// Signing as the GitHub App: a ten-minute JWT (RS256) from the app's
// private key, with Web Crypto so it runs on Workers as on Bun. GitHub
// hands out PKCS#1 keys (`BEGIN RSA PRIVATE KEY`) and Web Crypto reads only
// PKCS#8, so a PKCS#1 key is wrapped in the PKCS#8 envelope first.

function der(tag: number, body: Uint8Array): Uint8Array {
  const n = body.length;
  const length =
    n < 0x80
      ? [n]
      : n < 0x100
        ? [0x81, n]
        : n < 0x10000
          ? [0x82, n >> 8, n & 0xff]
          : [0x83, n >> 16, (n >> 8) & 0xff, n & 0xff];
  return new Uint8Array([tag, ...length, ...body]);
}

/** PrivateKeyInfo { version 0, rsaEncryption, OCTET STRING pkcs1 }. */
function pkcs8Of(pkcs1: Uint8Array): Uint8Array {
  const version = new Uint8Array([0x02, 0x01, 0x00]);
  const algorithm = new Uint8Array([
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
  ]);
  return der(0x30, new Uint8Array([...version, ...algorithm, ...der(0x04, pkcs1)]));
}

function base64url(bytes: Uint8Array | string): string {
  const raw = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  let text = "";
  for (const byte of raw) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function importAppKey(pem: string): Promise<CryptoKey> {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  const pkcs8 = pem.includes("BEGIN RSA PRIVATE KEY") ? pkcs8Of(bytes) : bytes;
  return await crypto.subtle.importKey(
    "pkcs8",
    new Uint8Array(pkcs8),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/** The app's JWT: issued a minute back for clock skew, good for nine. */
export async function appJwt(appId: string, key: CryptoKey, nowMs = Date.now()): Promise<string> {
  const now = Math.floor(nowMs / 1000);
  const head = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: appId }));
  const signed = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${head}.${claims}`),
  );
  return `${head}.${claims}.${base64url(new Uint8Array(signed))}`;
}
