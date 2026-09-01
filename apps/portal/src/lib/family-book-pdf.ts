import type { MedicalRecord } from "./pregnancy-medical";

export type HealthMetric = {
  day: string;
  weightKg: number | null;
  systolic: number | null;
  diastolic: number | null;
  sleepMinutes: number | null;
  waterGlasses: number | null;
  movementMinutes: number | null;
  wellbeing: number | null;
  checklistPercent: number;
};

export type CarePlan = {
  id: string;
  category: "medicine" | "supplement";
  name: string;
  dose_display: string;
  times_per_day: number;
  instructions: string;
  confirmed_by_clinician: boolean;
  active: boolean;
};

export type FamilyBookReport = {
  dueDate: string | null;
  health: HealthMetric[];
  records: MedicalRecord[];
  plans: CarePlan[];
  unavailable: string[];
  lifecycle?: { birthOccurredAt: string | null; babySex?: "male" | "female" | null; birthWeightG?: number | null; birthLengthCm?: number | null };
  postpartum?: Array<Record<string, unknown>>;
  babyCare?: Array<{ id: string; kind: string; occurredAt: string; endedAt: string | null; details: Record<string, unknown> }>;
  babyMedical?: Array<{ id: string; kind: string; occurredAt: string; title: string; provider: string; notes: string }>;
  growth?: Array<{ id: string; measured_at: string; weight_g: number | null; length_cm: number | null; head_cm: number | null }>;
  milestones?: Array<{ id: string; observed_at: string; title: string; domain: string; notes: string }>;
};

type PdfInput = {
  data: FamilyBookReport;
  days: number;
  generatedAt: string;
  week: number | null;
};

type PdfNode = Record<string, unknown> | string;

function formatDay(value: string): string {
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh"
  }).format(date);
}

function average(values: Array<number | null>): number | null {
  const recorded = values.filter((value): value is number => typeof value === "number");
  return recorded.length ? recorded.reduce((sum, value) => sum + value, 0) / recorded.length : null;
}

function valueOrDash(value: number | null, suffix = ""): string {
  return value === null ? "—" : `${Number(value.toFixed(1))}${suffix}`;
}

function section(number: string, eyebrow: string, title: string): PdfNode {
  return {
    columns: [
      { text: number, color: "#d56f91", bold: true, fontSize: 11, width: 28 },
      { stack: [{ text: eyebrow, color: "#986175", fontSize: 8 }, { text: title, style: "sectionTitle" }] }
    ],
    margin: [0, 4, 0, 12]
  };
}

function stat(label: string, value: string | number): PdfNode {
  return { stack: [{ text: label, style: "statLabel" }, { text: String(value), style: "statValue" }], margin: [0, 7, 0, 7] };
}

function recordKind(kind: MedicalRecord["kind"]): string {
  if (kind === "ultrasound") return "Siêu âm";
  if (kind === "laboratory") return "Xét nghiệm";
  if (kind === "prescription") return "Đơn thuốc";
  if (kind === "appointment") return "Khám thai";
  return "Tài liệu";
}

