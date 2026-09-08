import {it,expect} from 'vitest';
import {medicineDisplayGroups} from '../src/lib/medicine-display-groups';
it('shows a single name heading but retains differing source instructions',()=>{
 const rows=[{name:' Thuốc A ',dose:'1 viên'},{name:'thuốc A',dose:'2 viên'}];
 const groups=medicineDisplayGroups(rows,row=>row.name);
 expect(groups).toHaveLength(1);expect(groups[0].rows).toEqual(rows);expect(groups[0].rows[0].dose).toBe('1 viên');
});
it('does not combine different strengths, accents or near-matching drug names',()=>{
 const rows=['Thuốc 5mg','Thuốc 50mg','Thuoc 5mg','Thuốc B'];expect(medicineDisplayGroups(rows,row=>row)).toHaveLength(4);
});
it('keeps identical repeated rows as traceable sources rather than deleting them',()=>{
 const rows=[{name:'A',source:'a'},{name:'A',source:'b'}];expect(medicineDisplayGroups(rows,row=>row.name)[0].rows).toHaveLength(2);
});
