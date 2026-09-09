import Link from "next/link";
import { Icon, type IconName } from "./embe-icon";

import type { TodayPriority } from "../lib/today-priorities";

const priorityIcons: Record<TodayPriority["kind"], IconName> = {
  appointment: "calendar", task: "check", medicine: "check", health: "care",
  meal: "meal", profile: "album", inventory: "supply"
};

export default function TodayPrioritiesPanel({
  priorities,
  unavailableSources
}: {
  priorities: TodayPriority[];
  unavailableSources: string[];
}) {
  return (
    <section className="section today-priorities" aria-labelledby="today-priorities-title">
      <div className="section-head">
        <h2 id="today-priorities-title">Việc cần nhớ</h2>
        {priorities.length ? <small>{priorities.length} việc</small> : null}
      </div>

      {priorities.length ? (
        <ol className="today-priority-list">
          {priorities.map((priority) => (
            <li className={`today-priority is-${priority.kind}`} key={priority.id}>
              <Link className="today-priority-open" href={priority.href} prefetch={false} aria-label={`${priority.actionLabel}: ${priority.title}`}>
              <span className="today-priority-symbol"><Icon name={priorityIcons[priority.kind]} /></span>
              <span className="today-priority-copy">
                <strong>{priority.title}</strong>
                <small>{priority.detail}</small>
              </span>
                <Icon name="arrow" />
              </Link>
            </li>
          ))}
        </ol>
      ) : unavailableSources.length === 0 ? (
        <p className="today-priority-empty">Hôm nay chưa có việc cần làm.</p>
      ) : null}

      {unavailableSources.length ? (
        <p className="today-priority-source-state" role="status">
          Chưa tải được {unavailableSources.join(", ")}.
        </p>
      ) : null}
      <Link className="today-priority-plan-link" href="/ke-hoach" prefetch={false} aria-label="Mở kế hoạch hôm nay">
        Xem toàn bộ kế hoạch
      </Link>
    </section>
  );
}
