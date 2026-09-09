'use client';
import {useState} from 'react';
import {BOILED_EGG_GRAMS,isBoiledChickenEgg} from '../lib/food-portion';

export default function FoodPortionInput({name,grams,onChange,editing=false}:{name:string;grams:number|null;onChange:(grams:string)=>void;editing?:boolean}) {
 const [weighed,setWeighed]=useState(false);
 const egg=isBoiledChickenEgg(name),counted=egg&&!weighed;
 const factor=counted?BOILED_EGG_GRAMS:1;
 return <div className={`food-portion-input${egg?' is-egg':''}`}>
   <label>{editing?'Sửa khẩu phần':'Khẩu phần'} ({counted?'quả':'g'})
     <input type="number" inputMode="decimal" min={1/factor} max={3000/factor} step="any" value={grams===null?'':grams/factor}
       onChange={event=>onChange(event.target.value===''?'':String(Number(event.target.value)*factor))}/>
   </label>
   {egg?<><label>Đơn vị<select value={counted?'count':'grams'} onChange={event=>setWeighed(event.target.value==='grams')}><option value="count">Quả</option><option value="grams">Gram (đã cân)</option></select></label>
     <small>Ước tính 1 quả ≈ 50 g phần ăn được. Chọn gram nếu đã cân.</small></>:null}
 </div>;
}
