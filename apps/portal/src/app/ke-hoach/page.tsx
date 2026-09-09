import AppHeader from "../../components/app-header";
import FamilyPlanner from "../../components/family-planner";
import BirthRecoveryPlan from "../../components/birth-recovery-plan";
import { birthRecoveryStep } from "../../lib/birth-recovery-plan";
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
        <h1>Kế hoạch gia đình</h1>
        <p className="intro">Việc cần làm và lịch hẹn của cả nhà.</p>
      </section>
      <FamilyPlanner key={`${selectedDate}:${query.template ?? ""}:${startOpen}`} selectedDate={selectedDate} startOpen={startOpen} template={birthRecoveryStep(query.template)} />
      <BirthRecoveryPlan day={selectedDate} />
    </main>
  );
}
