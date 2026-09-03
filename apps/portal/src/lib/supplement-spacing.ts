type NutrientPlan = {
  id: string;
  active: boolean;
  reminder_times: string[];
  nutrient_amounts: Partial<Record<"iron_mg" | "calcium_mg", number>>;
};

export type SupplementTimingConflict = {
  ironPlanId: string;
  calciumPlanId: string;
  time: string;
};

export function supplementTimingConflicts(plans: NutrientPlan[]): SupplementTimingConflict[] {
  const active = plans.filter((plan) => plan.active);
  const ironPlans = active.filter((plan) => Number(plan.nutrient_amounts.iron_mg ?? 0) > 0);
  const calciumPlans = active.filter((plan) => Number(plan.nutrient_amounts.calcium_mg ?? 0) > 0);
  const conflicts: SupplementTimingConflict[] = [];

  for (const iron of ironPlans) {
    for (const calcium of calciumPlans) {
      if (iron.id === calcium.id) continue;
      const calciumTimes = new Set(calcium.reminder_times.map((time) => time.slice(0, 5)));
      for (const time of iron.reminder_times.map((value) => value.slice(0, 5))) {
        if (calciumTimes.has(time)) conflicts.push({ ironPlanId: iron.id, calciumPlanId: calcium.id, time });
      }
    }
  }

  return conflicts;
}
