"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import AppHeader from "../../components/app-header";
import BirthTransition from "../../components/birth-transition";
import PregnancyCareTracker from "../../components/pregnancy-care-tracker";
import PregnancyHealthTracker from "../../components/pregnancy-health-tracker";
import PregnancyMedicalRecords from "../../components/pregnancy-medical-records";
import MealPhotoTracker from "../../components/meal-photo-tracker";
import {
  dailyChecklist,
  pregnancyGuidance,
  pregnancyGuidanceLevels,
  pregnancySources,
  trimesterGuides,
  urgentCareReminders,
  weeklyMenu
} from "../../lib/pregnancy-content";
import { calculatePregnancyWeek, localDateKey } from "../../lib/pregnancy";

const DUE_DATE_KEY = "embe:pregnancy:due-date";
const DUE_DATE_DIRTY_KEY = `${DUE_DATE_KEY}:dirty`;
const STAGE_CHANGE_EVENT = "embe:pregnancy-stage-change";
const checklistGroups = ["Ăn uống", "Chăm cơ thể"] as const;

function pregnancyStage(week: number | null): string {
  if (week === null) return "Mới mang thai";
  if (week <= 13) return "Ba tháng đầu";
  if (week <= 27) return "Ba tháng giữa";
  return "Ba tháng cuối";
}

