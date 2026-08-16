import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifyIdToken } from "@/lib/firebase/server";

/**
 * Session cookie bridge. The browser SDK holds the Firebase session; the server
 * needs the ID token in a cookie to resolve the user in server components,
 * route handlers, and the proxy.
 *
 * POST   { idToken } — verify it, then store it httpOnly. An unverifiable token
 *                      is rejected (401) rather than trusted and stored.
 * DELETE             — clear the cookie (sign-out).
 */
export async function POST(request: NextRequest) {
  let idToken: string | undefined;
  try {
    ({ idToken } = (await request.json()) as { idToken?: string });
  } catch {
    return NextResponse.json({ error: "Malformed body." }, { status: 400 });
  }

  const user = await verifyIdToken(idToken);
  if (!user) {
    return NextResponse.json({ error: "Invalid token." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, user_id: user.id });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: idToken as string,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // Firebase ID tokens expire after 1h; the browser refreshes and re-POSTs
    // well before that, so the cookie never outlives the token it carries.
    maxAge: 60 * 60,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    path: "/",
    maxAge: 0,
  });
  return response;
}
