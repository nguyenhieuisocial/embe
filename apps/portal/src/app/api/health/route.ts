import { currentAppVersion } from "../../../lib/app-version";
import { LATEST_APP_UPDATE } from '../../../lib/app-updates';

export function GET() {
  return Response.json(
    { status: "ok", version: currentAppVersion(), update: LATEST_APP_UPDATE },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
