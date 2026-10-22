"use client";
import { Languages } from "lucide-react";
import { useLanguage } from "./language-provider";
export function LanguageSwitch() {
  const {locale,setLocale,t}=useLanguage();
  return <button type="button" className="language-switch" onClick={()=>setLocale(locale==="en"?"zh-Hant":"en")} aria-label={t(locale==="en"?"切換至繁體中文":"切換至英文")}><Languages size={15}/><span>{locale==="en"?"繁體中文":"English"}</span></button>;
}
