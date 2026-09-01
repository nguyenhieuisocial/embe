import { notFound } from "next/navigation";

import PrintPhoto from "../../../components/print-photo";
import { getMediaMemory } from "../../../lib/media";

export const dynamic = "force-dynamic";

export default async function PrintPhotoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const memory = await getMediaMemory(id);
  if (!memory) notFound();

  return <PrintPhoto caption={memory.caption} id={memory.id} title={memory.title} />;
}
