import Link from "next/link";
import AppHeader from "../../../components/app-header";
import PregnancyMemories from "../../../components/pregnancy-memories";

export default function PregnancyMemoriesPage() {
  return <main className="page"><AppHeader note="Kỷ niệm riêng của hai mình" /><Link href="/ky-niem">‹ Kỷ niệm</Link>
    <header><h1>Từng tuần bên con</h1></header><PregnancyMemories /></main>;
}
