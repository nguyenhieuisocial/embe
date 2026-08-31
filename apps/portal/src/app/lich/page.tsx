import AppHeader from "../../components/app-header";
import FamilyCalendar from "../../components/family-calendar";
import MemoryTabs from "../../components/memory-tabs";
import { calendarMonth, dateKey, monthRange, parseDateKey } from "../../lib/calendar";
import { getMediaMemoryDates } from "../../lib/media";

export const dynamic = "force-dynamic";

export default async function CalendarPage({ searchParams }: PageProps<"/lich">) {
  const query = await searchParams;
  const monthValue = typeof query.month === "string" ? query.month : undefined;
  const dateValue = typeof query.date === "string" ? query.date : undefined;
  const { month, year } = calendarMonth(monthValue);
  const selectedDate = parseDateKey(dateValue);
  const range = monthRange(month, year);
  const memoryDates = await getMediaMemoryDates(range);
  const memoryCounts = memoryDates.reduce<Record<string, number>>((counts, value) => {
    const key = dateKey(value);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});

  return (
    <main className="calendar-main">
      <AppHeader note="Lịch riêng của gia đình" />
      <section className="calendar-hero">
        <p className="eyebrow">NHỊP THỜI GIAN CỦA EM BÉ</p>
        <h1>Mỗi ngày đều có<br /><em>một điều để nhớ</em></h1>
        <p className="intro">Xem ngày dương, ngày âm và mở lại đúng kỷ niệm chỉ bằng một chạm.</p>
      </section>
      <MemoryTabs current="calendar" />
      <FamilyCalendar month={month} year={year} selectedDate={selectedDate} memoryCounts={memoryCounts} />
    </main>
  );
}
