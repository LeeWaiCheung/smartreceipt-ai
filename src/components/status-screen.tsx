"use client";
import Link from "next/link";
import { useLanguage } from "./language-provider";
import { LanguageSwitch } from "./language-switch";
export function StatusScreen({title,message,action,href,onRetry}:{title:string;message:string;action:string;href?:string;onRetry?:()=>void}) {
  const {t}=useLanguage();
  return <main className="status-page"><div className="status-card"><div className="status-language"><LanguageSwitch/></div><h1>{t(title)}</h1><p>{t(message)}</p>{href?<Link className="button button-primary" href={href}>{t(action)}</Link>:<button className="button button-primary" onClick={onRetry}>{t(action)}</button>}</div></main>;
}
