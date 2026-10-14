import {createContext,useContext,useEffect} from 'react';
export type LeaveGuard=()=>Promise<boolean>;
export const NavigationContext=createContext<{register:(id:string,guard:LeaveGuard)=>()=>void;beforeChange:()=>Promise<boolean>;confirmLeave:(save:()=>Promise<void>)=>Promise<boolean>}>({register:()=>()=>{},beforeChange:async()=>true,confirmLeave:async()=>true});
export function useLeaveGuard(id:string,guard:LeaveGuard){const navigation=useContext(NavigationContext);useEffect(()=>navigation.register(id,guard),[id,guard,navigation]);return navigation;}
