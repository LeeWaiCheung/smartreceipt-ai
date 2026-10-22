"use client";
import { useLanguage } from "./language-provider";
import { LanguageSwitch } from "./language-switch";
import { useEffect,useState } from "react";
import Link from "next/link";
import { ArrowLeft,ArrowRight,LoaderCircle,ShieldCheck,Check,ScanLine,ReceiptText } from "lucide-react";
import { browserClient } from "@/lib/supabase/browser";
import { Button } from "./ui/button";
export function AuthForm({configured,localSetup}:{configured:boolean;localSetup:boolean}) {
  const {t,locale,error:localizeError}=useLanguage();
  const [signup,setSignup]=useState(false),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  useEffect(()=>{
    if(new URL(window.location.href).searchParams.get("message")==="confirmation_failed")setError("確認連結未能完成登入。若電郵已確認，請以電郵及密碼登入。");
  },[]);
  async function submit(event:React.FormEvent) {
    event.preventDefault();setError("");setNotice("");
    const client=browserClient();
    if(!client){setError("私人工作區仍在準備中，請先查看示範。");return;}
    setBusy(true);
    try {
      if(signup) {
        const result=await client.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin+"/auth/confirm"}});
        if(result.error)throw result.error;
        if(result.data.session)window.location.assign("/workspace");
        else setNotice("請查看你的電郵並點擊確認連結，然後回來登入。");
      } else {
        const result=await client.auth.signInWithPassword({email,password});
        if(result.error)throw result.error;
        window.location.assign("/workspace");
      }
    } catch(err) {
      const code=(err as {code?:string}).code;
      setError(code==="invalid_credentials"?"電郵或密碼不正確。":code==="email_not_confirmed"?"請先完成電郵確認。":code==="email_address_not_authorized"?"目前僅開放受邀帳號註冊，請先探索公開示範。":code==="over_email_send_rate_limit"?"確認郵件發送過於頻密，請稍後再試。":"暫時無法完成登入或註冊，請稍後再試。");
    } finally {setBusy(false);}
  }
  return <main className="auth-layout"><section className="auth-main"><div className="auth-header"><Link className="brand" href="/"><img src="/icon.svg" alt="" width={37} height={37}/><span>SmartReceipt<small>{t("支出管理")}</small></span></Link><LanguageSwitch/></div><div className="auth-form-wrap"><Link className="back-link" href="/"><ArrowLeft size={15}/>{t("查看公開示範")}</Link><h1>{signup?t("建立帳號"):t("登入")}</h1><div className="auth-tabs"><button className={!signup?"active":""} onClick={()=>{setSignup(false);setError("");setNotice("");}}>{t("登入")}</button><button className={signup?"active":""} onClick={()=>{setSignup(true);setError("");setNotice("");}}>{t("建立帳號")}</button></div>
    {!configured&&<div className="setup-notice"><strong>{t("私人工作區正在準備中")}</strong><p>{t("公開示範可以直接使用。完成服務設定後，即可啟用登入與真實收據辨識。")}</p>{localSetup&&<Link href="/setup">{t("開啟本機設定頁")}<ArrowRight size={14}/></Link>}</div>}
    {signup&&configured&&<p className="form-note">{t("目前採邀請制試用；訪客可免登入探索公開示範。")}</p>}<form onSubmit={submit}><label className="field">{t("電郵地址")}<input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required disabled={busy||!configured}/></label><label className="field">{t("密碼")}<input type="password" autoComplete={signup?"new-password":"current-password"} value={password} onChange={e=>setPassword(e.target.value)} minLength={signup?8:1} placeholder={signup?t("至少 8 個字元"):t("輸入你的密碼")} required disabled={busy||!configured}/></label>{error&&<p className="inline-error" role="alert">{localizeError(error)}</p>}{notice&&<p className="inline-success" role="status"><Check size={17}/>{t(notice)}</p>}<Button className="full-width" type="submit" disabled={busy||!configured}>{busy?<LoaderCircle size={17} className="spin"/>:<>{signup?t("建立帳號"):t("登入工作區")}<ArrowRight size={17}/></>}</Button></form><p className="auth-privacy"><ShieldCheck size={14}/>{t("登入後存取私人收據與帳目。")}</p></div><p className="auth-copyright">© 2026 SmartReceipt AI</p></section><aside className="auth-visual"><div className="auth-visual-grid"/><div className="auth-tag"><ScanLine size={16}/>{t("功能預覽")}</div><h2>{t("收據辨識與記帳")}</h2><p>{t("上傳收據、核對欄位及查看支出。")}</p><div className="auth-receipt"><div className="auth-receipt-heading"><ReceiptText size={23}/><span>{t("辨識結果")}<small>{t("待覆核")}</small></span><span className="success-circle"><Check size={17}/></span></div><div><span>{t("商家")}</span><strong>NOC Coffee Co.</strong></div><div><span>{t("日期")}</span><strong>2026 / 10 / 08</strong></div><div><span>{t("分類")}</span><strong>{t("餐飲")}</strong></div><div className="auth-receipt-total"><span>{t("總金額")}</span><strong>HK$ 148.00</strong></div><small className="auth-demo-label">{t("產品示意 · 非真實交易")}</small></div><div className="auth-trust"><ShieldCheck size={16}/>{t("原圖保留 · 人工覆核 · 私人存取")}</div></aside></main>;
}
