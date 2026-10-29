"use client";

import {useEffect,useState} from "react";
import {controlClass} from "./controls";

/** Retains incomplete typed numbers while committing only values inside the field's bounds. */
export function BoundedNumberInput({fieldId,value,min,max,step=1,integer=false,onChange}: {
  fieldId:string;value:number;min:number;max:number;step?:number;integer?:boolean;onChange:(value:number)=>void;
}) {
  const [draft,setDraft]=useState(String(value));
  const [focused,setFocused]=useState(false);
  useEffect(()=>{if(!focused)setDraft(String(value));},[value,focused]);
  const bounded=(number:number)=>{
    const result=Math.max(min,Math.min(max,number));
    return integer ? Math.round(result) : result;
  };
  return <input className={controlClass} type="number" min={min} max={max} step={step} data-field-id={fieldId} value={draft}
    onFocus={()=>setFocused(true)}
    onChange={event=>{
      const raw=event.target.value,number=Number(raw);
      setDraft(raw);
      if(raw.trim() && Number.isFinite(number) && number>=min && number<=max)onChange(bounded(number));
    }}
    onBlur={()=>{
      const number=Number(draft);
      const next=bounded(draft.trim() && Number.isFinite(number) ? number : value);
      setFocused(false);setDraft(String(next));
      if(next!==value)onChange(next);
    }}
    onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();event.currentTarget.blur();}}}
  />;
}
