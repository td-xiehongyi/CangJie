import {useEffect,useRef,useState,type ReactNode} from 'react';

/** One reading surface; closing restores the trigger and the underlying draft. */
export default function DetailPanel({label,title=label,children,triggerClassName='text-button'}:{label:string;title?:string;children:ReactNode|((close:()=>void)=>ReactNode);triggerClassName?:string}){
  const [open,setOpen]=useState(false),dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>{if(open)dialog.current?.showModal();},[open]);
  function close(){dialog.current?.close();setOpen(false);trigger.current?.focus({preventScroll:true});}
  return <><button ref={trigger} type="button" className={triggerClassName} aria-haspopup="dialog" onClick={()=>setOpen(true)}>{label}</button>{open&&<dialog ref={dialog} className="detail-panel" aria-label={title} onCancel={e=>{e.preventDefault();close();}}><header><h2>{title}</h2><button className="btn" autoFocus onClick={close}>关闭详情</button></header><div className="detail-body">{typeof children==='function'?children(close):children}</div></dialog>}</>;
}
