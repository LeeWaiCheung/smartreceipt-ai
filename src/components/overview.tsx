"use client";
import { TrialButton } from "./trial-button";
import { useLanguage } from "./language-provider";
import { LanguageSwitch } from "./language-switch";
import { monthLabel,unitLabel } from "@/lib/i18n";
import { useEffect,useMemo,useState } from "react";
import { Area,AreaChart,CartesianGrid,Cell,Pie,PieChart,ResponsiveContainer,Tooltip,XAxis,YAxis } from "recharts";
import { ArrowDownLeft,ArrowUpRight,ChevronRight,Download,FileCheck2,Wallet,Target,SlidersHorizontal,Sparkles,Plus,LoaderCircle } from "lucide-react";
import Decimal from "decimal.js";
import Link from "next/link";
import { toast } from "sonner";
import { CATEGORIES,type Snapshot,type Transaction,type DashboardSummary } from "@/lib/types";
import { previousMonths,sumHkd } from "@/lib/domain";
import { hkd } from "@/lib/utils";
import { apiFetch } from "@/lib/client-api";
import { Button } from "./ui/button";
import { Dialog,DialogContent,DialogDescription,DialogTitle } from "./ui/dialog";
import { TransactionTable } from "./transactions";

interface Props {
  data:Snapshot;month:string;demo:boolean;onMonth:(month:string)=>void;
  onTransactions:()=>void;onUpload:()=>void;onReview:(transaction:Transaction)=>void;
  onRefresh:()=>Promise<Snapshot>;onExport:()=>void;currentMonth:string;
}
export function Overview({data,month,demo,onMonth,onTransactions,onUpload,onReview,onRefresh,onExport,currentMonth}:Props) {
  const {t,locale,error:localizeError}=useLanguage();
  const [mounted,setMounted]=useState(false),[budgetOpen,setBudgetOpen]=useState(false),[budgetValue,setBudgetValue]=useState(""),[saving,setSaving]=useState(false);
  const [summary,setSummary]=useState<DashboardSummary|null>(null);
  useEffect(()=>setMounted(true),[]);
  useEffect(()=>{
    if(demo)return;
    setSummary(null);
    const controller=new AbortController();
    apiFetch<DashboardSummary>("/api/analytics?month="+month,{signal:controller.signal})
      .then(result=>{if(!controller.signal.aborted)setSummary(result);})
      .catch(()=>{if(!controller.signal.aborted)toast.error(t("最新統計暫時無法取得，現顯示已載入的帳目。"));});
    return()=>controller.abort();
  },[demo,month,data,t]);
  const selectedSummary=!demo&&summary?.month===month?summary:null;
  const rows=data.transactions.filter(t=>t.transaction_date.startsWith(month));
  const total=selectedSummary?new Decimal(selectedSummary.total).toFixed(2):sumHkd(rows);
  const previousMonth=previousMonths(month,2)[0];
  const previous=selectedSummary?selectedSummary.previous_total:sumHkd(data.transactions.filter(t=>t.transaction_date.startsWith(previousMonth)));
  const change=Number(previous)>0?(Number(total)-Number(previous))/Number(previous)*100:null;
  const budget=data.budgets.find(b=>b.month===month);
  const budgetPercent=budget?Number(total)/Number(budget.amount_hkd)*100:0;
  const available=budget?new Decimal(budget.amount_hkd).minus(total).toFixed(2):null;
  const categoryData=useMemo(()=>CATEGORIES.map(category=>({
    ...category,value:Number(selectedSummary?.categories.find(c=>c.id===category.id)?.amount_hkd??sumHkd(rows.filter(row=>row.category_id===category.id)))
  })).filter(category=>category.value>0),[rows,selectedSummary]);
  const trends=previousMonths(month).map(key=>({
    month:key,label:monthLabel(key,locale),amount:Number(selectedSummary?.trends.find(t=>t.month===key)?.amount_hkd??sumHkd(data.transactions.filter(t=>t.transaction_date.startsWith(key))))
  }));
  async function saveBudget() {
    if(demo) return;
    setSaving(true);
    try { await apiFetch("/api/budgets",{method:"POST",body:JSON.stringify({month,amount_hkd:budgetValue})});await onRefresh();setBudgetOpen(false);toast.success(t("本月預算已更新")); }
    catch(error) { toast.error(localizeError(error)); } finally {setSaving(false);}
  }
  function openBudget() {setBudgetValue(budget?.amount_hkd || "");setBudgetOpen(true);}
  return <>
    <section className="page-heading">
      <div><h1>{t("財務總覽")}</h1></div>
      <div className="heading-actions"><label className="month-picker"><span className="sr-only">{t("查看月份")}</span><input type="month" aria-label={t("查看月份")} value={month} max={currentMonth} onInput={e=>onMonth(e.currentTarget.value || currentMonth)}/></label><Button variant="outline" onClick={onExport}><Download size={16}/>{t("匯出明細")}</Button></div>
    </section>
    {demo&&<div className="demo-banner"><span className="banner-icon"><Sparkles size={17}/></span><div><strong>{t("示範工作區")}</strong><span>{t("真實收據照片，保留原始日期與金額。可切換範例月份查看。")}</span></div><TrialButton/></div>}
    {demo&&<p className="below-note">{t("免註冊試用：3 次辨識，24 小時臨時帳簿。文件交由 DeepSeek 處理，請使用不含敏感資料的收據。")}</p>}
    {demo&&<div className="sample-months"><span>{t("範例月份")}</span>{Array.from(new Set(data.transactions.map(row=>row.transaction_date.slice(0,7)))).map(key=><Button size="sm" variant={month===key?"default":"outline"} key={key} onClick={()=>onMonth(key)}>{key}</Button>)}</div>}
    <div className="stats-grid">
      <article className="stat-card"><div className="stat-label">{t("月度總支出")}<span className="stat-icon"><Wallet size={18}/></span></div><div className="stat-amount"><span>HK$</span>{hkd(total)}</div><div className="stat-foot">{change!==null?<><span className={change<=0?"trend-good":"trend-neutral"}>{change<=0?<ArrowDownLeft size={13}/>:<ArrowUpRight size={13}/>} {Math.abs(change).toFixed(1)}%</span><span>{t("較上月支出")}</span></>:<span>{t("尚無上月資料")}</span>}</div></article>
      <article className="stat-card"><div className="stat-label">{t("月度預算")}<span className="stat-icon warm"><Target size={18}/></span></div><div className="budget-head"><div className="stat-amount">{budget?<>{budgetPercent.toFixed(0)}<span>%</span></>:<span className="budget-unset">{t("尚未設定")}</span>}</div><button className="text-action" onClick={openBudget} aria-label={demo?t("查看月度預算"):t("設定月度預算")}><SlidersHorizontal size={15}/></button></div><div className="budget-track"><span className={budgetPercent>100?"over-budget":""} style={{width:Math.min(100,budgetPercent)+"%"}}/></div><div className="stat-foot">{budget?<><span>{Number(available)>=0?t("可用餘額"):t("超出預算")} <strong>HK$ {hkd(Math.abs(Number(available)))}</strong></span><span>/ {hkd(budget.amount_hkd,0)}</span></>:<button className="text-action" onClick={openBudget}>{t("設定月度預算 ")}<ChevronRight size={13}/></button>}</div></article>
      <article className="stat-card"><div className="stat-label">{t(demo?"範例收據":"已辨識收據")}<span className="stat-icon lavender"><FileCheck2 size={18}/></span></div><div className="stat-amount">{data.recognizedCount}<span className="stat-unit">{unitLabel(locale,data.recognizedCount,"receipts")}</span></div><div className="stat-foot"><span className="tiny-dot"/><span>{data.receipts.filter(r=>r.status==="needs_review").length}{t(" 份待覆核")}</span><span className="dot-separator">·</span><span>{data.transactions.length}{t(" 筆已入帳")}</span></div></article>
    </div>
    <div className="charts-grid">
      <article className="panel trend-panel"><div className="panel-heading"><div><h2>{t("支出趨勢")}</h2><p>{t("近六個月的支出變化")}</p></div><span className="chart-key"><i/>{t("港幣支出")}</span></div>
        <div className="trend-chart">{mounted&&<ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}><AreaChart data={trends} margin={{top:18,right:15,bottom:0,left:4}}><defs><linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#179b7b" stopOpacity={0.2}/><stop offset="100%" stopColor="#179b7b" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e9edf0"/><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fill:"#89929c",fontSize:12}} dy={9}/><YAxis axisLine={false} tickLine={false} tick={{fill:"#89929c",fontSize:11}} width={50} tickFormatter={value=>value>=1000?(value/1000).toFixed(0)+"k":String(value)}/><Tooltip contentStyle={{borderRadius:12,border:"1px solid #e8eceb",fontSize:12}} formatter={value=>["HK$ "+hkd(Number(value)),t("支出")]}/><Area isAnimationActive={false} type="monotone" dataKey="amount" stroke="#149578" strokeWidth={2.5} fill="url(#spendGradient)" dot={{r:3,fill:"#149578",stroke:"#fff",strokeWidth:2}} activeDot={{r:5}}/></AreaChart></ResponsiveContainer>}</div>
        <div className="chart-caption">{t("以交易日期統計，已確認入帳的支出才會計入。")}</div>
      </article>
      <article className="panel categories-panel"><div className="panel-heading"><div><h2>{t("支出分類")}</h2><p>{t("各分類支出佔比")}</p></div><span className="muted-small">HKD</span></div>
        <div className="category-chart-content"><div className="donut-wrap">{mounted&&categoryData.length>0?<ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}><PieChart><Pie isAnimationActive={false} data={categoryData} dataKey="value" innerRadius="69%" outerRadius="94%" paddingAngle={3} cornerRadius={4} stroke="none" startAngle={90} endAngle={-270}>{categoryData.map(category=><Cell key={category.id} fill={category.color}/>)}</Pie><Tooltip formatter={value=>["HK$ "+hkd(Number(value)),t("支出")]} contentStyle={{borderRadius:12,fontSize:12}}/></PieChart></ResponsiveContainer>:<div className="empty-donut"/>}<div className="donut-center"><span>{t("分類總額")}</span><strong>{hkd(total,0)}</strong><small>HKD</small></div></div><div className="category-legend">{categoryData.length?categoryData.map(category=><div key={category.id}><span><i style={{background:category.color}}/>{t(category.name)}</span><strong>{(category.value/Number(total)*100).toFixed(0)}<small>%</small></strong></div>):<p className="muted-small">{t("入帳後即可查看分類佔比。")}</p>}</div></div>
      </article>
    </div>
    <article className="panel recent-panel"><div className="panel-heading"><div><h2>{t("最近交易")}<span className="count-label">{rows.length}</span></h2></div><button className="text-action" onClick={onTransactions}>{t("查看全部")}<ChevronRight size={15}/></button></div>
      <TransactionTable rows={[...rows].sort((a,b)=>b.transaction_date.localeCompare(a.transaction_date)).slice(0,5)} onReview={onReview} compact/>
      {!rows.length&&<div className="empty-state"><FileCheck2 size={30}/><h3>{t("本月沒有交易")}</h3><p>{t("上傳收據並確認入帳後，即可查看交易。")}</p><Button onClick={onUpload}><Plus size={16}/>{t("上傳收據")}</Button></div>}
    </article>
    <Dialog open={budgetOpen} onOpenChange={setBudgetOpen}><DialogContent className="small-dialog"><div className="dialog-language"><LanguageSwitch/></div><DialogTitle>{t("月度預算")}</DialogTitle><DialogDescription>{month}{t(" · 月度支出上限（HKD）。")}</DialogDescription><label className="field">{t("預算金額（HKD）")}<input inputMode="decimal" value={budgetValue} onChange={e=>setBudgetValue(e.target.value)} disabled={demo} placeholder={t("例如 10000.00")}/></label>{demo?<><p className="form-note">{t("目前為唯讀示範。登入後即可設定自己的預算。")}</p><Button asChild><Link href="/auth">{t("建立帳號")}<ArrowUpRight size={16}/></Link></Button></>:<Button onClick={saveBudget} disabled={saving}>{saving&&<LoaderCircle className="spin" size={16}/>}{t("儲存預算")}</Button>}</DialogContent></Dialog>
  </>;
}
