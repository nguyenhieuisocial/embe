"use client";

export default function AppRefreshControl() {
  return (
    <section className="section app-refresh-control" aria-labelledby="app-refresh-title">
      <div>
        <p className="panel-kicker">Không cần tắt ứng dụng</p>
        <h2 id="app-refresh-title">Làm mới EmBe</h2>
        <p>Dùng khi vừa có tính năng mới hoặc màn hình chưa cập nhật.</p>
      </div>
      <button type="button" onClick={() => window.history.go(0)}>Tải lại EmBe</button>
    </section>
  );
}
