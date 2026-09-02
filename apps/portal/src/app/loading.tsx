import AppHeader from "../components/app-header";

export default function AppLoading() {
  return (
    <main className="page" aria-busy="true" aria-label="Đang mở nội dung">
      <AppHeader note="Đang mở…" tone="wait" />
      <section className="section skeleton" role="status">
        <span className="skeleton-line is-short" aria-hidden="true" />
        <span className="skeleton-line" aria-hidden="true" />
        <span className="skeleton-line" aria-hidden="true" />
        <p className="freshness">Đang mở phần bạn vừa chọn…</p>
      </section>
    </main>
  );
}
