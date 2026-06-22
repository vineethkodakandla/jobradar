import { NextResponse } from "next/server";
import { GATE_COOKIE, GATE_MAX_AGE_S, checkCode, freshToken } from "@/lib/gate";

/** Submit the access code. Body: { code: string } */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code : "";

  if (!code || !checkCode(code)) {
    return NextResponse.json({ ok: false, error: "Incorrect code." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(GATE_COOKIE, await freshToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GATE_MAX_AGE_S,
  });
  return res;
}

/** Lock again (sign out). */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(GATE_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
