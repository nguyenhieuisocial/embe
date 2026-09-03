"use client";

import MealPhotoTracker from "./meal-photo-tracker";
import PregnancyCareTracker from "./pregnancy-care-tracker";
import PregnancyHealthTracker from "./pregnancy-health-tracker";
import PregnancyMedicalRecords from "./pregnancy-medical-records";

export default function PregnancyDailyTools({ pregnancyWeek }: { pregnancyWeek: number | null }) {
  return (
    <>
      <PregnancyCareTracker pregnancyWeek={pregnancyWeek} />
      <MealPhotoTracker />
      <div id="suc-khoe"><PregnancyHealthTracker pregnancyWeek={pregnancyWeek} /></div>
      <PregnancyMedicalRecords />
    </>
  );
}
