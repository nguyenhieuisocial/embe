type LoginPageProps = {
  searchParams: Promise<{ error?: string; next?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="login-title">
        <p className="eyebrow">EMBE.HIEU.ASIA</p>
        <h1 id="login-title">Không gian riêng của gia đình</h1>
        <p className="login-intro">
          Nhập mật khẩu gia đình để mở nhật ký và những khoảnh khắc đã được bố mẹ chọn.
        </p>

        <form className="login-form" action="/api/auth/login" method="post">
          <input type="hidden" name="next" value={params.next ?? "/"} />
          <label htmlFor="password">Mật khẩu</label>
          <input
            autoComplete="current-password"
            autoFocus
            id="password"
            name="password"
            required
            type="password"
          />
          {params.error === "1" ? (
            <p className="login-error" role="alert">
              Mật khẩu chưa đúng. Vui lòng thử lại.
            </p>
          ) : null}
          <button type="submit">Mở nhật ký</button>
        </form>

        <p className="login-privacy">Nội dung không được hiển thị cho người chưa đăng nhập.</p>
      </section>
    </main>
  );
}
