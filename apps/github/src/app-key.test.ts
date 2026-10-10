import { expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { appJwt, importAppKey } from "./app-key";

test("signs with a PKCS#1 key as GitHub hands it out, and with PKCS#8", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  for (const type of ["pkcs1", "pkcs8"] as const) {
    const pem = privateKey.export({ type, format: "pem" }).toString();
    const jwt = await appJwt("1234", await importAppKey(pem), 1_800_000_000_000);
    const [head, claims, signature] = jwt.split(".");
    expect(JSON.parse(atob(claims ?? ""))).toEqual({
      iat: 1_799_999_940,
      exp: 1_800_000_540,
      iss: "1234",
    });
    const verifier = await crypto.subtle.importKey(
      "spki",
      publicKey.export({ type: "spki", format: "der" }),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const bytes = Uint8Array.from(
      atob((signature ?? "").replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0),
    );
    expect(
      await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        verifier,
        bytes,
        new TextEncoder().encode(`${head}.${claims}`),
      ),
    ).toBe(true);
  }
});
