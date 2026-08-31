"use client";

import { Icon } from "../components/embe-icon";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="bare-page">
      <section className="bare-card">
        <span className="bare-mark is-error" aria-hidden="true"><Icon name="alert" className="" /></span>
        <p className="eyebrow">EMBE VẪN GIỮ NỘI DUNG CỦA GIA ĐÌNH</p>
        <h1>Trang này chưa mở được</h1>
        <p>
          Không có gì bị mất. Hãy thử mở lại; nếu vẫn chưa được, mở lại EmBe sau
          ít phút là đủ.
        </p>
        <button className="btn btn-primary btn-block" type="button" onClick={reset}>Thử mở lại</button>
        <a className="btn btn-text" href="/">Về trang gia đình</a>
      </section>
    </main>
  );
}
