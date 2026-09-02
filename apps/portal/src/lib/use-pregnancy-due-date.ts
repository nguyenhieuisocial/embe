"use client";

import { useEffect, useState } from "react";

import { dateInVietnam } from "./family-task-contract";
import { cachedPrivateGet } from "./private-get-cache";

const DUE_DATE_KEY = "embe:pregnancy:due-date";
const STAGE_CHANGE_EVENT = "embe:pregnancy-stage-change";

type PregnancyState = { dueDate?: string | null };

export function usePregnancyDueDate(): string {
  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    let active = true;
    const readCache = () => setDueDate(localStorage.getItem(DUE_DATE_KEY) ?? "");

    readCache();
    void cachedPrivateGet(`/api/pregnancy?day=${dateInVietnam()}`).then(async (response) => {
      if (!response.ok || !active) return;
      const state = await response.json() as PregnancyState;
      if (!active) return;
      if (typeof state.dueDate === "string") {
        localStorage.setItem(DUE_DATE_KEY, state.dueDate);
        setDueDate(state.dueDate);
      } else if (state.dueDate === null) {
        localStorage.removeItem(DUE_DATE_KEY);
        setDueDate("");
      }
    }).catch(() => undefined);

    window.addEventListener("storage", readCache);
    window.addEventListener(STAGE_CHANGE_EVENT, readCache);
    return () => {
      active = false;
      window.removeEventListener("storage", readCache);
      window.removeEventListener(STAGE_CHANGE_EVENT, readCache);
    };
  }, []);

  return dueDate;
}
