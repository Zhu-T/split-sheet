import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: real authorization happens in lib/authz.ts on every request.
const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

export function proxy(request: NextRequest) {
  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (hasSession) return NextResponse.next();
  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except login, auth endpoints, the cron endpoint (it checks CRON_SECRET itself),
  // static assets and PWA files.
  matcher: ["/((?!login|api/auth|api/cron|_next/|favicon.ico|manifest.webmanifest|icon|apple-icon).*)"],
};
