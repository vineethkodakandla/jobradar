// ============================================================================
// Access-code gate. JobRadar's front door: a visitor enters a code; the server
// (never the browser) checks it and, on success, sets a signed HMAC cookie.
// The code itself is an env var and is never shipped to the client bundle.
//
// Runtime-agnostic (Web Crypto + btoa) so it works in BOTH the Edge middleware
// and Node route handlers. Server-use only — do not import into a client
// component (the secret/code come from non-NEXT_PUBLIC env).
// ============================================================================

export const GATE_COOKIE = "jr_gate";
export const GATE_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

function accessCode(): string {
  return process.env.ACCESS_CODE ?? "280902";
}

function secret(): string {
  return (
    process.env.GATE_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "jobradar-dev-secret-change-me"
  );
}

/** Constant-time-ish string compare (length leak is acceptable for a short code). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function checkCode(input: string): boolean {
  return safeEqual(input.trim(), accessCode());
}

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return base64url(new Uint8Array(sig));
}

/** Mint a signed token that expires GATE_MAX_AGE_S from now. */
export async function freshToken(): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + GATE_MAX_AGE_S;
  const payload = String(exp);
  return `${payload}.${await hmac(payload)}`;
}

/** Verify a cookie token: valid signature AND not expired. */
export async function verifyToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot < 1) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmac(payload);
  if (!safeEqual(sig, expected)) return false;
  const exp = parseInt(payload, 10);
  return Number.isFinite(exp) && exp * 1000 > Date.now();
}
