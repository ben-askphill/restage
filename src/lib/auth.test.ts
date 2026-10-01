import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { checkOwner } from "./auth";

const env = process.env as Record<string, string | undefined>;
const original = { ...env };

function request(init: { method?: string; auth?: string; site?: string } = {}) {
  const headers = new Headers();
  if (init.auth) {
    headers.set("authorization", `Basic ${Buffer.from(init.auth).toString("base64")}`);
  }
  if (init.site) headers.set("sec-fetch-site", init.site);
  return new Request("http://localhost/api/render", {
    method: init.method ?? "POST",
    headers,
  });
}

afterEach(() => {
  for (const key of ["OWNER_PASSWORD", "OWNER_USER", "NODE_ENV"]) {
    if (original[key] === undefined) delete env[key];
    else env[key] = original[key];
  }
});

describe("checkOwner", () => {
  it("fails closed in production without a password", () => {
    delete env.OWNER_PASSWORD;
    env.NODE_ENV = "production";
    assert.deepEqual(checkOwner(request()), {
      ok: false,
      status: 503,
      message: "OWNER_PASSWORD is not configured.",
    });
  });

  it("stays open in development without a password", () => {
    delete env.OWNER_PASSWORD;
    env.NODE_ENV = "development";
    assert.equal(checkOwner(request()).ok, true);
  });

  it("requires credentials once a password is set", () => {
    env.OWNER_PASSWORD = "secret";
    const result = checkOwner(request());
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.status, 401);
  });

  it("rejects the wrong password and accepts the right one", () => {
    env.OWNER_PASSWORD = "secret";
    assert.equal(checkOwner(request({ auth: "owner:nope" })).ok, false);
    assert.equal(checkOwner(request({ auth: "owner:secret" })).ok, true);
  });

  it("honours a custom username", () => {
    env.OWNER_PASSWORD = "secret";
    env.OWNER_USER = "ben";
    assert.equal(checkOwner(request({ auth: "owner:secret" })).ok, false);
    assert.equal(checkOwner(request({ auth: "ben:secret" })).ok, true);
  });

  it("blocks cross-site writes even with valid credentials", () => {
    env.OWNER_PASSWORD = "secret";
    const result = checkOwner(
      request({ auth: "owner:secret", site: "cross-site" }),
    );
    assert.equal(!result.ok && result.status, 403);
    assert.equal(
      checkOwner(
        request({ method: "GET", auth: "owner:secret", site: "cross-site" }),
      ).ok,
      true,
    );
  });
});
