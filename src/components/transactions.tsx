"use client";
import { useLanguage } from "./language-provider";
import { LanguageSwitch } from "./language-switch";
import { unitLabel } from "@/lib/i18n";
import { useMemo,useState } from "react";
import { Search,Download,SlidersHorizontal,ChevronDown,ChevronLeft,ChevronRight,ArrowDownUp,Eye,Trash2,ReceiptText,LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { CATEGORIES,type Transaction,type TransactionFilter } from "@/lib/types";
import { filterTransactions,sumHkd } from "@/lib/domain";
import { transactionsCsv } from "@/lib/csv";
import { apiFetch,downloadCsv } from "@/lib/client-api";
import { hkd } from "@/lib/utils";
import { CategoryIcon } from "./category-icon";
import { Button } from "./ui/button";
import { Dialog,DialogContent,DialogDescription,DialogTitle } from "./ui/dialog";

export function TransactionTable({rows,onReview,onDelete,compact=false}:{rows:Transaction[];onReview:(row:Transaction)=>void;onDelete?:(row:Transaction)=>void;compact?:boolean}) {
  const {t,locale,error:localizeError}=useLanguage();
  return <div className="table-scroll"><table className="transaction-table"><thead><tr><th>{t("商家 / 項目")}</th><th className="date-column">{t("交易日期")}</th><th className="category-column">{t("分類")}</th><th className="align-right">{t("金額（HKD）")}</th><th className="status-column">{t("狀態")}</th><th><span className="sr-only">{t("操作")}</span></th></tr></thead><tbody>{rows.map(row=>{
    const category=CATEGORIES.find(c=>c.id===row.category_id)!;
    return <tr key={row.id}><td><button className="merchant-cell" onClick={()=>onReview(row)} aria-label={t("查看 ")+row.merchant+t(" 的憑證")}><span className="merchant-icon" style={{background:category.color+"13",color:category.color}}><CategoryIcon category={row.category_id}/></span><span><strong>{row.merchant}</strong><small className="desktop-detail">{row.currency==="HKD"?t("收據支出"):row.currency+" "+hkd(row.amount)+t(" · 已折算")}</small><small className="mobile-date">{row.transaction_date} · {row.currency==="HKD"?t(category.name):row.currency+" "+hkd(row.amount)}</small></span></button></td><td className="date-cell">{row.transaction_date.replaceAll("-"," / ")}</td><td className="category-column"><span className="category-badge">{t(category.name)}</span></td><td className="align-right amount-cell">{hkd(row.amount_hkd)}</td><td className="status-column"><span className="status-badge confirmed"><i/>{t("已入帳")}</span></td><td><div className="row-actions"><button className="icon-button" onClick={()=>onReview(row)} aria-label={t("查看憑證：")+row.merchant}><Eye size={16}/></button>{!compact&&onDelete&&<button className="icon-button delete-action" onClick={()=>onDelete(row)} aria-label={t("刪除交易：")+row.merchant}><Trash2 size={15}/></button>}</div></td></tr>;
  })}</tbody></table></div>;
}
export function Transactions({rows,demo,onReview,onRefresh}:{rows:Transaction[];demo:boolean;onReview:(row:Transaction)=>void;onRefresh:()=>Promise<unknown>}) {
  const {t,locale,error:localizeError}=useLanguage();
  const [filter,setFilter]=useState<TransactionFilter>({search:"",category:"",start:"",end:""});
  const [page,setPage]=useState(1),[ascending,setAscending]=useState(false),[deleting,setDeleting]=useState<Transaction|null>(null),[busy,setBusy]=useState(false);
  const filtered=useMemo(()=>filterTransactions(rows,filter),[rows,filter]);
  const ordered=ascending?[...filtered].reverse():filtered;
  const count=Math.max(1,Math.ceil(ordered.length/12));
  const current=Math.min(page,count);
  function update(key:keyof TransactionFilter,value:string) {setFilter(prev=>({...prev,[key]:value}));setPage(1);}
  async function remove() {
    if(!deleting) return;
    setBusy(true);
    try {await apiFetch("/api/transactions/"+deleting.id,{method:"DELETE"});await onRefresh();setDeleting(null);toast.success(t("交易已移除，原憑證保留在收件匣"));}
    catch(error) {toast.error(localizeError(error));} finally {setBusy(false);}
  }
  function exportRows() {if(!filtered.length) return toast.info(t("目前沒有符合篩選的交易。"));downloadCsv(transactionsCsv(filtered,locale));toast.success(t("已匯出 {count} 筆交易",{count:filtered.length}));}
  return <>
    <section className="page-heading"><div><h1>{t("交易明細")}</h1></div><Button onClick={exportRows}><Download size={16}/>{t("匯出 CSV")}</Button></section>
    <article className="panel"><div className="filter-bar"><label className="search-field"><Search size={17}/><input aria-label={t("搜尋商家名稱")} placeholder={t("搜尋商家名稱…")} value={filter.search} onChange={e=>update("search",e.target.value)}/></label><label className="select-field"><SlidersHorizontal size={15}/><select aria-label={t("篩選分類")} value={filter.category} onChange={e=>update("category",e.target.value)}><option value="">{t("所有分類")}</option>{CATEGORIES.map(c=><option key={c.id} value={c.id}>{t(c.name)}</option>)}</select><ChevronDown size={14}/></label><div className="date-range"><input aria-label={t("開始日期")} type="date" value={filter.start} max={filter.end || undefined} onInput={e=>update("start",e.currentTarget.value)}/><span>—</span><input aria-label={t("結束日期")} type="date" value={filter.end} min={filter.start || undefined} onInput={e=>update("end",e.currentTarget.value)}/></div><button className="icon-button" aria-label={ascending?t("切換為日期由新到舊"):t("切換為日期由舊到新")} onClick={()=>setAscending(!ascending)}><ArrowDownUp size={17}/></button></div>
      <div className="filtered-summary"><span>{t("共 ")}<strong>{filtered.length}</strong>{" "+unitLabel(locale,filtered.length,"transactions")}</span><span>{t("合計 ")}<strong>HK$ {hkd(sumHkd(filtered))}</strong></span></div>
      <TransactionTable rows={ordered.slice((current-1)*12,current*12)} onReview={onReview} onDelete={demo?undefined:setDeleting}/>
      {!ordered.length&&<div className="empty-state"><ReceiptText size={32}/><h3>{t("沒有符合條件的交易")}</h3><p>{t("試試其他商家名稱、日期或分類。")}</p><Button variant="outline" onClick={()=>{setFilter({search:"",category:"",start:"",end:""});setPage(1);}}>{t("清除篩選")}</Button></div>}
      <div className="pagination"><span>{ordered.length?((current-1)*12+1)+"–"+Math.min(current*12,ordered.length):"0"} / {ordered.length}{" "+unitLabel(locale,ordered.length,"transactions")}</span><div><button className="icon-button" aria-label={t("上一頁")} disabled={current===1} onClick={()=>setPage(current-1)}><ChevronLeft size={17}/></button><span>{current} / {count}</span><button className="icon-button" aria-label={t("下一頁")} disabled={current>=count} onClick={()=>setPage(current+1)}><ChevronRight size={17}/></button></div></div>
    </article>
    {demo&&<p className="below-note">{t("唯讀示範 · 可以篩選、查看憑證及匯出示範資料。登入後管理自己的交易。")}</p>}
    <Dialog open={!!deleting} onOpenChange={open=>{if(!open&&!busy)setDeleting(null);}}><DialogContent className="small-dialog"><div className="dialog-language"><LanguageSwitch/></div><DialogTitle>{t("移除這筆支出？")}</DialogTitle><DialogDescription>{deleting?.merchant} · HK$ {hkd(deleting?.amount_hkd || 0)}</DialogDescription><p className="form-note">{t("原憑證會保留在收件匣，你可以重新覆核入帳。")}</p><div className="dialog-actions"><Button variant="outline" disabled={busy} onClick={()=>setDeleting(null)}>{t("保留交易")}</Button><Button variant="danger" disabled={busy} onClick={remove}>{busy&&<LoaderCircle className="spin" size={15}/>}{t("確認移除")}</Button></div></DialogContent></Dialog>
  </>;
}
