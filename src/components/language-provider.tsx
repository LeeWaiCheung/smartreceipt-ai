"use client";
import { createContext,useCallback,useContext,useEffect,useMemo,useState } from "react";
import { errorText,LOCALE_STORAGE_KEY,translate,type Locale } from "@/lib/i18n";
type Values=Record<string,string|number>;
interface LanguageContextValue {
  locale:Locale;
  setLocale:(locale:Locale)=>void;
  t:(message:string,values?:Values)=>string;
  error:(value:unknown)=>string;
}
const LanguageContext=createContext<LanguageContextValue|null>(null);
export function LanguageProvider({children}:{children:React.ReactNode}) {
  const [locale,setCurrentLocale]=useState<Locale>("zh-Hant");
  useEffect(()=>{
    try {const saved=localStorage.getItem(LOCALE_STORAGE_KEY);if(saved==="en"||saved==="zh-Hant")setCurrentLocale(saved);} catch { /* Storage may be blocked in private browsing. */ }
  },[]);
  useEffect(()=>{
    document.documentElement.lang=locale;
    document.title=locale==="en"?"SmartReceipt AI · Receipts & expenses":"SmartReceipt AI · 收據與支出管理";
  },[locale]);
  const setLocale=useCallback((next:Locale)=>{
    setCurrentLocale(next);
    try {localStorage.setItem(LOCALE_STORAGE_KEY,next);} catch { /* Switching still works without persistence. */ }
  },[]);
  const t=useCallback((message:string,values?:Values)=>translate(locale,message,values),[locale]);
  const error=useCallback((value:unknown)=>errorText(locale,value),[locale]);
  const value=useMemo(()=>({locale,setLocale,t,error}),[locale,setLocale,t,error]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
export function useLanguage() {
  const context=useContext(LanguageContext);
  if(!context)throw new Error("LanguageProvider is required");
  return context;
}
