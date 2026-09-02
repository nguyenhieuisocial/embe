import { EmBeMark } from "../../components/embe-icon";
import PasswordField from "../../components/password-field";
import PasskeyLogin from "../../components/passkey-login";
import PublicAnalytics from "../../components/public-analytics";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; next?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return (
    <main className="bare-page">
      <PublicAnalytics />
      <section className="bare-card" aria-labelledby="login-title">
        <span className="bare-mark" aria-hidden="true"><EmBeMark className="" /></span>
        <p className="eyebrow">EmBe · gia đình Ngân &amp; Hiếu</p>
        <h1 aria-label="Mời cả nhà vào bên trong" id="login-title">
          Mời cả nhà<br /><em>vào bên trong</em>
        </h1>
        <p className="intro">
          Nhập mật khẩu gia đình để mở nhật ký và những khoảnh khắc đã được bố mẹ chọn.
        </p>

        <form className="login-form" action="/api/auth/login" method="post">
          <input type="hidden" name="next" value={params.next ?? "/"} />
          <div className="field">
            <label htmlFor="password">Mật khẩu</label>
            <PasswordField />
          </div>
          {params.error === "1" ? (
            <p className="login-error" role="alert">
              Chưa vào được. Đợi một chút rồi thử lại.
            </p>
          ) : null}
          <button className="btn btn-primary btn-block" type="submit">Vào sổ gia đình</button>
        </form>
        <PasskeyLogin destination={params.next ?? "/"} />

        <p className="login-privacy">Nội dung không được hiển thị cho người chưa đăng nhập.</p>
      </section>
    </main>
  );
}
