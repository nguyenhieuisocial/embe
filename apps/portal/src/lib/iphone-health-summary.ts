export const IPHONE_HEALTH_FIELDS = [
  ['steps','Bước chân'], ['active_energy_kcal','Năng lượng vận động'], ['resting_energy_kcal','Năng lượng nghỉ'],
  ['sleep_minutes','Giấc ngủ'], ['weight_kg','Cân nặng'], ['height_cm','Chiều cao'], ['distance_m','Quãng đường'],
  ['water_ml','Nước uống'], ['heart_rate_avg','Nhịp tim trung bình'], ['resting_heart_rate_bpm','Nhịp tim nghỉ'],
  ['respiratory_rate','Nhịp thở'], ['oxygen_saturation_percent','SpO₂'], ['body_temperature_c','Nhiệt độ cơ thể'],
  ['wrist_temperature_c','Nhiệt độ cổ tay'], ['hrv_ms','Biến thiên nhịp tim'], ['exercise_minutes','Phút vận động'],
  ['mindfulness_minutes','Phút thư giãn'], ['systolic','Huyết áp tâm thu'], ['diastolic','Huyết áp tâm trương']
] as const;

// A daily row can contain values sent at different times. Never substitute
// the row's updated_at for the receipt timestamp of an individual metric.
export function iphoneMetricSyncLabel(timestamps: Record<string,string>|undefined, key:string):string {
  const timestamp=timestamps?.[key];
  if (!timestamp || !Number.isFinite(Date.parse(timestamp))) return 'Chưa rõ giờ đồng bộ';
  const date=new Date(timestamp);
  return `Đồng bộ ${date.toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}`;
}

export function iphoneBloodPressureLabel(systolic:number|null|undefined,diastolic:number|null|undefined):string {
  const sys=typeof systolic==='number'&&Number.isFinite(systolic)?systolic:null;
  const dia=typeof diastolic==='number'&&Number.isFinite(diastolic)?diastolic:null;
  return sys===null&&dia===null?'—':`${sys??'—'}/${dia??'—'}`;
}

export function iphoneHealthCoverage(health: Partial<Record<typeof IPHONE_HEALTH_FIELDS[number][0], number|null>>) {
  const missing=IPHONE_HEALTH_FIELDS.filter(([key])=>typeof health[key]!=='number'||!Number.isFinite(health[key])).map(([,label])=>label);
  return {received:IPHONE_HEALTH_FIELDS.length-missing.length, total:IPHONE_HEALTH_FIELDS.length, missing};
}

type BodyHistoryRow = {day?:string; updated_at:string; weight_kg?:number|null; height_cm?:number|null};

// Reference only: never carry these values into another day's totals/coverage.
export function previousIphoneBodyMeasurement(rows:BodyHistoryRow[],field:'weight_kg'|'height_cm',beforeDay:string) {
  const byDay=new Map<string,BodyHistoryRow>();
  for (const row of rows) {
    if (!row.day || !/^\d{4}-\d{2}-\d{2}$/.test(row.day) || row.day>=beforeDay) continue;
    const date=new Date(`${row.day}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==row.day) continue;
    const previous=byDay.get(row.day);
    if (!previous || (Date.parse(row.updated_at)||0)>(Date.parse(previous.updated_at)||0)) byDay.set(row.day,row);
  }
  for (const [day,row] of [...byDay].sort(([a],[b])=>b.localeCompare(a))) {
    const value=row[field];
    if (typeof value==='number'&&Number.isFinite(value)&&value>0) return {day,value};
  }
  return null;
}

// History may have been fetched before a fresh current-day snapshot. Never let
// its array position win over the measurement day / latest server update.
export function latestIphoneReading<T extends {day?:string; updated_at:string}>(current:T|null, history:T[]):T|null {
  return [current,...history].reduce<T|null>((latest,item)=>{
    if (!item) return latest;
    if (!latest) return item;
    if ((item.day??'')!==(latest.day??'')) return (item.day??'')>(latest.day??'')?item:latest;
    return Date.parse(item.updated_at)>Date.parse(latest.updated_at)?item:latest;
  },null);
}
