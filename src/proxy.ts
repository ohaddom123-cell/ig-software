import { NextResponse, type NextRequest } from "next/server";

/**
 * This is a small internal tool for one social media manager, not a public
 * product — a full user/auth system would be the "unnecessary enterprise
 * permissions" the spec explicitly says to avoid. A single shared HTTP
 * Basic Auth gate is the simplest reasonable way to keep client data (brand
 * guidelines, drafts, captions) off the open internet once this is
 * deployed. Swap for real auth later if more than one person ever needs
 * distinct accounts.
 */
export function proxy(request: NextRequest) {
  // The cron endpoint authenticates itself via CRON_SECRET, not Basic Auth —
  // Vercel's scheduler can't do an interactive login.
  if (request.nextUrl.pathname.startsWith("/api/cron/")) {
    return NextResponse.next();
  }

  const user = process.env.APP_USERNAME;
  const pass = process.env.APP_PASSWORD;

  // If no credentials are configured, don't silently leave the app wide
  // open — fail closed with a clear message instead.
  if (!user || !pass) {
    return new NextResponse(
      "APP_USERNAME and APP_PASSWORD are not set. This app refuses to serve requests without them so it doesn't accidentally sit open on the internet — set them in your environment (see .env.example) and redeploy.",
      { status: 503 },
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Basic ")) {
    const decoded = atob(authHeader.slice("Basic ".length));
    const sepIndex = decoded.indexOf(":");
    const providedUser = decoded.slice(0, sepIndex);
    const providedPass = decoded.slice(sepIndex + 1);
    if (providedUser === user && providedPass === pass) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="ig-software"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
