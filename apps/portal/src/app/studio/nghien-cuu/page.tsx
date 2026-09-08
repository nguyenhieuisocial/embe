import type { Metadata } from 'next';
import Link from 'next/link';
import AppHeader from '../../../components/app-header';
import StudioNav from '../../../components/studio-nav';
import { editorialSeries, researchCautions, researchCoverage, researchDate, researchProfile, researchTools } from '../../../content/studio-research';
import '../studio.css';

export const metadata: Metadata = { title: 'Nghiên cứu nội dung — EmBe Studio' };

export default function StudioResearchPage() {
  return <main className="page studio-main">
    <AppHeader note="EmBe Mẹ Bầu" />
    <StudioNav />
    <Link className="studio-back" href="/studio">‹ Về Studio</Link>
    <header className="studio-heading"><h1>Từ tham khảo đến nội dung EmBe</h1><p>Đối chiếu ngày {researchDate}. Học cách giải thích, không sao chép tác phẩm.</p></header>
    <aside className="studio-notice"><strong>Độ phủ nghiên cứu</strong><p>Đã lập chỉ mục {researchCoverage.indexed} bài theo tiêu đề và liên kết hiển thị. {researchCoverage.reachedEnd ? 'Đã tới điểm cuối mà giao diện cho xem.' : 'Chưa xác nhận đã tới cuối kênh.'} Chưa đọc hết từng ảnh, từng lời trong toàn bộ bài.</p></aside>
    <section className="studio-disclosure">
      <h2 className="studio-research-title">Điều đáng học</h2>
      <p>Kênh kết hợp thai kỳ, đi sinh, ăn dặm, chăm bé và đánh giá sản phẩm. Điểm dễ đọc là bảng chia hàng, minh họa nhỏ, màu phân nhóm và checklist có thể lưu lại.</p>
      <p>Hai mẫu chính là bộ 13 và 15 ảnh, không phải video. EmBe chuyển cách trình bày thành bảng có giọng Việt và nhấn sáng từng ý; không tải lại ảnh, nhạc hoặc giọng tác giả.</p>
      <a href={researchProfile} target="_blank" rel="noopener noreferrer">Mở kênh tham khảo trên Rednote</a>
      <p>Phần quảng cáo, lịch bổ sung vi chất và các khẳng định “tương khắc” phải tách khỏi kiến thức. Không dùng số lượt thích để kết luận nội dung đúng hoặc sẽ viral.</p>
    </section>
    <details className="studio-disclosure">
      <summary>12 tuyến nội dung nên phát triển</summary>
      <p>Đây là đề cương biên tập, không phải 12 video đã làm xong hoặc lời khuyên đã duyệt chuyên môn.</p>
      <ul>{editorialSeries.map(series => <li key={series.title}><h3>{series.title}</h3><p><strong>{series.format}.</strong> {series.brief}</p></li>)}</ul>
    </details>
    <details className="studio-disclosure">
      <summary>Công cụ đã rà và lựa chọn cho EmBe</summary>
      <p>Giấy phép phần mềm không cấp quyền dùng video, giọng nói hoặc dữ liệu của người khác. Trạng thái dưới đây phân biệt công cụ đã dùng và ứng viên chưa cài.</p>
      <ul>{researchTools.map(tool => <li key={tool.name} className="studio-research-tool"><a href={tool.url} target="_blank" rel="noopener noreferrer">{tool.name}</a><p><strong>{tool.status}.</strong> {tool.note}</p><p>Giấy phép: {tool.license}.</p></li>)}</ul>
      <p>Không tìm thấy repo công khai tại các tên XingLaoTi/Xiaohongshu-Spider, LokerL/xiaohongshu_spider, XingLaoTi/social-auto-upload và pyvideotrans/typewriter trong lần kiểm tra này. “mocr” chưa đủ rõ để xác định đúng công cụ.</p>
    </details>
    <details className="studio-disclosure">
      <summary>Khám phá xu hướng: phần đã chạy và giới hạn</summary>
      <Link href="/studio/kham-pha">Mở Khám phá chủ đề & sổ ý tưởng</Link>
      <p>Đã có RSS Google Trends Việt Nam, mười nhóm từ khóa Việt–Trung–Anh, liên kết tìm kiếm bảy nền tảng/công cụ, sổ lưu trên thiết bị và dàn ý xuất được. Chưa có collector tự động cho Xiaohongshu, Douyin, TikTok, Bilibili hoặc Kuaishou; chưa có đồng bộ sổ lên cloud hoặc lịch quét nền.</p>
      <p>Tổng tương tác chia tuổi bài chỉ là chỉ số ưu tiên có giảm theo thời gian, không đo tốc độ tăng thực. EmBe tính chênh lệch cùng chỉ số giữa hai lần ghi nhận, yêu cầu cách ít nhất một giờ; số thiếu không thay bằng 0. Không trộn thứ hạng giữa các nền tảng hoặc suy ra nhu cầu y khoa.</p>
      <p>Chưa tìm thấy repo công khai tại PaulS22/yt-dlp, JoeanA/XiaohongshuCrawler, Tencent/QingLong, NyanSank/bilibili-manga-downloader, im2233/hot-list, ourfor/news-now, Geoff-Ford/shazamio và dotMPEG/ShazamAPI ở lần kiểm tra này. Tên mơ hồ như BilibiliReq, hot-list cần xác định lại, không tự coi là tích hợp có sẵn.</p>
      <p>Nhận diện nhạc không cấp quyền dùng nhạc; chưa có bằng chứng cho con số “BGM quyết định 50% viral”. Mạng người theo dõi không chứng minh seeding hoặc MCN. Không thêm bot tương tác, né chặn, affiliate tự động hoặc phân tích lợi nhuận vào sản phẩm mẹ bầu hiện tại.</p>
    </details>
    <details className="studio-disclosure">
      <summary>Những khẳng định cần sửa</summary>
      {researchCautions.map(item => <section key={item.title}><h3>{item.title}</h3><p>{item.text}</p><a href={item.url} target="_blank" rel="noopener noreferrer">{item.label}</a></section>)}
    </details>
    <details className="studio-disclosure">
      <summary>Quy trình phù hợp, không làm máy nặng thêm</summary>
      <p>Chọn câu hỏi → đối chiếu nguồn → viết kịch bản Việt gốc → tạo minh họa và giọng → dựng bản nháp → nghe/xem, duyệt chuyên môn và quyền sử dụng → xuất bản được phép.</p>
      <p>Hiện dùng hàng đợi SQLite, một worker chạy từng lượt, giới hạn luồng xử lý và kho file riêng. Không thêm Docker, Redis, RAM-disk hoặc dịch vụ chạy 24/7. File trung gian giúp tiếp tục và kiểm tra khi bị gián đoạn.</p>
      <p>Mỗi bản cần giữ nguồn, quyền sử dụng, phiên bản lời đọc, checksum và trạng thái duyệt. Kiểm tra codec/âm thanh chỉ xác nhận file hoạt động, không thay duyệt phát âm hoặc y khoa.</p>
      <p>Không thu bình luận, dữ liệu người theo dõi hay nội dung riêng tư. Không xuất cookie, vượt CAPTCHA, giả tương tác, thay IP để né chặn hoặc xóa dấu tác giả để reup. Gặp hạn chế thì dừng phần truy cập đó.</p>
      <p>Chưa cần thêm token hoặc tài khoản cho phần đã thực hiện. Dịch/lồng tiếng trực tiếp tác phẩm gốc cần quyền sử dụng phù hợp; đăng mạng xã hội cần chọn kênh và cách xuất bản đáp ứng điều khoản.</p>
    </details>
  </main>;
}
