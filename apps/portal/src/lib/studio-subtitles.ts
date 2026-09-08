import { studioTimestamp } from './studio-timing';
import type { StudioDocument } from './studio-project';

type Cue = {start:number;end:number;text:string};
export type StudioCaptions = {version:1;burnedIn:true;language:'vi';timing:'estimated_within_scene';cues:Cue[]};
// Escape payload, not timing. A saved '<b>'/arrow/blank line must not create
// WebVTT markup, a timestamp, or a second cue. Never insert raw HTML in a player.
const payload=(text:string)=>text.replace(/[\r\n]+/g,'\n').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

export function renderSubtitles(output:{beats:Cue[];captions?:StudioCaptions},format:'vtt'|'srt'='vtt') {
  const cues=output.captions?.cues??output.beats;
  if(!Array.isArray(cues)||!cues.length||cues.length>80)throw new Error('invalid_subtitles');
  let previous=0;
  const body=cues.map((cue,i)=>{
    if(typeof cue.text!=='string'||!cue.text.trim()||cue.text.length>1000||!Number.isFinite(cue.start)||!Number.isFinite(cue.end)||cue.start<previous||cue.end<=cue.start||cue.end>90.001)throw new Error('invalid_subtitles');
    previous=cue.end;
    const a=studioTimestamp(cue.start),b=studioTimestamp(cue.end);
    return `${format==='srt'?`${i+1}\n`:''}${format==='srt'?a.replace('.',','):a} --> ${format==='srt'?b.replace('.',','):b}\n${payload(cue.text)}\n`;
  }).join('\n');
  return `${format==='vtt'?'WEBVTT\n\n':''}${body}`;
}

export function studioSocialCaption(doc:StudioDocument):string {
  // Preserve the author's caption. If empty, compose only from saved metadata;
  // never invent medical claims, diagnoses, product links or trending hashtags.
  const intro=doc.caption.trim()||[doc.title,doc.stage].filter(Boolean).join('\n');
  const sources=doc.sources.filter(source=>!intro.includes(source.url)).map(s=>`${s.title}: ${s.url}`);
  return [intro,'Giọng đọc và minh họa AI. Nội dung tham khảo, chưa duyệt chuyên môn; không thay tư vấn y tế cá nhân.',
    sources.length?`Nguồn đối chiếu:\n${sources.join('\n')}`:'',intro.includes('#EmBeMeBau')?'':'#EmBeMeBau'].filter(Boolean).join('\n\n');
}
