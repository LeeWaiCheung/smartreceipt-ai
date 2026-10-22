"use client";
import { useLanguage } from "./language-provider";
import { LanguageSwitch } from "./language-switch";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft,ArrowRight,ShieldCheck,LoaderCircle,Check } from "lucide-react";
import { Button } from "./ui/button";
import { apiFetch } from "@/lib/client-api";
export function SetupForm() {
  const {t,locale,error:localizeError}=useLanguage();
  const [values,setValues]=useState({url:"",publishable:"",secret:"",deepseek:""}),[busy,setBusy]=useState(false),[error,setError]=useState(""),[saved,setSaved]=useState(false);
  async function submit(event:React.FormEvent) {
    event.preventDefault();setBusy(true);setError("");
    try {await apiFetch("/api/local-setup",{method:"POST",headers:{"X-SmartReceipt-Setup":"1"},body:JSON.stringify(values)});setSaved(true);setValues({url:"",publishable:"",secret:"",deepseek:""});}
    catch(err){setError((err as Error).message);}finally{setBusy(false);}
  }
  return <main className="setup-page"><div className="standalone-language"><LanguageSwitch/></div><Link className="back-link" href="/"><ArrowLeft size={15}/>{t("返回網站")}</Link><div className="setup-card panel"><span className="setup-badge"><ShieldCheck size={16}/>{t("僅本機開發可見")}</span><h1>{t("本機連線設定")}</h1><p>{t("資料只寫入這個專案內、已排除版本控制的本機設定檔。正式網站不提供這個設定頁。")}</p>{saved?<div className="setup-saved"><Check size={35}/><h2>{t("設定已儲存")}</h2><p>{t("接着套用資料庫初始化檔，再重新整理登入頁即可測試。")}</p><Button asChild><Link href="/auth">{t("前往登入")}<ArrowRight size={16}/></Link></Button></div>:<form onSubmit={submit}>{[
      ["url",t("Supabase 專案網址"),"https://your-project.supabase.co"],
      ["publishable",t("Supabase Publishable key（或 anon key）"),t("在 Project Settings → API Keys 取得")],
      ["secret",t("Supabase Secret key（或 service_role key）"),t("僅供伺服器使用的密鑰")],
      ["deepseek","DeepSeek API key",t("你現有的 DeepSeek API 密鑰")]
    ].map(([key,label,placeholder])=><label className="field" key={key}>{label}<input type={key==="url"?"url":"password"} autoComplete="off" value={values[key as keyof typeof values]} placeholder={placeholder} required onChange={event=>setValues(previous=>({...previous,[key]:event.target.value}))}/></label>)}{error&&<p className="inline-error" role="alert">{localizeError(error)}</p>}<Button type="submit" disabled={busy}>{busy&&<LoaderCircle className="spin" size={16}/>}{t("儲存本機設定")}</Button></form>}</div><p className="below-note">{t("資料庫初始化檔位於專案的 supabase/migrations/202610210001_initial.sql。部署至 Vercel 時需在該專案另設相同的環境變數。")}</p></main>;
}
