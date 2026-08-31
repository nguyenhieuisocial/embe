"use client";

import { useState } from "react";

export default function PasswordField() {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-control">
      <input
        autoCapitalize="off"
        autoComplete="current-password"
        autoFocus
        id="password"
        name="password"
        required
        spellCheck={false}
        type={visible ? "text" : "password"}
      />
      <button
        aria-controls="password"
        aria-pressed={visible}
        className="password-toggle"
        onClick={() => setVisible((current) => !current)}
        type="button"
      >
        {visible ? "Ẩn" : "Hiện"}
      </button>
    </div>
  );
}
