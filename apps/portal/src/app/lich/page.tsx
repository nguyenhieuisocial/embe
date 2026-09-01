import AppHeader from "../../components/app-header";
import FamilyCalendar from "../../components/family-calendar";
import MemoryTabs from "../../components/memory-tabs";
import { calendarMonth, dateKey, monthRange, parseDateKey } from "../../lib/calendar";
import { getMediaMemoryDates } from "../../lib/media";
import { getFamilyTasks } from "../../lib/family-tasks-server";
import { getFamilyProfile } from "../../lib/family-profile-server";

export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const monthValue = typeof query.month === "string" ? query.month : undefined;
  const dateValue = typeof query.date === "string" ? query.date : undefined;
  const { month, year } = calendarMonth(monthValue);
  const selectedDate = parseDateKey(dateValue);
  const range = monthRange(month, year);
  const firstDay = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = `${year}-${String(month).padStart(2, "0")}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
  const [memoryDates, tasks, familyProfile] = await Promise.all([
    getMediaMemoryDates(range),
    getFamilyTasks(firstDay, lastDay).catch(() => []),
    getFamilyProfile()
  ]);
  const memoryCounts = memoryDates.reduce<Record<string, number>>((counts, value) => {
    const key = dateKey(value);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  const taskCounts = tasks.reduce<Record<string, { completed: number; total: number }>>((counts, task) => {
    const current = counts[task.occurrenceOn] ?? { completed: 0, total: 0 };
    current.total += 1;
    if (task.completed) current.completed += 1;
    counts[task.occurrenceOn] = current;
    return counts;
  }, {});

  return (
    <main className="calendar-main">
      <AppHeader note="Lịch riêng của gia đình" />
      <section className="calendar-hero">
        <p className="eyebrow">Nhịp thời gian của em bé</p>
        <h1>Mỗi ngày đều có<br /><em>một điều để nhớ</em></h1>
        <p className="intro">Xem ngày dương, ngày âm và mở lại đúng kỷ niệm chỉ bằng một chạm.</p>
      </section>
      <MemoryTabs current="calendar" />
      <FamilyCalendar
        birthdays={[
          ...(familyProfile.motherBirthDate ? [{ birthDate: familyProfile.motherBirthDate, label: "Mẹ Ngân" }] : []),
          ...(familyProfile.fatherBirthDate ? [{ birthDate: familyProfile.fatherBirthDate, label: "Ba Hiếu" }] : [])
        ]}
        month={month} year={year} selectedDate={selectedDate} memoryCounts={memoryCounts} taskCounts={taskCounts}
      />
    </main>
  );
}
