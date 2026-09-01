import AppHeader from "../../components/app-header";
import FamilyPlanner from "../../components/family-planner";
import { dateInVietnam, isIsoDate } from "../../lib/family-task-contract";

export const dynamic = "force-dynamic";

export default async function PlannerPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const selectedDate = typeof query.date === "string" && isIsoDate(query.date) ? query.date : dateInVietnam();
  const startOpen = query.them === "1";
  return (
    <main className="planner-main">
      <AppHeader note="Kế hoạch riêng của Ngân & Hiếu" />
      <section className="planner-hero">
        <p className="eyebrow">Việc nhà mình</p>
        <h1>Một ngày rõ ràng,<br /><em>cả nhà cùng nhẹ lòng</em></h1>
        <p className="intro">Việc cần làm, lịch hẹn và những điều muốn nhớ nằm chung một mạch.</p>
      </section>
      <FamilyPlanner selectedDate={selectedDate} startOpen={startOpen} />
    </main>
  );
}
