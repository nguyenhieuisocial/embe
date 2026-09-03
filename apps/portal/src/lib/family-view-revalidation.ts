import { revalidatePath } from "next/cache";

export function revalidateFamilyViews(): void {
  revalidatePath("/");
}
