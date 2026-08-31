"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import AppHeader from "../../components/app-header";
import PregnancyHealthTracker from "../../components/pregnancy-health-tracker";
import {
  dailyChecklist,
  pregnancySources,
  trimesterGuides,
  urgentCareReminders,
  weeklyMenu
} from "../../lib/pregnancy-content";
import { calculatePregnancyWeek, localDateKey } from "../../lib/pregnancy";

const DUE_DATE_KEY = "embe:pregnancy:due-date";
const DUE_DATE_DIRTY_KEY = `${DUE_DATE_KEY}:dirty`;
const checklistGroups = ["Ăn uống", "Chăm cơ thể"] as const;

type PregnancyState = {
  dueDate: string | null;
  completed: string[];
  hasProfile: boolean;
  hasDayState: boolean;
};

type SyncStatus = "loading" | "saving" | "synced" | "offline";

function validCompleted(value: unknown): string[] {
  const validIds = new Set<string>(dailyChecklist.map((task) => task.id));
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && validIds.has(item))
    : [];
}

function checklistDirtyKey(day: string): string {
  return `embe:pregnancy:checklist:${day}:dirty`;
}

export default function PregnancyPage() {
  const [dueDate, setDueDate] = useState("");
  const [completed, setCompleted] = useState<string[]>([]);
  const [todayKey, setTodayKey] = useState("");
  const [ready, setReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("loading");
  const revisionRef = useRef(0);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const checklistKey = todayKey ? `embe:pregnancy:checklist:${todayKey}` : "";

  useEffect(() => {
    const currentDay = localDateKey();
    const currentChecklistKey = `embe:pregnancy:checklist:${currentDay}`;
    setTodayKey(currentDay);
    try {
      setDueDate(localStorage.getItem(DUE_DATE_KEY) ?? "");
      setCompleted(validCompleted(JSON.parse(localStorage.getItem(currentChecklistKey) ?? "[]")));
    } catch {
      setCompleted([]);
    }
    setReady(true);

    let active = true;
    async function synchronize() {
      const revision = revisionRef.current;
      setSyncStatus("loading");
      try {
        const localDueDate = localStorage.getItem(DUE_DATE_KEY) ?? "";
        const hasLocalDueDate = localStorage.getItem(DUE_DATE_KEY) !== null;
        const hasLocalChecklist = localStorage.getItem(currentChecklistKey) !== null;
        const localCompleted = validCompleted(
          JSON.parse(localStorage.getItem(currentChecklistKey) ?? "[]")
        );
        const dueDateDirty = localStorage.getItem(DUE_DATE_DIRTY_KEY) === "1";
        const checklistDirty = localStorage.getItem(checklistDirtyKey(currentDay)) === "1";

        const response = await fetch(`/api/pregnancy?day=${currentDay}`, { cache: "no-store" });
        if (!response.ok) throw new Error("pregnancy state unavailable");
        let remote = (await response.json()) as PregnancyState;
        if (!active || revision !== revisionRef.current) return;

        const update: Record<string, unknown> = { day: currentDay };
        if (dueDateDirty || (!remote.hasProfile && hasLocalDueDate)) update.dueDate = localDueDate || null;
        if (checklistDirty || (!remote.hasDayState && hasLocalChecklist)) update.completed = localCompleted;

        if (Object.keys(update).length > 1) {
          const saveResponse = await fetch("/api/pregnancy", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(update)
          });
          if (!saveResponse.ok) throw new Error("pregnancy state save unavailable");
          remote = (await saveResponse.json()) as PregnancyState;
        }
        if (!active || revision !== revisionRef.current) return;

        if (remote.hasProfile) {
          setDueDate(remote.dueDate ?? "");
          if (remote.dueDate) localStorage.setItem(DUE_DATE_KEY, remote.dueDate);
          else localStorage.removeItem(DUE_DATE_KEY);
        }
        if (remote.hasDayState) {
          setCompleted(validCompleted(remote.completed));
          localStorage.setItem(currentChecklistKey, JSON.stringify(validCompleted(remote.completed)));
        }
        localStorage.removeItem(DUE_DATE_DIRTY_KEY);
        localStorage.removeItem(checklistDirtyKey(currentDay));
        setSyncStatus("synced");
      } catch {
        if (active) setSyncStatus("offline");
      }
    }

    void synchronize();
    window.addEventListener("online", synchronize);
    return () => {
      active = false;
      window.removeEventListener("online", synchronize);
    };
  }, []);

  const week = useMemo(() => calculatePregnancyWeek(dueDate), [dueDate]);
  const progress = Math.round((completed.length / dailyChecklist.length) * 100);

  function queueSave(
    body: Record<string, unknown>,
    dirtyKey: string,
    stillCurrent: () => boolean
  ) {
    setSyncStatus("saving");
    writeQueueRef.current = writeQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          const response = await fetch("/api/pregnancy", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body)
          });
          if (!response.ok) throw new Error("pregnancy state save unavailable");
          if (stillCurrent()) {
            localStorage.removeItem(dirtyKey);
            const hasPendingWrite = localStorage.getItem(DUE_DATE_DIRTY_KEY) === "1"
              || localStorage.getItem(checklistDirtyKey(todayKey)) === "1";
            setSyncStatus(hasPendingWrite ? "saving" : "synced");
          }
        } catch {
          if (stillCurrent()) setSyncStatus("offline");
        }
      });
  }

  function updateDueDate(value: string) {
    setDueDate(value);
    revisionRef.current += 1;
    try {
      if (value) localStorage.setItem(DUE_DATE_KEY, value);
      else localStorage.removeItem(DUE_DATE_KEY);
      localStorage.setItem(DUE_DATE_DIRTY_KEY, "1");
    } catch {
      // The page remains usable when private browsing blocks persistent storage.
    }
    queueSave(
      { day: todayKey, dueDate: value || null },
      DUE_DATE_DIRTY_KEY,
      () => (localStorage.getItem(DUE_DATE_KEY) ?? "") === value
    );
  }

  function toggleTask(taskId: string) {
    const next = completed.includes(taskId)
      ? completed.filter((id) => id !== taskId)
      : [...completed, taskId];
    setCompleted(next);
    try {
      localStorage.setItem(checklistKey, JSON.stringify(next));
      localStorage.setItem(checklistDirtyKey(todayKey), "1");
    } catch {
      // Keep the in-memory checklist usable when storage is unavailable.
    }
    revisionRef.current += 1;
    const submittedChecklist = JSON.stringify(next);
    queueSave(
      { day: todayKey, completed: next },
      checklistDirtyKey(todayKey),
      () => localStorage.getItem(checklistKey) === submittedChecklist
    );
  }

  return (
    <main className="pregnancy-main">
      <AppHeader
        note={syncStatus === "synced"
          ? "Đã đồng bộ riêng tư"
          : syncStatus === "saving" || syncStatus === "loading"
            ? "Đang đồng bộ…"
            : "Đã lưu trên máy · sẽ đồng bộ khi có mạng"}
        tone={syncStatus === "synced" ? "calm" : "wait"}
      />

      <section className="pregnancy-hero">
        <div>
          <p className="eyebrow">CHĂM MẸ NGÂN · TỪNG NGÀY</p>
          <h1>Mẹ bầu hôm nay</h1>
          <p className="intro">
            Chỉ những điều cần nhớ hôm nay — nhẹ nhàng, rõ ràng và không tạo áp lực.
          </p>
        </div>
        <Image
          className="pregnancy-care-art"
          src="/illustrations/pregnancy-care.webp"
          alt="Minh họa nước uống, bữa ăn chín, vận động nhẹ, nghỉ ngơi và ghi câu hỏi"
          width={900}
          height={675}
          sizes="(max-width: 720px) 100vw, 340px"
          priority
        />
        <div className="week-card">
          <label htmlFor="due-date">Ngày dự sinh do bác sĩ xác nhận</label>
          <input
            id="due-date"
            type="date"
            value={dueDate}
            disabled={!ready}
            onChange={(event) => updateDueDate(event.target.value)}
          />
          <p className="week-number" aria-live="polite">
            {week ? `Tuần ${week}` : "Chưa chọn tuần thai"}
          </p>
          <p>Dữ liệu được giữ riêng tư và đồng bộ giữa các thiết bị đã đăng nhập.</p>
        </div>
      </section>

      <section className="trimester-section" aria-labelledby="trimester-title">
        <div className="section-heading-row">
          <div>
            <p className="panel-kicker">NHẮC ĐÚNG VIỆC · KHÔNG TỰ CHẨN ĐOÁN</p>
            <h2 id="trimester-title">Điều nên ưu tiên theo giai đoạn</h2>
          </div>
          <p>Ngày dự sinh chỉ giúp hiển thị tuần thai. Mọi lịch khám, xét nghiệm và thuốc vẫn theo nơi Mẹ Ngân đang được chăm sóc.</p>
        </div>
        <div className="trimester-grid">
          {trimesterGuides.map((guide) => (
            <article key={guide.title}>
              <h3>{guide.title}</h3>
              <p>{guide.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="care-board" aria-labelledby="daily-title">
        <div className="care-summary">
          <div>
            <p className="panel-kicker">CHECKLIST {todayKey || "HÔM NAY"}</p>
            <h2 id="daily-title">Việc của hôm nay</h2>
          </div>
          <div className="progress-stamp" aria-label={`${progress}% hoàn thành`}>
            <strong>{ready ? completed.length : 0}</strong>
            <span>/ {dailyChecklist.length}</span>
          </div>
        </div>

        <div className="checklist">
          {checklistGroups.map((group) => (
            <div className="checklist-group" key={group}>
              <h3>{group}</h3>
              {dailyChecklist.filter((task) => task.group === group).map((task) => {
                const isDone = completed.includes(task.id);
                return (
                  <label className={`check-item${isDone ? " is-done" : ""}`} key={task.id}>
                    <input
                      type="checkbox"
                      checked={isDone}
                      disabled={!ready}
                      onChange={() => toggleTask(task.id)}
                    />
                    <span className="custom-check" aria-hidden="true">✓</span>
                    <span className="check-text">
                      <strong>{task.title}</strong>
                      <small>{task.detail}</small>
                    </span>
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      <PregnancyHealthTracker />

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

      <section className="urgent-care" aria-labelledby="urgent-title">
        <p className="panel-kicker">KHÔNG CHỜ CHECKLIST</p>
        <h2 id="urgent-title">Khi nào cần liên hệ ngay</h2>
        <p>Nếu có một trong các dấu hiệu dưới đây, liên hệ cơ sở sản khoa đang theo dõi hoặc cấp cứu địa phương; không chờ EmBe trả lời.</p>
        <ul>
          {urgentCareReminders.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>

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
        <p>EmBe ưu tiên lưu tức thì trên điện thoại và tự đồng bộ an toàn.</p>
      </footer>
    </main>
  );
}
