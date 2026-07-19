import { NextRequest, NextResponse } from "next/server";

const publicPaths = ["/login", "/signup", "/accept-invitation"];

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (
    publicPaths.some((publicPath) => path === publicPath || path.startsWith(`${publicPath}/`)) ||
    path.startsWith("/_next/") ||
    path === "/favicon.ico" ||
    path.startsWith("/backend/")
  ) {
    return NextResponse.next();
  }

  const developmentBootstrap =
    process.env.NODE_ENV !== "production" &&
    process.env.GRIDFLOW_DEV_BOOTSTRAP !== "false";
  const sessionCookie = process.env.AUTH_SESSION_COOKIE_NAME ?? "gridflow_session";
  if (!developmentBootstrap && !request.cookies.has(sessionCookie)) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", path);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api).*)"],
};
