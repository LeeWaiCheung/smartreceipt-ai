"use client";
import { TrialButton } from "./trial-button";
import { useLanguage } from "./language-provider";
import { dateLocale,unitLabel } from "@/lib/i18n";
import { useRef,useState } from "react";
import Link from "next/link";
import { UploadCloud,Camera,FileImage,FileText,CheckCircle2,AlertCircle,LoaderCircle,ArrowUpRight,ScanLine,ShieldCheck,ChevronRight,RotateCcw,Inbox,ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client-api";
import { prepareReceipt } from "@/lib/prepare-upload";
import { demoSnapshot } from "@/lib/demo";
import { browserClient } from "@/lib/supabase/browser";
import type { Receipt,Snapshot } from "@/lib/types";
import { Button } from "./ui/button";

interface UploadJob {id:string;name:string;status:"queued"|"preparing"|"uploading"|"processing"|"done"|"failed";error?:string}
const statusText={uploaded:"待處理",processing:"辨識中",needs_review:"待覆核",confirmed:"已入帳",failed:"需重試"};
const jobText={queued:"等候處理",preparing:"整理文件",uploading:"正在上傳",processing:"AI 辨識中",done:"可以覆核",failed:"處理未完成"};
export function Receipts({data,demo,onReview,onRefresh}:{data:Snapshot;demo:boolean;onReview:(receipt:Receipt)=>void;onRefresh:()=>Promise<Snapshot>}) {
  const {t,locale,error:localizeError}=useLanguage();
  const [jobs,setJobs]=useState<UploadJob[]>([]),[running,setRunning]=useState(false),[dragging,setDragging]=useState(false),[tab,setTab]=useState("all"),[retryId,setRetryId]=useState(""),[page,setPage]=useState(1);
  const input=useRef<HTMLInputElement>(null),camera=useRef<HTMLInputElement>(null);
  async function sample() {
    try {
      const response=await fetch("/demo/receipts/hk-restaurant-2026.jpg");
      if(!response.ok)throw new Error("暫時無法顯示憑證，請稍後再試。");
      await upload([new File([await response.blob()],"hk-restaurant-2026.jpg",{type:"image/jpeg"})]);
    } catch(error){toast.error(localizeError(error));}
  }
  function updateJob(id:string,patch:Partial<UploadJob>) {setJobs(previous=>previous.map(job=>job.id===id?{...job,...patch}:job));}
  async function upload(files:File[]) {
    if(demo || running || !files.length)return;
    if(data.trial&&files.some(file=>file.size>5242880)){toast.error(t("試用每份最多 5 MB，PDF 最多 2 頁。"));return;}
    if(files.length>(data.trial?3:10)){toast.error(t(data.trial?"這個試用工作區最多上傳 3 份收據。":"每批最多 10 份文件，請分批上傳。"));return;}
    const client=browserClient();
    if(!client){toast.error(t("工作區尚未準備完成。"));return;}
    setRunning(true);
    const queue=files.map(file=>({file,id:crypto.randomUUID()}));
    setJobs(queue.map(job=>({id:job.id,name:job.file.name,status:"queued"})));
    let index=0;
    async function worker() {
      while(index<queue.length) {
        const job=queue[index++];
        try {
          updateJob(job.id,{status:"preparing"});
          const prepared=await prepareReceipt(job.file);
          const response=await apiFetch<{id:string;bucket:string;duplicate:boolean;receipt?:Receipt;uploads?:{path:string;token:string}[]}>("/api/receipts",{
            method:"POST",body:JSON.stringify({name:job.file.name,type:job.file.type,size:job.file.size,hash:prepared.hash,pages:prepared.pages.length})
          });
          if(response.duplicate) {
            updateJob(job.id,{status:"done"});toast.info(t("這份收據已存在：")+job.file.name);
            if(response.receipt&&files.length===1)onReview(response.receipt);
            continue;
          }
          updateJob(job.id,{status:"uploading"});
          const blobs:[Blob,string][]=[[job.file,job.file.type],...prepared.pages.map(page=>[page,"image/jpeg"] as [Blob,string])];
          for(let i=0;i<blobs.length;i++) {
            const destination=response.uploads![i];
            const uploaded=await client!.storage.from(response.bucket).uploadToSignedUrl(destination.path,destination.token,blobs[i][0],{contentType:blobs[i][1]});
            if(uploaded.error)throw new Error("文件上傳中斷，請重新選取原檔再試。");
          }
          updateJob(job.id,{status:"processing"});
          await apiFetch("/api/receipts/"+response.id+"/extract",{method:"POST"});
          const refreshed=await onRefresh();
          updateJob(job.id,{status:"done"});
          if(files.length===1){const receipt=refreshed.receipts.find(row=>row.id===response.id);if(receipt)onReview(receipt);}
        } catch(error){updateJob(job.id,{status:"failed",error:(error as Error).message});}
      }
    }
    await Promise.all([worker(),worker()]);
    await onRefresh().catch(()=>{});
    setRunning(false);
    if(input.current)input.current.value="";
    if(camera.current)camera.current.value="";
  }
  async function retry(receipt:Receipt) {
    setRetryId(receipt.id);
    try {await apiFetch("/api/receipts/"+receipt.id+"/extract",{method:"POST"});await onRefresh();toast.success(t("辨識完成，可以覆核入帳。"));}
    catch(error){toast.error(localizeError(error));await onRefresh().catch(()=>{});}finally{setRetryId("");}
  }
  const filtered=data.receipts.filter(receipt=>tab==="all"||receipt.status===tab);
  const pageCount=Math.max(1,Math.ceil(filtered.length/12)),currentPage=Math.min(page,pageCount);
  const draft=data.receipts.find(r=>r.status==="needs_review") || (demo?data.receipts[0]:undefined);
  return <>
    <section className="page-heading"><div><h1>{t("收據管理")}</h1></div><span className="quota-badge"><ScanLine size={16}/>{demo?t("免註冊試用 AI"):data.trial?t("試用辨識 ")+data.trial.attempts+" / "+data.trial.limit:t("今日辨識 ")+data.aiAttemptsToday+" / "+data.dailyLimit}</span></section>
    <div className="upload-grid"><section className={"upload-zone"+(dragging?" dragging":"")} onDragOver={event=>{event.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={event=>{event.preventDefault();setDragging(false);if(demo){toast.info(t("按「免註冊試用 AI」即可上傳自己的收據。"));return;}void upload(Array.from(event.dataTransfer.files));}}>
      <div className="upload-illustration"><div className="mini-paper back"/><div className="mini-paper"><ScanLine size={31}/><i/><i/><span>HK$ 128.00</span></div><span className="upload-float-icon"><UploadCloud size={23}/></span></div>
      <h2>{t("上傳收據")}</h2><p>{t("拖放文件或選擇圖片／PDF")}</p><div className="upload-actions">{demo?<TrialButton/>:<><Button disabled={running} onClick={()=>input.current?.click()}><UploadCloud size={17}/>{running?t("處理文件中…"):t("選擇文件")}</Button><Button variant="outline" disabled={running} onClick={()=>camera.current?.click()}><Camera size={17}/>{t("拍照")}</Button></>}</div>
      {data.trial&&<div className="trial-sample"><Button size="sm" variant="ghost" disabled={running} onClick={()=>void sample()}>{t("用香港範例辨識（計 1 次）")}</Button><a href={demoSnapshot().receipts[0].source!.url} target="_blank" rel="noreferrer">{t("範例照片來源")} · CC0</a></div>}
      <div className="upload-limits"><span>{t("JPG、PNG、PDF")}</span><i/>{t(data.trial?"每份最多 5 MB":"每份最多 10 MB")}<i/>{t(data.trial?"每個試用工作區最多 3 份":"每批最多 10 份")}</div>
      <input className="sr-only" type="file" multiple accept="image/jpeg,image/png,application/pdf" aria-label={t("選擇收據文件")} ref={input} onChange={event=>void upload(Array.from(event.target.files || []))}/>
      <input className="sr-only" type="file" accept="image/jpeg,image/png" capture="environment" aria-label={t("拍攝收據")} ref={camera} onChange={event=>void upload(Array.from(event.target.files || []))}/>
    </section><aside className="upload-guide panel"><span className="guide-icon"><ShieldCheck size={23}/></span><h3>{t("收據覆核")}</h3><p>{t("核對 AI 提取的欄位後確認入帳；未確認資料不計入支出。")}</p><ol><li><span>01</span><div><strong>{t("上傳收據")}</strong><small>{t(data.trial?"PDF 每份最多 2 頁":"PDF 每份最多 10 頁")}</small></div></li><li><span>02</span><div><strong>{t("對照並覆核")}</strong><small>{t("商家、日期、金額與幣種")}</small></div></li><li><span>03</span><div><strong>{t("確認入帳")}</strong><small>{t("看板與明細同步更新")}</small></div></li></ol>{demo&&draft&&<button className="text-action" onClick={()=>onReview(draft)}>{t("試看覆核畫面")}<ChevronRight size={15}/></button>}</aside></div>
    {demo&&<p className="below-note">{t("免註冊試用：3 次辨識，24 小時臨時帳簿。文件交由 DeepSeek 處理，請使用不含敏感資料的收據。")}</p>}
    {!demo&&<p className="below-note">{t("文件會儲存在私人雲端，並交由 DeepSeek 讀取收據內容。")}</p>}
    {!!jobs.length&&<section className="panel upload-progress"><div className="panel-heading"><div><h2>{t("本次上傳")}</h2><p>{t("各文件獨立處理，單份失敗不影響其餘文件。")}</p></div><span className="muted-small">{jobs.filter(j=>j.status==="done").length} / {jobs.length}{t(" 完成")}</span></div>{jobs.map(job=><div className="upload-job" key={job.id}><span className={"job-icon "+job.status}>{job.status==="done"?<CheckCircle2 size={20}/>:job.status==="failed"?<AlertCircle size={20}/>:<LoaderCircle size={20} className="spin"/>}</span><div><strong>{job.name}</strong>{job.error&&<p role="alert">{localizeError(job.error)}</p>}</div><span>{t(jobText[job.status])}</span></div>)}</section>}
    <article className="panel receipt-list-panel"><div className="panel-heading"><div><h2>{t("所有收據")}<span className="count-label">{data.receipts.length}</span></h2><p>{demo?t("以下是真實收據照片；欄位經人工核對，圖片來源見憑證。"):t("查看原檔與辨識狀態。")}</p></div></div><div className="receipt-tabs">{[["all",t("全部")],["needs_review",t("待覆核")],["confirmed",t("已入帳")],["failed",t("需重試")]].map(([key,label])=><button key={key} className={tab===key?"active":""} onClick={()=>{setTab(key);setPage(1);}}>{label}<span>{key==="all"?data.receipts.length:data.receipts.filter(r=>r.status===key).length}</span></button>)}</div>
      {filtered.slice((currentPage-1)*12,currentPage*12).map(receipt=><div className="receipt-row" key={receipt.id}><span className={"file-type-icon "+(receipt.mime_type==="application/pdf"?"pdf":"")}>{receipt.mime_type==="application/pdf"?<FileText size={22}/>:<FileImage size={22}/>}</span><div className="receipt-row-name"><strong>{receipt.original_name}</strong><small>{new Date(receipt.created_at).toLocaleDateString(dateLocale(locale),{timeZone:"Asia/Hong_Kong"})} · {(receipt.file_size/1024).toFixed(0)} KB</small></div><span className={"status-badge "+receipt.status}><i/>{t(statusText[receipt.status])}</span>{["needs_review","confirmed"].includes(receipt.status)?<Button size="sm" variant="ghost" onClick={()=>onReview(receipt)}>{receipt.status==="needs_review"?t("前往覆核"):t("查看憑證")}<ChevronRight size={14}/></Button>:receipt.status==="failed"||receipt.status==="uploaded"?<Button variant="ghost" size="sm" disabled={demo||!!retryId} onClick={()=>void retry(receipt)}>{retryId===receipt.id?<LoaderCircle className="spin" size={14}/>:<RotateCcw size={14}/>}{t("重試")}</Button>:<LoaderCircle className="spin muted" size={17}/>}</div>)}
      {!filtered.length&&<div className="empty-state"><Inbox size={32}/><h3>{t("沒有收據")}</h3><p>{t("這個分類下目前沒有收據。")}</p></div>}
      <div className="pagination"><span>{filtered.length?((currentPage-1)*12+1)+"–"+Math.min(currentPage*12,filtered.length):"0"} / {filtered.length}{" "+unitLabel(locale,filtered.length,"receipts")}</span><div><button className="icon-button" aria-label={t("上一頁收據")} disabled={currentPage===1} onClick={()=>setPage(currentPage-1)}><ChevronLeft size={17}/></button><span>{currentPage} / {pageCount}</span><button className="icon-button" aria-label={t("下一頁收據")} disabled={currentPage>=pageCount} onClick={()=>setPage(currentPage+1)}><ChevronRight size={17}/></button></div></div>
    </article>
  </>;
}
