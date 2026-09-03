export default function PregnancyLoading() {
  return (
    <main className="pregnancy-main pregnancy-route-loading" aria-busy="true" aria-label="Đang mở phần chăm sóc Mẹ">
      <div className="route-loading-wordmark">EmBe</div>
      <div className="route-loading-line is-short" />
      <div className="route-loading-line is-title" />
      <div className="route-loading-card" />
      <span className="sr-only">Đang mở…</span>
    </main>
  );
}
