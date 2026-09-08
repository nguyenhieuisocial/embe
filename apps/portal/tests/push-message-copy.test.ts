import {expect,it} from 'vitest';
import {compactPushCopy} from '../src/lib/push-message-copy';
it('removes a redundant app signature but preserves actual administrative detail',()=>{
 expect(compactPushCopy({title:'Ba vừa thêm phiếu xét nghiệm — from embe',body:'Phiếu xét nghiệm · 08:30 08/09/2026 · Cơ sở mẫu\nfrom EmBe'})).toEqual({title:'Ba vừa thêm phiếu xét nghiệm',body:'Phiếu xét nghiệm · 08:30 08/09/2026 · Cơ sở mẫu'});
});
it('does not add private detail to a hidden-preview notification',()=>{
 expect(compactPushCopy({title:'Mẹ vừa cập nhật đơn thuốc',body:'Mở EmBe để xem đơn thuốc và thông tin liên quan.'}).body).toBe('Chạm để xem đơn thuốc.');
});
it('does not claim an uploaded document has been read or imported',()=>{
 expect(compactPushCopy({title:'Đã tải tài liệu',body:'Tài liệu đã tải lên, cần kiểm tra bản đọc trước khi thêm dữ liệu vào hồ sơ.'}).body).toBe('Đã lưu giấy tờ. Mở để xem tiến độ đọc và dữ liệu trích xuất.');
});
it('preserves meaningful prose mentioning EmBe',()=>{
 expect(compactPushCopy({title:'EmBe',body:'Thông tin from embe còn ở giữa câu.'}).body).toBe('Thông tin from embe còn ở giữa câu.');
});
