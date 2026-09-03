import { getCalendarGrid } from "@lichta/core";
import Link from "next/link";

import { adjacentMonth, dateKey, lunarDateLabel, monthKey } from "../lib/calendar";

const weekDays = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function memoryLabel(count: number): string {
  return count > 0 ? `, ${count} kỷ niệm` : ", chưa có kỷ niệm";
}

function taskLabel(count: { completed: number; total: number }): string {
  return count.total > 0 ? `, ${count.completed} trên ${count.total} việc đã xong` : ", chưa có việc";
}

export default function FamilyCalendar({
  birthdays,
  memoryCounts,
  month,
  selectedDate,
  taskCounts,
  year
}: {
  birthdays?: Array<{ birthDate: string; label: string }>;
  memoryCounts: Record<string, number>;
  month: number;
  selectedDate?: Date | null;
  taskCounts: Record<string, { completed: number; total: number }>;
  year: number;
}) {
  const cells = getCalendarGrid(month, year, selectedDate, 1);
  const currentMonth = monthKey(month, year);

  return (
    <section className="family-calendar" aria-labelledby="calendar-title">
      <div className="calendar-toolbar">
        <a className="calendar-arrow" href={`/lich?month=${adjacentMonth(month, year, -1)}`} aria-label="Tháng trước">←</a>
        <div>
          <p id="calendar-title">Tháng {month}</p>
          <strong>{year}</strong>
        </div>
        <a className="calendar-arrow" href={`/lich?month=${adjacentMonth(month, year, 1)}`} aria-label="Tháng sau">→</a>
      </div>

      <form className="calendar-jump" action="/lich" method="get">
        <label htmlFor="calendar-month">Đi đến tháng</label>
        <input id="calendar-month" name="month" type="month" min="1800-01" max="2199-12" defaultValue={currentMonth} />
        <button type="submit">Mở</button>
        <Link href="/lich">Hôm nay</Link>
      </form>

      <div className="calendar-weekdays" aria-hidden="true">
        {weekDays.map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="calendar-grid">
        {cells.map((cell) => {
          const key = dateKey(cell.solar);
          const count = memoryCounts[key] ?? 0;
          const taskCount = taskCounts[key] ?? { completed: 0, total: 0 };
          const birthday = birthdays?.find(({ birthDate }) => birthDate.slice(5) === key.slice(5));
          const classes = [
            "calendar-day",
            !cell.isCurrentMonth && "is-outside",
            cell.isToday && "is-today",
            cell.isSelected && "is-selected",
            count > 0 && "has-memory",
            taskCount.total > 0 && "has-task",
            birthday && "has-birthday"
          ].filter(Boolean).join(" ");
          const label = `Xem ngày ${cell.solar.getDate()} tháng ${cell.solar.getMonth() + 1} năm ${cell.solar.getFullYear()}, âm lịch ${cell.lunar.day} tháng ${cell.lunar.month}${memoryLabel(count)}${taskLabel(taskCount)}${birthday ? `, sinh nhật ${birthday.label}` : ""}`;

          return (
            <a
              aria-label={label}
              className={classes}
              href={`/ke-hoach?date=${key}`}
              id={cell.isSelected ? `date-${key}` : undefined}
              key={key}
            >
              <span className="solar-day">{cell.solar.getDate()}</span>
              <span className="lunar-day">{lunarDateLabel(cell.solar)}</span>
              {count > 0 ? <span className="memory-dot" aria-hidden="true" /> : null}
              {taskCount.total > 0 ? <span className="task-dot" aria-hidden="true" /> : null}
              {birthday ? <span className="birthday-mark" aria-hidden="true">♥</span> : null}
            </a>
          );
        })}
      </div>
      <div className="calendar-legend">
        <span><i className="memory-dot" aria-hidden="true" /> Có kỷ niệm</span>
        <span><i className="task-dot" aria-hidden="true" /> Có việc</span>
        <span><i className="birthday-mark" aria-hidden="true">♥</i> Sinh nhật</span>
        <span>Chữ nhỏ là ngày âm</span>
      </div>
    </section>
  );
}
