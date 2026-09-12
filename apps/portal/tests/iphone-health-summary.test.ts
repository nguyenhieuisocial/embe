import {it,expect} from 'vitest';
import {iphoneHealthCoverage,latestIphoneReading} from '../src/lib/iphone-health-summary';
it('counts measured zero but not missing or invalid numbers',()=>{
 const result=iphoneHealthCoverage({steps:0,weight_kg:54,height_cm:null,heart_rate_avg:NaN});
 expect(result.received).toBe(2);expect(result.total).toBe(19);
 expect(result.missing).toContain('Chiều cao');expect(result.missing).not.toContain('Bước chân');
});
it('keeps the newest daily snapshot even after browsing old history',()=>{
 const current={day:'2026-09-12',updated_at:'2026-09-12T12:00:00Z',steps:6000};
 expect(latestIphoneReading(current,[{...current,updated_at:'2026-09-12T08:00:00Z',steps:2000}])).toEqual(current);
 expect(latestIphoneReading(current,[{...current,day:'2026-09-11',updated_at:'2026-09-12T13:00:00Z'}])).toEqual(current);
 expect(latestIphoneReading(null,[])).toBeNull();
});
