"use client";

import Link from "next/link";

import { Icon } from "../components/embe-icon";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="bare-page">
      <section className="bare-card">
        <span className="bare-mark is-error" aria-hidden="true"><Icon name="alert" className="" /></span>
        <p className="eyebrow">EmBe vẫn giữ nội dung của gia đình</p>
        <h1>Trang này chưa mở được</h1>
        <p>
          Không có gì bị mất. Hãy thử mở lại; nếu vẫn chưa được, mở lại EmBe sau
          ít phút là đủ.
        </p>
        <button className="btn btn-primary btn-block" type="button" onClick={reset}>Thử mở lại</button>
        <Link className="btn btn-text" href="/">Về trang gia đình</Link>
      </section>
    </main>
  );
}
