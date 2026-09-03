import Link from "next/link";

import type { TodayPriority } from "../lib/today-priorities";

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
        <p className="panel-kicker">Nhẹ nhàng, đúng việc</p>
        <h2 id="today-priorities-title">{priorities.length ? `${priorities.length} việc cần để ý` : "Hôm nay"}</h2>
      </div>

      {priorities.length ? (
        <ol className="today-priority-list">
          {priorities.map((priority) => (
            <li className={`today-priority is-${priority.kind}`} key={priority.id}>
              <span className="today-priority-thread" aria-hidden="true" />
              <span className="today-priority-copy">
                <strong>{priority.title}</strong>
                <small>{priority.detail}</small>
              </span>
              <Link href={priority.href} prefetch={false} aria-label={`${priority.actionLabel}: ${priority.title}`}>
                {priority.actionLabel}
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
