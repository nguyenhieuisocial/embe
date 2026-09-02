const CONCERN_FLAGS = new Set(["raw_or_undercooked", "unpasteurized", "high_mercury_possible", "alcohol"]);

export function deriveMealSafetyFlags(name: string): string[] {
  const normalized = name.toLocaleLowerCase("vi");
  const flags: string[] = [];
  if (["rượu", "bia", "cồn", "alcohol"].some((term) => normalized.includes(term))) flags.push("alcohol");
  if (["cá kiếm", "cá mập", "cá thu vua", "cá kình"].some((term) => normalized.includes(term))) {
    flags.push("high_mercury_possible");
  }
  if (["sống", "tái", "lòng đào", "chưa chín", "sushi", "sashimi"].some((term) => normalized.includes(term))) {
    flags.push("raw_or_undercooked");
  }
  if (["chưa tiệt trùng", "không tiệt trùng", "sữa tươi thô"].some((term) => normalized.includes(term))) {
    flags.push("unpasteurized");
  }
  return flags;
}

export function hasMealSafetyConcern(flags: Iterable<string>): boolean {
  return [...flags].some((flag) => CONCERN_FLAGS.has(flag));
}
