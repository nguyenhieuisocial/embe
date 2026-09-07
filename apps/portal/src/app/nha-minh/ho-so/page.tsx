import Link from "next/link";
import AppHeader from "../../../components/app-header";
import FamilyMembers from "../../../components/family-members";
import "./profiles.css";

export default async function FamilyProfilesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const role = typeof query.role === "string" && ["mother", "father", "child", "relative"].includes(query.role) ? query.role : undefined;
  const tab = query.tab === "records" ? "records" : "profile";
  return <main className="page member-page">
    <AppHeader note="Nhà mình" />
    <Link href="/nha-minh" className="btn btn-quiet">Về Nhà mình</Link>
    <section className="section-head"><h1>Hồ sơ sức khỏe gia đình</h1><p>Ba, Mẹ, các con — bệnh án, số đo và giấy tờ qua từng giai đoạn.</p></section>
    <FamilyMembers key={`${role ?? "all"}:${tab}`} initialRole={role} initialTab={tab} />
  </main>;
}
