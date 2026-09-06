const CONCERN_FLAGS = new Set(["raw_or_undercooked", "unpasteurized", "high_mercury_possible", "alcohol"]);

function fold(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d").toLocaleLowerCase("vi").replace(/[^a-z0-9]+/g, " ").trim();
}

function hasTerm(value: string, term: string): boolean {
  if (term === "chao") return value === "chao" || value.startsWith("chao ");
  return term.includes(" ") ? value.includes(term) : new Set(value.split(" ")).has(term);
}

export function inferMealFoodGroups(name: string): string[] {
  const normalized = fold(name);
  const rules: Array<[string, string[]]> = [
    ["starch", ["com", "pho", "bun", "mi", "mien", "hu tieu", "banh", "chao", "xoi", "nui", "khoai", "bap", "ngu coc", "yen mach"]],
    ["protein", ["bo", "ga", "heo", "thit", "ca", "tom", "muc", "cua", "ngheu", "ngao", "trung", "dau hu", "dau phu", "dau lang", "dau den", "dau xanh", "suon", "cha", "nem"]],
    ["vegetables", ["rau", "canh", "cai", "bi", "ca rot", "bong cai", "sup lo", "dua leo", "ca chua", "nam", "mong toi", "rau den", "xa lach", "gia", "muop", "bau", "kho qua"]],
    ["fruit", ["chuoi", "tao", "cam", "buoi", "oi", "xoai", "dua hau", "thanh long", "nho", "du du", "bo", "dau tay", "kiwi", "le", "quyt", "dua"]],
    ["dairy", ["sua", "sua chua", "yaourt", "yogurt", "pho mai"]],
    ["fat", ["bo lac", "mayonnaise", "dau oliu", "dau an", "hat dieu", "hanh nhan", "oc cho"]]
  ];
  const groups = rules.flatMap(([group, terms]) => terms.some((term) => hasTerm(normalized, term)) ? [group] : []);
  return [...new Set(groups)].slice(0, 4).length ? [...new Set(groups)].slice(0, 4) : ["other"];
}

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
