import AppHeader from '../../../components/app-header';
import { StudioEditor } from '../../../components/studio-workspace';
import StudioNav from '../../../components/studio-nav';
import { studioTopic } from '../../../lib/studio';
import { uuid } from '../../../lib/studio-project';
import '../studio.css';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const query=await searchParams;const id=typeof query['du-an']==='string'&&uuid(query['du-an'])?query['du-an']:undefined;const template=typeof query.mau==='string'?studioTopic(query.mau):undefined;const ideaId=typeof query['y-tuong']==='string'?query['y-tuong']:undefined;return <main className="page studio-main"><AppHeader note="EmBe Mẹ Bầu"/><StudioNav/><header className="studio-heading"><h1>Soạn nội dung</h1></header><StudioEditor projectId={id} template={template} ideaId={ideaId}/></main>;}
