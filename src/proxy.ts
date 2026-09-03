import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const USER_ID_COOKIE = "ir_watch_uid";

export function proxy(request: NextRequest) {
  if (request.cookies.has(USER_ID_COOKIE)) {
    return NextResponse.next();
  }

  const userId = crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-ir-watch-uid", userId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.cookies.set(USER_ID_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365 * 5,
    path: "/",
  });
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
