import { NextRequest, NextResponse } from "next/server";

const publicPaths = [
  "/",
  "/product",
  "/pricing",
  "/support",
  "/receipt",
  "/login",
  "/signup",
  "/accept-invitation",
  "/forgot-password",
  "/reset-password",
  "/privacy",
  "/legal",
  "/icon.png",
];

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const development = process.env.NODE_ENV !== "production";
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    // The current interface uses local CSS plus a small number of React style attributes.
    // Scripts remain nonce-only; style-inline is the sole reviewed CSP exception.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(development ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  const path = request.nextUrl.pathname;
  const publicRequest =
    publicPaths.some((publicPath) => path === publicPath || path.startsWith(`${publicPath}/`)) ||
    path === "/favicon.ico" ||
    path.startsWith("/backend/");
  const developmentBootstrap =
    process.env.NODE_ENV !== "production" && process.env.GRIDFLOW_DEV_BOOTSTRAP !== "false";
  const sessionCookie = process.env.AUTH_SESSION_COOKIE_NAME ?? "gridflow_session";
  const deviceCookie = process.env.AUTH_DEVICE_COOKIE_NAME ?? "gridflow_device";

  let response: NextResponse;
  if (
    !publicRequest &&
    !developmentBootstrap &&
    (!request.cookies.has(sessionCookie) || !request.cookies.has(deviceCookie))
  ) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", path);
    response = NextResponse.redirect(login);
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|icon.png).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
