import { Icon } from "../../components/embe-icon";

export default function OfflinePage() {
  return (
    <main className="bare-page">
      <section className="bare-card" role="status">
        <span className="bare-mark is-wait" aria-hidden="true"><Icon name="refresh" className="" /></span>
        <p className="eyebrow">EMBE ĐANG CHỜ KẾT NỐI</p>
        <h1>Điện thoại đang mất mạng</h1>
        <p>
          Hãy kiểm tra Wi‑Fi hoặc 4G/5G. Ghi chú đang viết thường được giữ tạm trên
          máy và sẽ gửi lại khi có mạng; để chắc chắn, bạn hãy giữ trang đang viết mở.
        </p>
        <a className="btn btn-primary btn-block" href="/">Thử mở lại EmBe</a>
      </section>
    </main>
  );
}
