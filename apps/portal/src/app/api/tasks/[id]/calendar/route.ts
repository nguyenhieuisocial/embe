import { isIsoDate, isTaskId } from "../../../../../lib/family-task-contract";
import { getFamilyTasks } from "../../../../../lib/family-tasks-server";
import { privateReply } from "../../../../../lib/photo-upload-server";
import { verifySessionCookie } from "../../../../../lib/portal-auth";
import { familyTaskToIcs, taskCalendarFilename } from "../../../../../lib/task-calendar";

function sessionCookie(header: string | null): string | undefined {
  return header?.split(";").map((part) => part.trim().split("="))
    .find(([key]) => key === "embe_session")?.slice(1).join("=");
}

function authorized(request: Request): boolean {
  const secret = process.env.EMBE_PORTAL_SESSION_SECRET;
  return Boolean(secret && verifySessionCookie(sessionCookie(request.headers.get("cookie")), secret));
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!authorized(request)) return privateReply({ error: "unauthorized" }, 401);
  const { id } = await context.params;
  const day = new URL(request.url).searchParams.get("day");
  if (!isTaskId(id) || !isIsoDate(day)) return privateReply({ error: "invalid_request" }, 400);

  try {
    const task = (await getFamilyTasks(day, day)).find((item) => item.id === id && item.occurrenceOn === day);
    if (!task || task.category !== "appointment") return privateReply({ error: "not_found" }, 404);
    return new Response(familyTaskToIcs(task), {
      headers: {
        "cache-control": "private, no-store",
        "content-disposition": `attachment; filename="${taskCalendarFilename(task)}"`,
        "content-type": "text/calendar; charset=utf-8"
      }
    });
  } catch {
    return privateReply({ error: "temporarily_unavailable" }, 503);
  }
}
