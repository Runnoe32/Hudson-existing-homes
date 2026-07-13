import { NextRequest, NextResponse } from "next/server";

// App-level auth gate. Protects every route with HTTP Basic Auth when
// SITE_PASSWORD is set (production). If unset (local dev) the gate is disabled.
// Mirrors the Hudson Land tool. This DB holds homeowner PII — never remove this.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function middleware(req: NextRequest) {
  const pass = process.env.SITE_PASSWORD;
  if (!pass) return NextResponse.next(); // disabled when no password configured

  const expectedUser = process.env.SITE_USER || "hudson";
  const header = req.headers.get("authorization") || "";
  const [scheme, encoded] = header.split(" ");

  if (scheme === "Basic" && encoded) {
    let decoded = "";
    try {
      decoded = atob(encoded);
    } catch {
      decoded = "";
    }
    const sep = decoded.indexOf(":");
    if (sep !== -1) {
      const user = decoded.slice(0, sep);
      const password = decoded.slice(sep + 1);
      if (timingSafeEqual(user, expectedUser) && timingSafeEqual(password, pass)) {
        return NextResponse.next();
      }
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Hudson Existing Homes", charset="UTF-8"' },
  });
}
