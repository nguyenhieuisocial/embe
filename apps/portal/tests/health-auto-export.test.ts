import {describe,it,expect} from 'vitest';
import {healthAutoExportLink,normalizeHealthAutoExport} from '../src/lib/health-auto-export';
const token=`embe_health_${'a'.repeat(43)}`;
const endpoint='https://embe.hieu.asia/api/pregnancy/iphone-health';
const metric=(name:string,units:string,data:unknown[])=>({name,units,data});
describe('Health Auto Export bridge',()=>{
 it('preconfigures the private receiver without starting uploads or selecting unsupported health data',()=>{
  const link=new URL(healthAutoExportLink(token,endpoint));
  expect(link.protocol.toLowerCase()).toBe('com.healthexport:');
  expect(link.searchParams.get('url')).toBe(endpoint);
  expect(link.searchParams.get('headers')).toBe(`Authorization,Bearer ${token}`);
  expect(link.searchParams.get('enabled')).toBe('false');
  expect(link.searchParams.get('period')).toBe('none');
  expect(link.searchParams.get('interval')).toBe('days');
  expect(link.searchParams.get('metrics')?.split(',')).toHaveLength(18);
  expect(healthAutoExportLink(token,'https://example.com/health')).toBe('');
  expect(healthAutoExportLink('bad',endpoint)).toBe('');
 });
 it('maps 18 groups to 19 measured daily values, preserving date and units',()=>{
  const date='2026-09-12 00:00:00 +0700';
  const common=[['step_count','count',1000],['active_energy','kcal',200],['basal_energy_burned','kcal',1200],
   ['weight_&_body_mass','kg',54],['height','cm',160],['walking_running_distance','km',2],['dietary_water','mL',1500],
   ['resting_heart_rate','bpm',65],['respiratory_rate','count/min',16],['blood_oxygen_saturation','%',98],
   ['body_temperature','degC',36.7],['apple_sleeping_wrist_temperature','degC',36.4],
   ['heart_rate_variability','ms',40],['apple_exercise_time','min',20],['mindful_minutes','min',5]];
  const result=normalizeHealthAutoExport({data:{metrics:[...common.map(([name,units,qty])=>metric(String(name),String(units),[{date,qty}])),
   metric('heart_rate','bpm',[{date,Min:60,Avg:70,Max:90}]),
   metric('sleep_analysis','hr',[{date,totalSleep:7,inBed:8,core:3,deep:2,rem:2}]),
   metric('blood_pressure','mmHg',[{date,systolic:110,diastolic:70}])],workouts:[]}});
  expect(result?.data).toHaveLength(19);
  expect(result?.data.find(x=>x.type==='Sleep')?.value).toBe(7);
  expect(result?.data.find(x=>x.type==='Heart Rate')?.value).toBe(70);
  expect(result?.data[0].date).toBe('2026-09-12T00:00:00+07:00');
 });
 it('rejects raw sleep, duplicate daily totals, unsupported types and missing quantities',()=>{
  for(const metrics of [
   [metric('sleep_analysis','hr',[{date:'2026-09-12',qty:1,value:'In Bed'}])],
   [metric('step_count','count',[{date:'2026-09-12T08:00:00Z',qty:100},{date:'2026-09-12T09:00:00Z',qty:200}])],
   [metric('blood_glucose','mg/dL',[{date:'2026-09-12',qty:95}])],
   [metric('height','cm',[{date:'2026-09-12',qty:null}])]
  ])expect(normalizeHealthAutoExport({data:{metrics}})).toBeNull();
  expect(normalizeHealthAutoExport({data:{metrics:[],medications:[{}]}})).toBeNull();
 });
});
