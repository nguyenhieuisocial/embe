import { EmBeMark } from "../../components/embe-icon";
import PasswordField from "../../components/password-field";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; next?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return (
    <main className="bare-page">
      <section className="bare-card" aria-labelledby="login-title">
        <span className="bare-mark" aria-hidden="true"><EmBeMark className="" /></span>
        <p className="eyebrow">EMBE · GIA ĐÌNH NGÂN &amp; HIẾU</p>
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
              Mật khẩu chưa đúng. Vui lòng thử lại.
            </p>
          ) : null}
          <button className="btn btn-primary btn-block" type="submit">Vào sổ gia đình</button>
        </form>

        <p className="login-privacy">Nội dung không được hiển thị cho người chưa đăng nhập.</p>
      </section>
    </main>
  );
}
