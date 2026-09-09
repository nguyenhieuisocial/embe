import {expect,it} from 'vitest';
import {medicineReadingKey,uniqueMedicineReadings} from '../src/lib/medicine-display-groups';
it('normalizes typography without losing dose or route differences',()=>{
 expect(medicineReadingKey(['10mg','Sau ăn · Buổi sáng.'])).toBe(medicineReadingKey(['10 mg','buổi sáng; sau ăn']));
 for(const text of ['20 mg','10 ml','10 mg uống','10 mg đặt'])expect(medicineReadingKey([text])).not.toBe(medicineReadingKey(['10 mg']));
 expect(medicineReadingKey(['2 lần/ngày'])).not.toBe(medicineReadingKey(['2 lần']));
});
it('keeps uncertainty when consolidating equivalent readings',()=>{
 const rows=uniqueMedicineReadings([{text:'10mg',unclear:false},{text:'10 mg',unclear:true}],r=>[r.text],(a,b)=>({...a,unclear:a.unclear||b.unclear}));
 expect(rows).toHaveLength(1);expect(rows[0].unclear).toBe(true);
});
