import {expect,it} from 'vitest';
import {explicitDailyFrequency} from '../src/lib/prescription-frequency';
it('copies only explicit daily counts',()=>{
 for(const text of ['2 lần/ngày','2 lần mỗi ngày','Ngày uống 2 lần','ngày dùng 2 lần']) expect(explicitDailyFrequency(text)).toBe(2);
});
it('does not invent daily schedules from conditional, weekly, ranged or dosage text',()=>{
 for(const text of ['', '2 viên', '2 lần/tuần','1–2 lần/ngày','2 lần/ngày khi đau','sáng và tối','cách 8 giờ','7 lần/ngày']) expect(explicitDailyFrequency(text)).toBeNull();
});
