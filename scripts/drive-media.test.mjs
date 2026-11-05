import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { driveClient } from "./drive-media.mjs";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const credentials = JSON.stringify({ client_email: "fixture@example.invalid", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) });

test("Drive client requests read-only access, reads all metadata pages, and downloads original bytes", async () => {
  const calls = [];
  const client = await driveClient(credentials, async (input, options) => {
    const url = new URL(input);
    calls.push(url);
    if (url.hostname === "oauth2.googleapis.com") {
      const claims = JSON.parse(Buffer.from(options.body.get("assertion").split(".")[1], "base64url"));
      assert.equal(claims.scope, "https://www.googleapis.com/auth/drive.readonly");
      return Response.json({ access_token: "fixture", expires_in: 3600 });
    }
    assert.equal(options.headers.authorization, "Bearer fixture");
    if (url.pathname.endsWith("/files/one")) {
      assert.equal(url.searchParams.get("alt"), "media");
      return new Response("original bytes");
    }
    assert.match(url.searchParams.get("fields"), /md5Checksum/);
    return Response.json(url.searchParams.has("pageToken")
      ? { files: [{ id: "two", md5Checksum: "b".repeat(32) }] }
      : { nextPageToken: "next", files: [{ id: "one", md5Checksum: "a".repeat(32) }] });
  });
  assert.deepEqual([...(await client.list()).keys()], ["one", "two"]);
  assert.equal((await client.download("one")).toString(), "original bytes");
  assert.equal(calls.filter(url => url.hostname === "oauth2.googleapis.com").length, 1);
});

test("incomplete metadata and denied original download stop publication; invalid credential errors omit values", async () => {
  const client = await driveClient(credentials, async input => {
    const url = new URL(input);
    if (url.hostname === "oauth2.googleapis.com") return Response.json({ access_token: "fixture" });
    if (url.pathname.endsWith("/files/one")) return new Response("private", { status: 403 });
    return Response.json({ incompleteSearch: true, files: [] });
  });
  await assert.rejects(client.list(), /불완전/);
  await assert.rejects(client.download("one"), /HTTP 403/);
  await assert.rejects(driveClient("sensitive-not-json"), error => !error.message.includes("sensitive-not-json"));
});
