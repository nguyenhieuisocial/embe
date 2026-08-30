import { NextResponse } from "next/server";

export async function POST(request: Request): Promise<NextResponse> {
  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  response.headers.set("cache-control", "private, no-store");
  response.cookies.set("embe_session", "", {
    expires: new Date(0),
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: true
  });
  return response;
}
