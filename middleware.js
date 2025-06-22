import { NextResponse } from "next/server";

export function middleware(request) {
  // List of protected routes
  const protectedRoutes = ["/dashboard", "/create", "/group"];
  const { pathname, search } = request.nextUrl;
  const isProtected = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  // Use the correct Supabase auth cookie name for your project
  const session = request.cookies.get(
    "sb-ffviufvvjrreukrzyryq-auth-token"
  )?.value;
  if (!session) {
    // Redirect to login with redirect param
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard", "/create", "/group/:path*"],
};
