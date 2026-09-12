import {it,expect} from 'vitest';
import {iphoneHealthCoverage,latestIphoneReading,iphoneMetricSyncLabel,iphoneBloodPressureLabel,previousIphoneBodyMeasurement} from '../src/lib/iphone-health-summary';
it('counts measured zero but not missing or invalid numbers',()=>{
 const result=iphoneHealthCoverage({steps:0,weight_kg:54,height_cm:null,heart_rate_avg:NaN});
 expect(result.received).toBe(2);expect(result.total).toBe(19);
 expect(result.missing).toContain('Chiều cao');expect(result.missing).not.toContain('Bước chân');
});
it('finds older body measurements without filling current-day data',()=>{
 const rows=[{day:'2026-09-10',updated_at:'2026-09-10T10:00:00Z',height_cm:160,weight_kg:54},
  {day:'2026-09-11',updated_at:'2026-09-11T10:00:00Z',height_cm:null,weight_kg:55},
  {day:'2026-09-13',updated_at:'2026-09-13T10:00:00Z',height_cm:170,weight_kg:60}];
 expect(previousIphoneBodyMeasurement(rows,'height_cm','2026-09-12')).toEqual({day:'2026-09-10',value:160});
 expect(previousIphoneBodyMeasurement(rows,'weight_kg','2026-09-12')).toEqual({day:'2026-09-11',value:55});
 expect(rows[1].height_cm).toBeNull();
 expect(previousIphoneBodyMeasurement(rows,'weight_kg','2026-09-10')).toBeNull();
});
it('does not revive a removed same-day value or accept impossible dates and values',()=>{
 const rows=[{day:'2026-09-10',updated_at:'2026-09-10T10:00:00Z',weight_kg:54},
  {day:'2026-09-10',updated_at:'2026-09-10T11:00:00Z',weight_kg:null},
  {day:'2026-02-30',updated_at:'2026-03-01T10:00:00Z',weight_kg:54},
  {day:'2026-09-09',updated_at:'2026-09-09T10:00:00Z',weight_kg:NaN},
  {day:'2026-09-08',updated_at:'2026-09-08T10:00:00Z',weight_kg:0}];
 expect(previousIphoneBodyMeasurement(rows,'weight_kg','2026-09-12')).toBeNull();
});
it('uses each metric receipt time, without inventing one for missing or malformed metadata',()=>{
 const times={steps:'2026-09-12T08:00:00Z',heightCm:'2026-09-10T02:00:00Z',weightKg:'invalid'};
 expect(iphoneMetricSyncLabel(times,'steps')).toContain('15:00');
 expect(iphoneMetricSyncLabel(times,'heightCm')).toContain('10/09/2026');
 expect(iphoneMetricSyncLabel(times,'weightKg')).toBe('Chưa rõ giờ đồng bộ');
 expect(iphoneMetricSyncLabel(times,'sleepMinutes')).toBe('Chưa rõ giờ đồng bộ');
 expect(iphoneMetricSyncLabel(undefined,'steps')).toBe('Chưa rõ giờ đồng bộ');
});
it('keeps a received blood-pressure component visible without inventing its partner',()=>{
 expect(iphoneBloodPressureLabel(112,72)).toBe('112/72');
 expect(iphoneBloodPressureLabel(112,null)).toBe('112/—');
 expect(iphoneBloodPressureLabel(undefined,72)).toBe('—/72');
 expect(iphoneBloodPressureLabel(null,undefined)).toBe('—');
 expect(iphoneBloodPressureLabel(NaN,Infinity)).toBe('—');
});
it('keeps the newest daily snapshot even after browsing old history',()=>{
 const current={day:'2026-09-12',updated_at:'2026-09-12T12:00:00Z',steps:6000};
 expect(latestIphoneReading(current,[{...current,updated_at:'2026-09-12T08:00:00Z',steps:2000}])).toEqual(current);
 expect(latestIphoneReading(current,[{...current,day:'2026-09-11',updated_at:'2026-09-12T13:00:00Z'}])).toEqual(current);
 expect(latestIphoneReading(null,[])).toBeNull();
});
