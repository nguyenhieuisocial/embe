/** Format only the already-authorized preview. Never enrich from private records here. */
export function compactPushCopy(message: {title:string;body:string}) {
  const trimBrand = (text:string) => text.replace(/(?:\s*[·|—–-]\s*|\n\s*)from embe\s*$/i, '').trim();
  const title = trimBrand(message.title);
  let body = trimBrand(message.body);
  // Keep genuine date/provider/detail previews intact. Only replace known boilerplate.
  const fallback = /^Mở EmBe để xem (.+?)(?: và thông tin liên quan| vừa thay đổi)\.$/.exec(body);
  if (fallback) body = `Chạm để xem ${fallback[1]}.`;
  if (body === 'Tài liệu đã tải lên, cần kiểm tra bản đọc trước khi thêm dữ liệu vào hồ sơ.') {
    body = 'Đã lưu giấy tờ. Mở để xem tiến độ đọc và dữ liệu trích xuất.';
  }
  return {title,body};
}
