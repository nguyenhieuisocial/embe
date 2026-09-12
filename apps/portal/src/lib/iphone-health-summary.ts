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