export function buildFamilyBookDocument({ data, days, generatedAt, week }: PdfInput): Record<string, unknown> {
  const health = data.health.filter((item) =>
    [item.weightKg, item.systolic, item.diastolic, item.sleepMinutes, item.waterGlasses, item.movementMinutes, item.wellbeing]
      .some((value) => value !== null)
  );
  const latest = health.at(-1) ?? null;
  const avgSleep = average(health.map((item) => item.sleepMinutes));
  const avgWater = average(health.map((item) => item.waterGlasses));
  const avgMovement = average(health.map((item) => item.movementMinutes));
  const recordNodes: PdfNode[] = data.records.length ? data.records.map((record) => ({
    stack: [
      { columns: [{ text: recordKind(record.kind), style: "tag" }, { text: formatDay(record.occurredAt), alignment: "right", color: "#7d6c73", fontSize: 8 }] },
      { text: record.title, style: "cardTitle" },
      { text: [record.gestationalWeek ? `Tuần ${record.gestationalWeek}` : "", record.provider, record.clinician].filter(Boolean).join(" · ") || "Không có thông tin bổ sung", style: "muted" },
      ...(Object.keys(record.measurements).length ? [{
        columns: Object.entries(record.measurements).map(([key, value]) => ({
          stack: [{ text: key === "fetalHeartRate" ? "Nhịp tim thai" : key === "weightKg" ? "Cân nặng" : key === "systolic" ? "Huyết áp trên" : key === "diastolic" ? "Huyết áp dưới" : key, style: "statLabel" }, { text: String(value), bold: true, color: "#4f3d44" }]
        })), margin: [0, 7, 0, 0]
      }] : []),
      ...(record.medicines.length ? [{ ul: record.medicines.map((medicine) => `${medicine.name} ${[medicine.dose, medicine.frequency, medicine.instructions].filter(Boolean).join(" · ")}`), margin: [10, 7, 0, 0], color: "#4f3d44", fontSize: 9 }] : []),
      ...(record.notes ? [{ text: record.notes, italics: true, color: "#68575e", margin: [0, 7, 0, 0] }] : [])
    ],
    style: "card",
    unbreakable: true
  })) : [{ text: "Chưa có hồ sơ khám thai được lưu.", style: "empty" }];

  return {
    info: {
      title: `Sổ Mẹ & Bé · ${days} ngày`,
      author: "Gia đình Mẹ Ngân & Ba Hiếu",
      subject: "Bản tổng hợp dữ liệu thai kỳ riêng của gia đình"
    },
    pageSize: "A4",
    pageMargins: [40, 48, 40, 48],
    defaultStyle: { font: "Roboto", fontSize: 9, color: "#4f3d44", lineHeight: 1.25 },
    header: (currentPage: number) => currentPage === 1 ? null : ({ text: "Sổ Mẹ & Bé", alignment: "right", color: "#b48a99", fontSize: 8, margin: [40, 20, 40, 0] }),
    footer: (currentPage: number, pageCount: number) => ({ text: `${currentPage} / ${pageCount}`, alignment: "center", color: "#ae9da4", fontSize: 8, margin: [0, 14, 0, 0] }),
    content: [
      { text: "SỔ THEO DÕI RIÊNG CỦA GIA ĐÌNH", color: "#a36b80", characterSpacing: 1.2, fontSize: 9, alignment: "center", margin: [0, 85, 0, 18] },
      { text: "Mẹ Ngân", color: "#4f3d44", bold: true, fontSize: 32, alignment: "center" },
      { text: "& Em Bé", color: "#d56f91", italics: true, fontSize: 27, alignment: "center", margin: [0, 2, 0, 18] },
      { text: `${days} ngày gần nhất`, color: "#8f6877", fontSize: 12, alignment: "center" },
      { text: `Ba Hiếu cùng chăm sóc · Xuất ${generatedAt}`, color: "#a8949c", fontSize: 9, alignment: "center", margin: [0, 110, 0, 0], pageBreak: "after" },

      section("01", "HÀNH TRÌNH HIỆN TẠI", "Mẹ & Bé hôm nay"),
      { table: { widths: ["*", "*", "*", "*"], body: [[
        stat("Tuần thai", week ?? "—"), stat("Ngày dự sinh", data.dueDate ? formatDay(data.dueDate) : "Chưa ghi"),
        stat("Hồ sơ khám", data.records.length), stat("Ngày có số liệu", health.length)
      ]] }, layout: "lightHorizontalLines", margin: [0, 0, 0, 10] },
      { text: "Các con số được chép từ dữ liệu gia đình đã nhập; EmBe không dùng chúng để chẩn đoán.", style: "notice" },

      section("02", "NHẬT KÝ CỦA MẸ", "Sức khỏe đã ghi"),
      { table: { widths: ["*", "*", "*", "*"], body: [[
        stat("Cân nặng gần nhất", valueOrDash(latest?.weightKg ?? null, " kg")),
        stat("Ngủ trung bình", valueOrDash(avgSleep === null ? null : avgSleep / 60, " giờ")),
        stat("Nước trung bình", valueOrDash(avgWater, " cốc")),
        stat("Vận động trung bình", valueOrDash(avgMovement, " phút"))
      ]] }, layout: "lightHorizontalLines", margin: [0, 0, 0, 10] },
      ...(health.length ? [{
        table: {
          headerRows: 1,
          widths: [62, 51, 53, 38, 38, 48, 48],
          body: [
            ["Ngày", "Cân nặng", "Huyết áp", "Ngủ", "Nước", "Vận động", "Checklist"].map((text) => ({ text, style: "tableHeader" })),
            ...health.map((item) => [
              formatDay(item.day), valueOrDash(item.weightKg),
              item.systolic !== null && item.diastolic !== null ? `${item.systolic}/${item.diastolic}` : "—",
              item.sleepMinutes === null ? "—" : `${Number((item.sleepMinutes / 60).toFixed(1))}h`,
              valueOrDash(item.waterGlasses), valueOrDash(item.movementMinutes), `${item.checklistPercent}%`
            ])
          ]
        },
        layout: { fillColor: (rowIndex: number) => rowIndex === 0 ? "#f6dce5" : rowIndex % 2 === 0 ? "#fff4f7" : null, hLineColor: () => "#ead8de", vLineColor: () => "#ead8de", paddingLeft: () => 5, paddingRight: () => 5, paddingTop: () => 5, paddingBottom: () => 5 },
        fontSize: 7.5,
        margin: [0, 0, 0, 18]
      }] : [{ text: "Chưa có số liệu sức khỏe trong khoảng này.", style: "empty" }]),

      section("03", "THEO DÕI THAI KỲ", "Khám thai & thông tin của Bé"),
      ...recordNodes,

      section("04", "THEO ĐÚNG ĐIỀU ĐÃ ĐƯỢC DẶN", "Thuốc & vi chất đang ghi"),
      ...(data.plans.length ? data.plans.map((plan) => ({
        stack: [
          { text: `${plan.category === "medicine" ? "Thuốc" : "Vi chất"}${plan.confirmed_by_clinician ? " · đã xác nhận" : " · cần xác nhận lại"}`, style: "tag" },
          { text: plan.name, style: "cardTitle" },
          { text: `${plan.dose_display} · ${plan.times_per_day} lần/ngày${plan.instructions ? ` · ${plan.instructions}` : ""}`, style: "muted" }
        ], style: "card", unbreakable: true
      })) : [{ text: "Chưa có thuốc hoặc vi chất đang dùng được ghi trong EmBe.", style: "empty" }]),
      { text: "Chỉ dùng thuốc và vi chất theo hướng dẫn của bác sĩ hoặc dược sĩ. Sổ này dùng để xem lại, không thay thế đơn thuốc hay hồ sơ bệnh án.", style: "notice", margin: [0, 14, 0, 0] },
      ...(data.lifecycle?.birthOccurredAt ? [
        section("05", "SAU KHI BÉ CHÀO ĐỜI", "Hồi phục, chăm Bé & phát triển"),
        { table: { widths: ["*", "*", "*", "*"], body: [[
          stat("Ngày sinh", formatDay(data.lifecycle.birthOccurredAt)),
          stat("Lần chăm đã ghi", data.babyCare?.length ?? 0),
          stat("Hồ sơ của Bé", data.babyMedical?.length ?? 0),
          stat("Cột mốc", data.milestones?.length ?? 0)
        ]] }, layout: "lightHorizontalLines", margin: [0, 0, 0, 10] },
        ...(data.growth?.length ? [{ text: data.growth.slice(0, 8).map((entry) => `${formatDay(entry.measured_at)} · ${entry.weight_g ? `${Number((entry.weight_g / 1000).toFixed(2))} kg` : "—"} · ${entry.length_cm ? `${entry.length_cm} cm` : "—"}`).join("\n"), style: "muted", margin: [0, 4, 0, 12] }] : [{ text: "Chưa có số đo tăng trưởng trong khoảng này.", style: "empty" }]),
        ...(data.babyMedical?.length ? data.babyMedical.slice(0, 12).map((record) => ({ stack: [{ text: formatDay(record.occurredAt), style: "tag" }, { text: record.title, style: "cardTitle" }, { text: [record.provider, record.notes].filter(Boolean).join(" · ") || "Không có ghi chú", style: "muted" }], style: "card", unbreakable: true })) : [])
      ] : []),
      ...(data.unavailable.length ? [{ text: `Dữ liệu tạm thiếu khi xuất: ${data.unavailable.join(", ")}.`, color: "#9a526d", fontSize: 8, margin: [0, 10, 0, 0] }] : [])
    ],
    styles: {
      sectionTitle: { fontSize: 17, bold: true, color: "#4f3d44", margin: [0, 1, 0, 0] },
      statLabel: { fontSize: 7.5, color: "#8b727c" },
      statValue: { fontSize: 11, bold: true, color: "#4f3d44", margin: [0, 3, 0, 0] },
      notice: { fontSize: 8, color: "#7b626c", fillColor: "#fbeaf0", margin: [0, 0, 0, 18] },
      tableHeader: { bold: true, color: "#72485a", fontSize: 7.5 },
      card: { margin: [0, 0, 0, 10], fillColor: "#fff4f7" },
      cardTitle: { bold: true, fontSize: 11, color: "#4f3d44", margin: [0, 4, 0, 3] },
      tag: { color: "#b45276", bold: true, fontSize: 8 },
      muted: { color: "#79676e", fontSize: 8.5 },
      empty: { color: "#8b777e", italics: true, margin: [0, 0, 0, 15] }
    }
  };
}

