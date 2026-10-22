"use client";
import { useLanguage } from "./language-provider";
import { LanguageSwitch } from "./language-switch";
import { unitLabel } from "@/lib/i18n";
import { useEffect,useState } from "react";
import Link from "next/link";
import { ZoomIn,ZoomOut,ChevronLeft,ChevronRight,FileCheck2,ShieldCheck,AlertCircle,LoaderCircle,ArrowUpRight,ExternalLink,Check } from "lucide-react";
import { toast } from "sonner";
import { CATEGORIES,type Receipt,type Transaction,type FxQuote } from "@/lib/types";
import { transactionSchema,validDate,hongKongDate,convertToHkd } from "@/lib/domain";
import { apiFetch } from "@/lib/client-api";
import { hkd } from "@/lib/utils";
import { Button } from "./ui/button";
import { Dialog,DialogContent,DialogDescription,DialogTitle } from "./ui/dialog";

export function ReviewDialog({receipt,transaction,demo,onClose,onSaved}:{receipt:Receipt;transaction?:Transaction;demo:boolean;onClose:()=>void;onSaved:()=>Promise<unknown>}) {
  const {t,locale,error:localizeError}=useLanguage();
  const initial=transaction || receipt.extraction;
  const [fields,setFields]=useState({
    merchant:initial?.merchant || "",transaction_date:initial?.transaction_date || "",
    amount:initial?.amount || "",currency:initial?.currency || "",tax:initial?.tax || "",
    category_id:initial?.category_id || "other"
  });
  const [pages,setPages]=useState<string[]>(receipt.preview_url?[receipt.preview_url]:[]);
  const [original,setOriginal]=useState(receipt.preview_url || ""),[previewError,setPreviewError]=useState("");
  const [page,setPage]=useState(0),[zoom,setZoom]=useState(1),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [quote,setQuote]=useState<FxQuote|null>(null),[quoteError,setQuoteError]=useState(""),[quoteBusy,setQuoteBusy]=useState(false);
  useEffect(()=>{
    if(demo)return;
    let active=true;
    apiFetch<{original:string;pages:string[]}>("/api/receipts/"+receipt.id+"/preview")
      .then(value=>{if(active){setPages(value.pages);setOriginal(value.original);}})
      .catch(err=>{if(active)setPreviewError(err.message);});
    return()=>{active=false;};
  },[demo,receipt.id]);
  useEffect(()=>{
    setQuote(null);setQuoteError("");
    if(!fields.currency || !validDate(fields.transaction_date) || fields.transaction_date>hongKongDate())return;
    if(transaction && transaction.currency===fields.currency && transaction.transaction_date===fields.transaction_date) {
      setQuote({rate:transaction.exchange_rate,date:transaction.exchange_rate_date,source:transaction.exchange_rate_source});return;
    }
    if(demo) {setQuote({rate:fields.currency==="USD"?"7.8":fields.currency==="CNY"?"1.1":"1",date:fields.transaction_date,source:"示範固定匯率 · 非實際報價"});return;}
    const controller=new AbortController();
    setQuoteBusy(true);
    fetch("/api/fx?"+new URLSearchParams({currency:fields.currency,date:fields.transaction_date}),{signal:controller.signal})
      .then(async response=>{const value=await response.json();if(!response.ok)throw new Error(value.error);return value;})
      .then(value=>{setQuote(value);setQuoteBusy(false);})
      .catch(err=>{if(!controller.signal.aborted){setQuoteError(err.message);setQuoteBusy(false);}});
    return()=>controller.abort();
  },[demo,fields.currency,fields.transaction_date,transaction]);
  function update(key:keyof typeof fields,value:string) {setFields(prev=>({...prev,[key]:value}));setError("");}
  async function save() {
    if(demo)return;
    const result=transactionSchema.safeParse({...fields,tax:fields.tax.trim() || null});
    if(!result.success){setError(result.error.issues[0]?.message || "請確認表單欄位。");return;}
    setBusy(true);setError("");
    try {
      await apiFetch("/api/transactions",{method:"POST",body:JSON.stringify({receipt_id:receipt.id,fields:result.data})});
      await onSaved();toast.success(transaction?t("交易已更新"):t("收據已確認入帳"));onClose();
    } catch(err){setError((err as Error).message);} finally {setBusy(false);}
  }
  let converted="";
  try {if(quote&&fields.amount)converted=convertToHkd(fields.amount,quote.rate);} catch { /* Invalid input is explained during validation. */ }
  return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}><DialogContent className="review-dialog">
    <div className="review-header"><div className="review-title-icon"><FileCheck2 size={21}/></div><div><DialogTitle>{transaction?t("查看與修改憑證"):t("確認這張收據")}</DialogTitle><DialogDescription>{receipt.original_name}</DialogDescription></div><span className="review-step">{demo?t("示範預覽"):t("人工覆核")}</span></div>
    <div className="review-body"><section className="receipt-preview"><div className="preview-toolbar"><span>{t("原始憑證")}</span><div><button className="icon-button" aria-label={t("縮小憑證")} onClick={()=>setZoom(Math.max(0.65,zoom-0.2))}><ZoomOut size={16}/></button><span>{Math.round(zoom*100)}%</span><button className="icon-button" aria-label={t("放大憑證")} onClick={()=>setZoom(Math.min(2.4,zoom+0.2))}><ZoomIn size={16}/></button>{original&&<a className="icon-button" href={original} target="_blank" rel="noreferrer" aria-label={t("另開原始文件")}><ExternalLink size={15}/></a>}</div></div>
      <div className="receipt-canvas">{previewError?<p className="inline-error">{localizeError(previewError)}</p>:pages[page]?<img src={pages[page]} alt={t("收據原圖，第 {page} 頁",{page:page+1})} style={{width:(zoom*100)+"%",maxWidth:"none"}}/>:<div className="preview-loading"><LoaderCircle size={24} className="spin"/><p>{t("正在載入原圖…")}</p></div>}</div>
      {pages.length>1&&<div className="page-controls"><button className="icon-button" disabled={page===0} aria-label={t("上一張憑證頁")} onClick={()=>{setPage(page-1);setZoom(1);}}><ChevronLeft size={16}/></button><span>{page+1} / {pages.length}{" "+unitLabel(locale,pages.length,"pages")}</span><button className="icon-button" disabled={page===pages.length-1} aria-label={t("下一張憑證頁")} onClick={()=>{setPage(page+1);setZoom(1);}}><ChevronRight size={16}/></button></div>}
    </section><section className="review-form"><div className="review-notice"><ShieldCheck size={17}/><p>{demo?t("這是一份預先準備的示範憑證。登入後可辨識自己的收據。"):t("請對照原圖核對商家、日期、金額、幣種及分類。")}</p></div>
      {!!receipt.extraction?.warnings.length&&<div className="review-warnings"><AlertCircle size={16}/><div><strong>{t("AI 提示（原文）")}</strong>{receipt.extraction.warnings.map((warning,i)=><p key={i}>{warning}</p>)}</div></div>}
      <div className="fields-grid"><label className="field span-two">{t("商家名稱")}<input value={fields.merchant} onChange={e=>update("merchant",e.target.value)} disabled={demo||busy} maxLength={160} placeholder={t("請對照收據填寫")}/></label>
      <label className="field">{t("交易日期")}<input type="date" value={fields.transaction_date} max={hongKongDate()} onInput={e=>update("transaction_date",e.currentTarget.value)} disabled={demo||busy}/></label>
      <label className="field">{t("支出分類")}<select value={fields.category_id} onChange={e=>update("category_id",e.target.value)} disabled={demo||busy}>{CATEGORIES.map(c=><option value={c.id} key={c.id}>{t(c.name)}</option>)}</select></label>
      <label className="field">{t("總金額")}<input inputMode="decimal" value={fields.amount} onChange={e=>update("amount",e.target.value)} disabled={demo||busy} placeholder="0.00"/></label>
      <label className="field">{t("原始幣種")}<select value={fields.currency} onChange={e=>update("currency",e.target.value)} disabled={demo||busy}><option value="">{t("請確認幣種")}</option><option value="HKD">{t("HKD · 港幣")}</option><option value="USD">{t("USD · 美元")}</option><option value="CNY">{t("CNY · 人民幣")}</option></select></label>
      <label className="field span-two">{t("稅額 ")}<small>{t("（選填，已包含在總金額內）")}</small><input inputMode="decimal" value={fields.tax} onChange={e=>update("tax",e.target.value)} disabled={demo||busy} placeholder={t("收據未列明可留空")}/></label></div>
      <div className="fx-box"><div><span>{t("折算港幣")}</span><strong>{converted?"HK$ "+hkd(converted):"—"}</strong></div>{quote?<p>1 {fields.currency} = {quote.rate} HKD · {quote.date}<br/>{t(quote.source)}</p>:<p>{quoteBusy?t("正在查詢參考匯率…"):(quoteError?localizeError(quoteError):"") || t("確認日期與幣種後，計算參考金額。")}</p>}</div>
      {error&&<div className="inline-error" role="alert"><AlertCircle size={16}/>{localizeError(error)}</div>}
      <p className="form-note">{t("入帳時保存採用的匯率與日期，方便日後核對。")}</p>
    </section></div>
    <div className="review-footer"><span><ShieldCheck size={15}/>{demo?t("示範資料 · 唯讀"):t("原圖與資料僅供你的帳號存取")}</span><div><LanguageSwitch/><Button variant="outline" onClick={onClose} disabled={busy}>{t("關閉")}</Button>{demo?<Button asChild><Link href="/auth">{t("登入並上傳收據")}<ArrowUpRight size={16}/></Link></Button>:<Button onClick={save} disabled={busy}>{busy?<LoaderCircle className="spin" size={16}/>:<Check size={16}/>} {transaction?t("儲存修改"):t("確認入帳")}</Button>}</div></div>
  </DialogContent></Dialog>;
}
