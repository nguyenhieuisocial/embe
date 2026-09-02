import { currentAppVersion } from "../../../lib/app-version";

export function GET() {
  return Response.json(
    { status: "ok", version: currentAppVersion() },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
