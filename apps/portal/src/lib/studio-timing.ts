/** Frame-aligned videos need millisecond timestamps, not decimal seconds + '.000'. */
export function studioTimestamp(seconds:number):string {
  const ms=Math.round(seconds*1000);
  return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`;
}
