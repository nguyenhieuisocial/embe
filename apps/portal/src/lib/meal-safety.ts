import foodGroupTerms from "./vietnamese-food-groups.json";

const CONCERN_FLAGS = new Set(["raw_or_undercooked", "unpasteurized", "high_mercury_possible", "alcohol"]);

function fold(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d").toLocaleLowerCase("vi").replace(/[^a-z0-9]+/g, " ").trim();
}

function words(value: string): string[] {
  return value.normalize("NFC").toLocaleLowerCase("vi").match(/[\p{L}\p{N}]+/gu) ?? [];
}

export function inferMealFoodGroups(name: string): string[] {
  const tokens = words(name);
  const matches: Array<{ group: string; start: number; length: number }> = [];
  for (const [group, terms] of Object.entries(foodGroupTerms)) {
    for (const term of terms) {
      const phrase = words(term);
      for (let start = 0; start <= tokens.length - phrase.length; start += 1) {
        // An accent supplied by the user carries meaning: bò != bơ, cá != cà.
        if (!phrase.every((word, offset) => {
          const token = tokens[start + offset];
          return token !== fold(token) ? token === word : token === fold(word);
        })) continue;
        if (phrase.length === 1 && ["bo", "ca"].includes(tokens[start])) continue;
        if (term === "cháo" && start > 0 && fold(tokens[start - 1]) === "ap") continue;
        matches.push({ group, start, length: phrase.length });
      }
    }
  }
  // Prefer specific ingredients: cà chua over cá; sữa đậu nành over sữa.
  const occupied = new Set<number>();
  const groups = new Set<string>();
  for (const match of matches.sort((a, b) => b.length - a.length)) {
    const positions = Array.from({ length: match.length }, (_, offset) => match.start + offset);
    if (positions.some((position) => occupied.has(position))) continue;
    positions.forEach((position) => occupied.add(position));
    groups.add(match.group);
  }
  const result = Object.keys(foodGroupTerms).filter((group) => groups.has(group)).slice(0, 4);
  return result.length ? result : ["other"];
}

export function deriveMealSafetyFlags(name: string): string[] {
  const normalized = ` ${fold(name)} `;
  const hasTerm = (term: string) => normalized.includes(` ${fold(term)} `);
  const flags: string[] = [];
  if (["rượu", "bia", "cồn", "alcohol"].some(hasTerm)) flags.push("alcohol");
  if (["cá kiếm", "cá mập", "cá thu vua", "cá kình"].some(hasTerm)) {
    flags.push("high_mercury_possible");
  }
  if (["sống", "tái", "lòng đào", "chưa chín", "sushi", "sashimi"].some(hasTerm)) {
    flags.push("raw_or_undercooked");
  }
  if (["chưa tiệt trùng", "không tiệt trùng", "sữa tươi thô"].some(hasTerm)) {
    flags.push("unpasteurized");
  }
  return flags;
}

export function hasMealSafetyConcern(flags: Iterable<string>): boolean {
  return [...flags].some((flag) => CONCERN_FLAGS.has(flag));
}
