import AppHeader from "../../components/app-header";
import FamilyBookExport from "../../components/family-book-export";

export default function FamilyBookPage() {
  return (
    <main className="page family-book-main">
      <AppHeader note="Sổ riêng của gia đình" />
      <FamilyBookExport />
    </main>
  );
}