function familyBookFilename(input: PdfInput): string {
  return `so-me-va-be-${new Date().toISOString().slice(0, 10)}-${input.days}-ngay.pdf`;
}

async function familyBookPdfBlob(input: PdfInput): Promise<Blob> {
  const [{ default: pdfMake }, { default: vfs }] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    import("pdfmake/build/vfs_fonts")
  ]);
  pdfMake.addVirtualFileSystem(vfs);
  return pdfMake.createPdf(buildFamilyBookDocument(input)).getBlob();
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function downloadFamilyBookPdf(input: PdfInput): Promise<void> {
  downloadBlob(await familyBookPdfBlob(input), familyBookFilename(input));
}

export async function shareFamilyBookPdf(input: PdfInput): Promise<void> {
  const blob = await familyBookPdfBlob(input);
  const file = new File([blob], familyBookFilename(input), { type: "application/pdf" });
  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    await navigator.share({ files: [file], title: "Sổ Mẹ & Bé", text: "Sổ gia đình của Mẹ Ngân và Em Bé" });
    return;
  }
  downloadBlob(blob, file.name);
}

export async function openFamilyBookPdf(input: PdfInput): Promise<void> {
  const pdfWindow = window.open("", "_blank");
  if (!pdfWindow) throw new Error("PDF window was blocked");

  try {
    const blob = await familyBookPdfBlob(input);
    const url = URL.createObjectURL(blob);
    pdfWindow.location.replace(url);
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    pdfWindow.close();
    throw error;
  }
}
