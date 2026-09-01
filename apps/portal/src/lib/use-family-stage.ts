"use client";

import { useEffect, useState } from "react";

import { deriveFamilyStage, isPostpartumStage, type FamilyStage } from "./family-lifecycle";

export const FAMILY_STAGE_EVENT = "embe:family-stage-change";
const BIRTH_KEY = "embe:family:birth-occurred-at";
const DUE_DATE_KEY = "embe:pregnancy:due-date";

function localStage(): FamilyStage {
  return deriveFamilyStage({ dueDate: localStorage.getItem(DUE_DATE_KEY), birthOccurredAt: localStorage.getItem(BIRTH_KEY) });
}

export function useFamilyStage(): { stage: FamilyStage; postpartum: boolean } {
  const [stage, setStage] = useState<FamilyStage>("pregnancy-unknown");
  useEffect(() => {
    const refresh = () => setStage(localStage());
    refresh();
    window.addEventListener("storage", refresh); window.addEventListener(FAMILY_STAGE_EVENT, refresh);
    return () => { window.removeEventListener("storage", refresh); window.removeEventListener(FAMILY_STAGE_EVENT, refresh); };
  }, []);
  return { stage, postpartum: isPostpartumStage(stage) };
}
