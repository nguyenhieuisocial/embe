import AppHeader from '../../../components/app-header';
import StudioNav from '../../../components/studio-nav';
import StudioReviewBoard from '../../../components/studio-review-board';
import { uuid } from '../../../lib/studio-project';
import '../studio.css';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const params=await searchParams;const id=params['du-an'];
  return <main className="page studio-main"><AppHeader note="EmBe Mẹ Bầu"/><StudioNav/><header className="studio-heading"><h1>Duyệt & đăng</h1><p>Giữ đúng bản video, nguồn và góp ý trước khi chia sẻ.</p></header><StudioReviewBoard initialProject={uuid(id)?id:undefined}/></main>;
}
