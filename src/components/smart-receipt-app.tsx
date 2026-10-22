"use client";
import { useLanguage } from "./language-provider";
import { LanguageSwitch } from "./language-switch";
import { useEffect,useState } from "react";
import Link from "next/link";
import { LayoutDashboard,ReceiptText,ArrowLeftRight,Plus,HelpCircle,ChevronDown,ChevronRight,ArrowUpRight,LogOut,Menu,X,RefreshCw,ShieldCheck,Sparkles,FileCheck2,ScanLine,Download,CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import type { Receipt,Snapshot,Transaction } from "@/lib/types";
import { hongKongDate,monthKey } from "@/lib/domain";
import { transactionsCsv } from "@/lib/csv";
import { apiFetch,downloadCsv } from "@/lib/client-api";
import { browserClient } from "@/lib/supabase/browser";
import { Overview } from "./overview";
import { Transactions } from "./transactions";
import { Receipts } from "./receipts";
import { ReviewDialog } from "./review-dialog";
import { Button } from "./ui/button";
type View="overview"|"receipts"|"transactions"|"about";
const views={overview:"財務總覽",receipts:"收據管理",transactions:"交易明細",about:"使用說明"};
export function SmartReceiptApp({mode,initial,email,today}:{mode:"demo"|"live"|"trial";initial:Snapshot;email:string;today:string}) {
  const {t,locale,error:localizeError}=useLanguage();
  const demo=mode==="demo",trial=mode==="trial";
  const [data,setData]=useState(initial),[view,setView]=useState<View>("overview"),[month,setMonth]=useState(demo?initial.transactions[0]?.transaction_date.slice(0,7) || monthKey(new Date(today)):monthKey(new Date(today)));
  const [mobile,setMobile]=useState(false),[refreshing,setRefreshing]=useState(false);
  const [review,setReview]=useState<{receipt:Receipt;transaction?:Transaction}|null>(null);
  async function refresh():Promise<Snapshot> {
    if(demo)return data;
    setRefreshing(true);
    try {const next=await apiFetch<Snapshot>("/api/workspace");setData(next);return next;}
    finally {setRefreshing(false);}
  }
  useEffect(()=>{
    if(demo||!data.receipts.some(receipt=>receipt.status==="processing"))return;
    const interval=setInterval(()=>void refresh().catch(()=>{}),4000);
    return()=>clearInterval(interval);
  },[demo,data.receipts]);
  useEffect(()=>{if(new URLSearchParams(window.location.search).get("view")==="receipts")setView("receipts");},[]);
  function navigate(next:View){setView(next);setMobile(false);window.scrollTo({top:0,behavior:"smooth"});}
  function reviewTransaction(transaction:Transaction) {
    const receipt=data.receipts.find(r=>r.id===transaction.receipt_id);
    if(receipt)setReview({receipt,transaction});else toast.error(t("暫時找不到憑證，請重新整理。"));
  }
  function reviewReceipt(receipt:Receipt){setReview({receipt,transaction:data.transactions.find(t=>t.receipt_id===receipt.id)});}
  function exportMonth() {
    const rows=data.transactions.filter(t=>t.transaction_date.startsWith(month));
    if(!rows.length)return toast.info(t("這個月份尚未有已確認的交易。"));
    downloadCsv(transactionsCsv(rows,locale));toast.success(t("已匯出 {count} 筆交易",{count:rows.length}));
  }
  async function logout(){await browserClient()?.auth.signOut();window.location.assign("/");}
  const pending=data.receipts.filter(r=>r.status==="needs_review").length;
  return <div className="app-shell">
    {mobile&&<button className="mobile-backdrop" onClick={()=>setMobile(false)} aria-label={t("關閉側邊導覽")}/>}
    <aside className={"sidebar"+(mobile?" mobile-open":"")}><Link className="brand" href={demo?"/":"/workspace"}><img src="/icon.svg" alt="" width={35} height={35}/><span>SmartReceipt<small>{t("支出管理")}</small></span></Link>
      <button className="workspace-switch" onClick={()=>navigate("overview")}><span className="workspace-avatar">{demo?"S":email.slice(0,1).toUpperCase()}</span><span><strong>{demo?t("示範工作區"):t(trial?"試用工作區":"我的工作區")}</strong><small>{t("個人帳簿 · HKD")}</small></span><ChevronDown size={14}/></button>
      <div className="nav-section-label">{t("工作空間")}</div><nav aria-label={t("主要導覽")}>{([
        ["overview",LayoutDashboard,t("財務總覽")],["receipts",ReceiptText,t("收據管理")],["transactions",ArrowLeftRight,t("交易明細")]
      ] as const).map(([key,Icon,label])=><button key={key} className={"nav-item"+(view===key?" active":"")} onClick={()=>navigate(key)}><Icon size={19} strokeWidth={1.7}/><span>{label}</span>{key==="receipts"&&pending>0&&<small>{pending}</small>}</button>)}</nav>
      <div className="sidebar-bottom">
      <button className={"nav-item help-nav"+(view==="about"?" active":"")} onClick={()=>navigate("about")}><HelpCircle size={19}/><span>{t("使用說明")}</span></button>
      <div className="profile-block"><span className="profile-avatar">{demo?t("訪"):email.slice(0,1).toUpperCase()}</span><span><strong>{demo?t("訪客模式"):trial?t("訪客試用"):email.split("@")[0]}</strong><small>{demo?t("登入建立私人帳簿"):trial?t("24 小時臨時帳簿"):email}</small></span>{demo?<Link className="icon-button" href="/auth" aria-label={t("登入")}><ArrowUpRight size={17}/></Link>:<button className="icon-button" onClick={()=>void logout()} aria-label={t("登出")}><LogOut size={17}/></button>}</div></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu-button" onClick={()=>setMobile(true)} aria-label={t("打開導覽選單")} aria-expanded={mobile}><Menu size={21}/></button><span>{t("工作空間")}</span><ChevronRight size={13}/><strong>{t(views[view])}</strong></div><div className="topbar-actions"><LanguageSwitch/><span className="environment-pill"><i/>{demo?t("公開示範"):t(trial?"訪客試用":"私人工作區")}</span><button className={"icon-button refresh-button"+(refreshing?" spin":"")} aria-label={t("重新整理資料")} onClick={()=>void refresh().then(()=>toast.success(demo?t("示範資料已載入"):t("資料已更新"))).catch(error=>toast.error(localizeError(error)))}><RefreshCw size={17}/></button><Button size="sm" onClick={()=>navigate("receipts")}><Plus size={16}/>{t("上傳收據")}</Button></div></header>
      <main className="main-content" id="main-content">
        {trial&&data.trial&&<div className="demo-banner trial-banner"><ShieldCheck size={18}/><div><strong>{t("訪客試用")} · {data.trial.attempts} / {data.trial.limit} {t("次辨識")}</strong><span>{t("最多 3 份收據；失敗與重試亦計次。24 小時後到期，之後自動清理。")}</span><small>{t("到期時間")}：{new Date(data.trial.expiresAt).toLocaleString(locale==="en"?"en-HK":"zh-HK",{timeZone:"Asia/Hong_Kong"})} HKT</small></div><Link href="/">{t("查看公開範例")}</Link></div>}
        {view==="overview"&&<Overview data={data} month={month} demo={demo} currentMonth={monthKey(new Date(today))} onMonth={setMonth} onTransactions={()=>navigate("transactions")} onUpload={()=>navigate("receipts")} onReview={reviewTransaction} onRefresh={refresh} onExport={exportMonth}/>}
        {view==="transactions"&&<Transactions rows={data.transactions} demo={demo} onReview={reviewTransaction} onRefresh={refresh}/>}
        {view==="receipts"&&<Receipts data={data} demo={demo} onReview={reviewReceipt} onRefresh={refresh}/>}
        {view==="about"&&<><section className="page-heading"><div><h1>{t("使用說明")}</h1></div></section><div className="about-hero panel"><img src="/icon.svg" alt="" width={55} height={55}/><div><h2>SmartReceipt AI</h2><p>{t("收據辨識 · 人工覆核 · 多幣種記帳")}</p></div><span className="category-badge">{t("作品集專案")}</span></div><div className="about-grid">{[
          [ScanLine,t("01 · 上傳與辨識"),t("支援 JPG、PNG 及最多 10 頁的 PDF，一次可上傳 10 份。每份文件獨立處理，失敗時可單獨重試。")],
          [FileCheck2,t("02 · 對照原圖確認"),t("AI 會先整理商家、日期、金額、幣種及分類。請確認重要欄位，沒有把握的資訊會留待人工核對。")],
          [ArrowLeftRight,t("03 · 多幣種入帳"),t("支援港幣、美元及人民幣。外幣按交易日期附近的參考匯率折算，並保存採用的報價與日期。")],
          [Download,t("04 · 看板與匯出"),t("設定每月預算，查看近六個月及分類支出。可篩選交易，匯出可供 Excel 開啟的 CSV。")]
        ].map(([Icon,title,text])=>{const I=Icon as typeof ScanLine;return <article className="panel about-feature" key={String(title)}><span><I size={23}/></span><h3>{String(title)}</h3><p>{String(text)}</p></article>;})}</div><div className="about-note"><ShieldCheck size={21}/><div><h3>{t("資料來源與存取權限")}</h3><p>{t("公開範例使用有來源授權的真實收據照片，欄位經人工核對。免註冊試用會建立獨立臨時帳簿，實際呼叫 AI；文件交由 DeepSeek 處理，入帳前請覆核。")}</p></div></div></>}
        <footer className="app-footer"><span>© {new Date(today).getFullYear()} SmartReceipt AI</span><span><ShieldCheck size={13}/>{demo?t("示範資料 · 唯讀工作區"):t("私人存取 · 儲存後更新統計")}<i/>{t("香港時間 ")}{hongKongDate(new Date(today))}</span></footer>
      </main>
    </div>
    {review&&<ReviewDialog key={review.receipt.id} receipt={review.receipt} transaction={review.transaction} demo={demo} onClose={()=>setReview(null)} onSaved={async()=>{const next=await refresh();const saved=next.transactions.find(row=>row.receipt_id===review.receipt.id);if(saved)setMonth(saved.transaction_date.slice(0,7));return next;}}/>}
  </div>;
}
