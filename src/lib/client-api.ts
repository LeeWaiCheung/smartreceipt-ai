"use client";
export async function apiFetch<T>(url:string,options:RequestInit={}):Promise<T> {
  const response=await fetch(url,{
    ...options,headers:{"Content-Type":"application/json",...options.headers},cache:"no-store"
  });
  const payload=await response.json().catch(()=>({error:"伺服器回應中斷，請稍後再試。"}));
  if(!response.ok) throw new Error(payload.error || "暫時無法完成操作。");
  return payload as T;
}
export function downloadCsv(csv:string) {
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8;"}));
  const anchor=document.createElement("a");
  anchor.href=url;anchor.download="smartreceipt-"+new Date().toISOString().slice(0,10)+".csv";anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
