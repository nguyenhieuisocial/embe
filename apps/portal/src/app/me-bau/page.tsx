"use client";

import { useEffect, useMemo, useState } from "react";

import {
  dailyChecklist,
  pregnancySources,
  weeklyMenu
} from "../../lib/pregnancy-content";
import { calculatePregnancyWeek, localDateKey } from "../../lib/pregnancy";

const DUE_DATE_KEY = "embe:pregnancy:due-date";

export default function PregnancyPage() {
  const [dueDate, setDueDate] = useState("");
  const [completed, setCompleted] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const todayKey = localDateKey();
  const checklistKey = `embe:pregnancy:checklist:${todayKey}`;

  useEffect(() => {
    try {
      setDueDate(localStorage.getItem(DUE_DATE_KEY) ?? "");
      const stored = JSON.parse(localStorage.getItem(checklistKey) ?? "[]");
      const validIds = new Set<string>(dailyChecklist.map((task) => task.id));
      setCompleted(
        Array.isArray(stored)
          ? stored.filter((item): item is string => typeof item === "string" && validIds.has(item))
          : []
      );
    } catch {
      setCompleted([]);
    }
    setReady(true);
  }, [checklistKey]);

  const week = useMemo(() => calculatePregnancyWeek(dueDate), [dueDate]);
  const progress = Math.round((completed.length / dailyChecklist.length) * 100);

  function updateDueDate(value: string) {
    setDueDate(value);
    try {
      if (value) localStorage.setItem(DUE_DATE_KEY, value);
      else localStorage.removeItem(DUE_DATE_KEY);
    } catch {
      // The page remains usable when private browsing blocks persistent storage.
    }
  }

  function toggleTask(taskId: string) {
    setCompleted((current) => {
      const next = current.includes(taskId)
        ? current.filter((id) => id !== taskId)
        : [...current, taskId];
      try {
        localStorage.setItem(checklistKey, JSON.stringify(next));
      } catch {
        // Keep the in-memory checklist usable when storage is unavailable.
      }
      return next;
    });
  }

  return (
    <main className="pregnancy-main">
      <header className="masthead">
        <a className="wordmark" href="/" aria-label="Em Bé — về trang gia đình">
          Em Bé
        </a>
        <p className="privacy-note">
          <span aria-hidden="true">●</span> Chỉ lưu dấu tích trên thiết bị này
        </p>
      </header>

      <section className="pregnancy-hero">
        <div>
          <p className="eyebrow">MỘT NGÀY DỊU DÀNG</p>
          <h1>Mẹ bầu hôm nay</h1>
          <p className="intro">
            Một bảng nhỏ để nhớ điều cần làm, chọn bữa ăn và gom câu hỏi cho lần
            khám tới — không cần biến thai kỳ thành một cuộc chạy chỉ tiêu.
          </p>
        </div>
        <div className="week-card">
          <label htmlFor="due-date">Ngày dự sinh do bác sĩ xác nhận</label>
          <input
            id="due-date"
            type="date"
            value={dueDate}
            onChange={(event) => updateDueDate(event.target.value)}
          />
          <p className="week-number" aria-live="polite">
            {week ? `Tuần ${week}` : "Chưa chọn tuần thai"}
          </p>
          <p>Ngày dự sinh chỉ được lưu trong trình duyệt hiện tại.</p>
        </div>
      </section>

      <section className="care-board" aria-labelledby="daily-title">
        <div className="care-summary">
          <div>
            <p className="panel-kicker">CHECKLIST {todayKey}</p>
            <h2 id="daily-title">Việc của hôm nay</h2>
          </div>
          <div className="progress-stamp" aria-label={`${progress}% hoàn thành`}>
            <strong>{ready ? completed.length : 0}</strong>
            <span>/ {dailyChecklist.length}</span>
          </div>
        </div>

        <div className="checklist">
          {dailyChecklist.map((task) => {
            const isDone = completed.includes(task.id);
            return (
              <label className={`check-item${isDone ? " is-done" : ""}`} key={task.id}>
                <input
                  type="checkbox"
                  checked={isDone}
                  onChange={() => toggleTask(task.id)}
                />
                <span className="custom-check" aria-hidden="true">✓</span>
                <span>
                  <strong>{task.title}</strong>
                  <small>{task.detail}</small>
                </span>
              </label>
            );
          })}
        </div>
      </section>

      <section className="menu-section" aria-labelledby="menu-title">
        <div className="section-heading-row">
          <div>
            <p className="panel-kicker">GỢI Ý, KHÔNG PHẢI ĐƠN THUỐC</p>
            <h2 id="menu-title">Thực đơn 7 ngày tham khảo</h2>
          </div>
          <p>
            Điều chỉnh lượng ăn theo thể trạng, dị ứng, khẩu vị và hướng dẫn của
            bác sĩ. Tất cả thịt, cá, trứng và hải sản cần được nấu chín kỹ.
          </p>
        </div>

        <div className="menu-scroll">
          {weeklyMenu.map((menu) => (
            <article className="menu-day" key={menu.day}>
              <h3>{menu.day}</h3>
              <dl>
                <div><dt>Sáng</dt><dd>{menu.breakfast}</dd></div>
                <div><dt>Trưa</dt><dd>{menu.lunch}</dd></div>
                <div><dt>Tối</dt><dd>{menu.dinner}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <aside className="medical-boundary">
        <strong>Ranh giới an toàn</strong>
        <p>
          Nội dung này không thay thế tư vấn, chẩn đoán hoặc điều trị. Nếu có dấu
          hiệu bất thường hay cảm thấy không ổn, liên hệ cơ sở sản khoa thay vì
          chờ hoàn thành checklist.
        </p>
      </aside>

      <section className="source-section" aria-labelledby="source-title">
        <h2 id="source-title">Nguồn đã đối chiếu</h2>
        <ul>
          {pregnancySources.map((source) => (
            <li key={source.href}>
              <a href={source.href} rel="noreferrer" target="_blank">{source.label}</a>
            </li>
          ))}
        </ul>
      </section>

      <footer>
        <p>Phiên bản đầu lưu tiến độ riêng trên từng điện thoại.</p>
      </footer>
    </main>
  );
}
