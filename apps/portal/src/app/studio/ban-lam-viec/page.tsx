import AppHeader from '../../../components/app-header';
import StudioWorkspace from '../../../components/studio-workspace';
import StudioNav from '../../../components/studio-nav';
import { studioTopics } from '../../../lib/studio';
import '../studio.css';
export default function Page(){return <main className="page studio-main"><AppHeader note="EmBe Mẹ Bầu"/><StudioNav/><header className="studio-heading"><h1>Bàn làm việc</h1><p>Viết, dựng và giữ các bản nội dung của bạn.</p></header><StudioWorkspace templates={studioTopics()}/></main>;}
