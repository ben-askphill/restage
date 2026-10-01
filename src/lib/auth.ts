import { createHash, timingSafeEqual } from "node:crypto";

// Optional single-owner access check shared by src/proxy.ts and every API route.
// HTTP Basic auth against OWNER_USER (default "owner") and OWNER_PASSWORD.
// With no password set, the app stays open.

export type OwnerCheck =
  | { ok: true }
  | { ok: false; status: 401 | 403; message: string };

const REALM = 'Basic realm="Restage", charset="UTF-8"';

function sha256(value: string) {
  return createHash("sha256").update(value).digest();
}

function isSafeMethod(method: string) {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

export function checkOwner(request: Request): OwnerCheck {
  const password = process.env.OWNER_PASSWORD;

  if (!password) return { ok: true };

  // Cached Basic credentials ride along on cross-site requests, so block
  // state-changing requests that come from another site.
  if (
    !isSafeMethod(request.method) &&
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    return { ok: false, status: 403, message: "Cross-site request blocked" };
  }

  const header = request.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) {
    return { ok: false, status: 401, message: "Authentication required" };
  }

  const supplied = Buffer.from(encoded, "base64").toString("utf8");
  const expected = `${process.env.OWNER_USER || "owner"}:${password}`;
  // Hash both sides so the comparison is constant-time regardless of length.
  if (!timingSafeEqual(sha256(supplied), sha256(expected))) {
    return { ok: false, status: 401, message: "Authentication required" };
  }

  return { ok: true };
}

export function ownerErrorResponse(
  check: Exclude<OwnerCheck, { ok: true }>,
  body: "json" | "text" = "json",
) {
  const headers = new Headers();
  if (check.status === 401) headers.set("WWW-Authenticate", REALM);

  if (body === "text") {
    return new Response(check.message, { status: check.status, headers });
  }
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify({ error: check.message }), {
    status: check.status,
    headers,
  });
}
