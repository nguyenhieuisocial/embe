// Provider contract: help.healthyapps.dev/en/health-auto-export/automations/deep-link/
// Only daily summaries supported by EmBe are requested; this is not a full Health archive.
const METRICS = [
  ['Step Count','step_count','Steps'], ['Active Energy','active_energy','Active Calories'],
  ['Basal Energy Burned','basal_energy_burned','Basal Energy Burned'],
  ['Sleep Analysis','sleep_analysis','Sleep'], ['Weight & Body Mass','weight_&_body_mass','Weight'],
  ['Height','height','Height'], ['Walking + Running Distance','walking_running_distance','Walking + Running Distance'],
  ['Dietary Water','dietary_water','Water'], ['Heart Rate','heart_rate','Heart Rate'],
  ['Resting Heart Rate','resting_heart_rate','Resting Heart Rate'],
  ['Respiratory Rate','respiratory_rate','Respiratory Rate'],
  ['Blood Oxygen Saturation','blood_oxygen_saturation','Blood Oxygen'],
  ['Body Temperature','body_temperature','Body Temperature'],
  ['Apple Sleeping Wrist Temperature','apple_sleeping_wrist_temperature','Wrist Temperature'],
  ['Heart Rate Variability','heart_rate_variability','Heart Rate Variability'],
  ['Apple Exercise Time','apple_exercise_time','Exercise Time'],
  ['Mindful Minutes','mindful_minutes','Mindful Minutes'], ['Blood Pressure','blood_pressure','Blood Pressure']
] as const;

export function healthAutoExportLink(token: string, ingestUrl: string): string {
  if (!/^embe_health_[A-Za-z0-9_-]{43}$/.test(token) || ingestUrl !== 'https://embe.hieu.asia/api/pregnancy/iphone-health') return '';
  const params = new URLSearchParams({
    name:'EmBe · Sức khỏe của Mẹ', url:ingestUrl, format:'json', datatype:'healthMetrics',
    enabled:'false', period:'none', interval:'days', aggregatedata:'true', aggregatesleep:'true',
    exportversion:'v2', batchrequests:'false', syncinterval:'hours', syncquantity:'1',
    metrics:METRICS.map(m=>m[0]).join(','), headers:`Authorization,Bearer ${token}`
  });
  return `com.HealthExport://automation?${params.toString()}`;
}

type Sample = {type:string; date:string; value:number; unit:string};
function object(value:unknown): value is Record<string,unknown> {return !!value && typeof value==='object' && !Array.isArray(value);}

export function normalizeHealthAutoExport(input: unknown): {data:Sample[]} | null {
  if (!object(input) || !object(input.data) || !Array.isArray(input.data.metrics) || input.data.metrics.length>18) return null;
  // Never acknowledge unsupported clinical records, ECG or medication data as saved.
  if (Object.entries(input.data).some(([key,value])=>key!=='metrics' && (!Array.isArray(value)||value.length>0))) return null;
  const result: Sample[]=[];
  const seen=new Set<string>();
  for (const metric of input.data.metrics) {
    if (!object(metric) || typeof metric.name!=='string' || typeof metric.units!=='string' || !Array.isArray(metric.data)) return null;
    const mapping=METRICS.find(m=>m[1]===metric.name);
    if (!mapping || metric.data.length>31) return null;
    for (const row of metric.data) {
      if (!object(row) || typeof row.date!=='string') return null;
      const date=row.date.replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/, '$1T$2$3:$4');
      const key=`${metric.name}:${date.slice(0,10)}`;
      // Raw/hourly exports must not overwrite a daily total with a partial interval.
      if (seen.has(key)) return null;
      seen.add(key);
      const add=(type:string,value:unknown)=>{
        if (typeof value!=='number'||!Number.isFinite(value)) return false;
        result.push({type,date,value,unit:metric.units as string}); return true;
      };
      if (metric.name==='blood_pressure') {
        if (!add('Blood Pressure Systolic',row.systolic)||!add('Blood Pressure Diastolic',row.diastolic)) return null;
      } else if (metric.name==='heart_rate') {
        if (!add(mapping[2],row.Avg)) return null;
      } else if (metric.name==='sleep_analysis') {
        // totalSleep already includes phases; never add inBed/core/REM on top.
        if (!add(mapping[2],row.totalSleep)) return null;
      } else if (!add(mapping[2],row.qty)) return null;
    }
  }
  return result.length ? {data:result} : null;
}