function stageNudge(week: number | null): string {
  if (week === null) return "Mình chưa cần biết hết mọi thứ ngay. Hãy bắt đầu bằng một ngày thật nhẹ cho Mẹ Ngân.";
  if (week <= 13) return "Ưu tiên nghỉ ngơi, ăn uống an toàn và ghi lại điều muốn hỏi trong lần khám tới.";
  if (week <= 27) return "Theo dõi những thay đổi nhỏ của cơ thể, vận động nhẹ và lưu lại các khoảnh khắc đáng nhớ.";
  return "Giữ lịch khám trong tầm tay và chuẩn bị những việc thật sự cần trước ngày đón em bé.";
}

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
          window.dispatchEvent(new Event(STAGE_CHANGE_EVENT));
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
  const stage = pregnancyStage(week);
  const trimesterIndex = week !== null && week >= 28 ? 2 : week !== null && week >= 14 ? 1 : 0;
  const stageTone = week === null ? "early" : `trimester-${trimesterIndex + 1}`;
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
      window.dispatchEvent(new Event(STAGE_CHANGE_EVENT));
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
          <p className="eyebrow">Chăm Mẹ Ngân · từng ngày</p>
          <h1>Mẹ bầu hôm nay</h1>
          <p className="intro">
            Chỉ những điều cần nhớ hôm nay — nhẹ nhàng, rõ ràng và không tạo áp lực.
          </p>
        </div>
        <div className={`week-card is-${stageTone}`}>
          <p className="panel-kicker">Giai đoạn hiện tại</p>
          <div className="stage-line">
            <p className="week-number" aria-live="polite">{week ? `Tuần ${week}` : "Chưa có tuần thai"}</p>
            <span className="stage-name">{stage}</span>
          </div>
          <div className="stage-petals" aria-label={week === null ? "Chưa xác định ba tháng thai kỳ" : `Đang ở giai đoạn ${stage}`}>
            {[0, 1, 2].map((index) => (
              <span className={week !== null && index <= trimesterIndex ? "is-reached" : ""} key={index} />
            ))}
          </div>
          <p className="stage-nudge">{stageNudge(week)}</p>
          <details className="stage-settings" id="cai-dat-giai-doan" open={!dueDate}>
            <summary>
              <span>
                <strong>Cài đặt giai đoạn</strong>
                <small>{dueDate ? "Đang tự tính theo ngày dự sinh" : "Cài khi đã có ngày dự sinh"}</small>
              </span>
              <i aria-hidden="true">⌄</i>
            </summary>
            <div>
              <label htmlFor="due-date">Ngày dự sinh (bác sĩ xác nhận)</label>
              <input
                id="due-date"
                type="date"
                value={dueDate}
                disabled={!ready}
                onChange={(event) => updateDueDate(event.target.value)}
              />
            </div>
          </details>
        </div>
      </section>

      <BirthTransition />
      <a className="stage-feature-link" href="/chuan-bi-sinh"><span><small>Khi gia đình cần</small><strong>Kế hoạch sinh & chế độ cơn gò</strong></span><span aria-hidden="true">›</span></a>

      <nav className="pregnancy-jump" aria-label="Đi nhanh trong trang Mẹ bầu">
        <a href="#viec-hom-nay">Hôm nay</a>
        <a href="#vi-chat-thuoc">Thuốc</a>
        <a href="#bua-an">Chụp món</a>
        <a href="#suc-khoe">Ghi sức khỏe</a>
        <a href="#ho-so-kham">Lịch khám</a>
      </nav>

      <aside className="pregnancy-urgent-shortcut" aria-labelledby="urgent-shortcut-title">
        <div>
          <p className="panel-kicker">Cần tìm nhanh</p>
          <h2 id="urgent-shortcut-title">Có dấu hiệu bất thường?</h2>
          <p>Mở ngay hướng dẫn liên hệ nơi đang khám.</p>
        </div>
        <a href="#can-lien-he">Xem ngay</a>
      </aside>

      <section className="care-board" id="viec-hom-nay" aria-labelledby="daily-title">
        <div className="care-summary">
          <div>
            <p className="panel-kicker">Checklist {todayKey || "hôm nay"}</p>
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

      <PregnancyCareTracker pregnancyWeek={week} />

      <MealPhotoTracker />

      <div id="suc-khoe"><PregnancyHealthTracker /></div>

      <PregnancyMedicalRecords />

      <div className="pregnancy-reference-label"><span>Tham khảo khi cần</span></div>

      <section className="trimester-section" aria-labelledby="trimester-title">
        <div className="section-heading-row">
          <div>
            <p className="panel-kicker">Nhắc đúng việc · không tự chẩn đoán</p>
            <h2 id="trimester-title">Điều nên ưu tiên theo giai đoạn</h2>
          </div>
          <p>Ngày dự sinh chỉ giúp hiển thị tuần thai. Mọi lịch khám, xét nghiệm và thuốc vẫn theo nơi Mẹ Ngân đang được chăm sóc.</p>
        </div>
        <div className="trimester-grid">
          <article className="is-current">
            <small>Ưu tiên lúc này</small>
            <h3>{trimesterGuides[trimesterIndex].title}</h3>
            <p>{trimesterGuides[trimesterIndex].detail}</p>
          </article>
          <details className="later-trimesters">
            <summary>Xem các giai đoạn tiếp theo <span aria-hidden="true">⌄</span></summary>
            {trimesterGuides.filter((_, index) => index !== trimesterIndex).map((guide) => (
              <article key={guide.title}>
                <h3>{guide.title}</h3>
                <p>{guide.detail}</p>
              </article>
            ))}
          </details>
        </div>
      </section>

      <section className="guidance-section" id="cam-nang" aria-labelledby="guidance-title">
        <div className="section-heading-row">
          <div>
            <p className="panel-kicker">Cẩm nang thực hành · chạm để xem chi tiết</p>
            <h2 id="guidance-title">Nên ăn gì, hạn chế gì, kiêng gì?</h2>
          </div>
          <p>
            Phân biệt điều cần tránh thật sự với lời truyền miệng. Chỉ dẫn riêng
            của nơi đang khám luôn được ưu tiên.
          </p>
        </div>

        <div className="guidance-levels">
          {pregnancyGuidanceLevels.map((level) => (
            <article className={`guidance-level is-${level.id}`} key={level.id}>
              <header>
                <span aria-hidden="true">{level.mark}</span>
                <h3>{level.title}</h3>
              </header>
              <div className="guidance-list">
                {pregnancyGuidance.filter((item) => item.level === level.id).map((item) => (
                  <details className="guidance-item" key={item.id}>
                    <summary>
                      <span>
                        <small>{item.category}</small>
                        <strong>{item.title}</strong>
                      </span>
                      <i aria-hidden="true">⌄</i>
                    </summary>
                    <div>
                      <p>{item.detail}</p>
                      <p><b>Làm ngay:</b> {item.action}</p>
                      <a href={item.sourceHref} rel="noreferrer" target="_blank">
                        {item.sourceLabel} ↗
                      </a>
                    </div>
                  </details>
                ))}
              </div>
            </article>
          ))}
        </div>

        <aside className="guidance-myth">
          <strong>Không cần “kiêng” mọi món theo truyền miệng</strong>
          <p>
            Đồ cay hoặc chua chỉ cần giảm nếu làm Mẹ Ngân khó chịu. Các loại hạt
            vẫn dùng được nếu không dị ứng và bác sĩ không dặn tránh. Cũng không
            cần “ăn cho hai”.
          </p>
        </aside>
      </section>

      <section className="menu-section" aria-labelledby="menu-title">
        <div className="section-heading-row">
          <div>
            <p className="panel-kicker">Gợi ý, không phải đơn thuốc</p>
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

      <section className="urgent-care" id="can-lien-he" aria-labelledby="urgent-title">
        <p className="panel-kicker">Không chờ checklist</p>
        <h2 id="urgent-title">Khi nào cần liên hệ ngay</h2>
        <p>Nếu có một trong các dấu hiệu dưới đây, liên hệ cơ sở sản khoa đang theo dõi hoặc cấp cứu địa phương; không chờ EmBe trả lời.</p>
        <ul>
          {urgentCareReminders.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>

      <details className="source-section">
        <summary><h2>Nguồn đã đối chiếu</h2><span aria-hidden="true">⌄</span></summary>
        <ul>
          {pregnancySources.map((source) => (
            <li key={source.href}>
              <a href={source.href} rel="noreferrer" target="_blank">{source.label}</a>
            </li>
          ))}
        </ul>
      </details>

      <footer>
        <p>EmBe ưu tiên lưu tức thì trên điện thoại và tự đồng bộ an toàn.</p>
      </footer>
    </main>
  );
}
