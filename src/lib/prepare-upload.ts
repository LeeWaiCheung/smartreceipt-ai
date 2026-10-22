"use client";
import { validateUpload } from "./domain";
export interface PreparedReceipt { file:File;hash:string;pages:Blob[] }
async function jpeg(canvas:HTMLCanvasElement):Promise<Blob> {
  let quality=0.88;
  for(let attempt=0;attempt<5;attempt++) {
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error("無法處理圖片。")),"image/jpeg",quality));
    if(blob.size<=2*1024*1024) return blob;
    quality-=0.13;
  }
  throw new Error("圖片過於複雜，請裁剪收據後重新上傳。");
}
export async function prepareReceipt(file:File):Promise<PreparedReceipt> {
  validateUpload(file);
  const buffer=await file.arrayBuffer();
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",buffer))).map(byte=>byte.toString(16).padStart(2,"0")).join("");
  const pages:Blob[]=[];
  if(file.type==="application/pdf") {
    const pdfjs=await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc="/pdf.worker.min.mjs";
    const loading=pdfjs.getDocument({data:new Uint8Array(buffer),useSystemFonts:true});
    try {
      const pdf=await loading.promise.catch(()=>{throw new Error("無法開啟 PDF，請確認檔案完整且沒有密碼保護。");});
      if(pdf.numPages>10) throw new Error("每份 PDF 最多 10 頁，請先分拆文件。");
      for(let i=1;i<=pdf.numPages;i++) {
        const page=await pdf.getPage(i),base=page.getViewport({scale:1});
        const scale=Math.min(2,1800/base.width,6000/base.height,Math.sqrt(4_000_000/(base.width*base.height)));
        const viewport=page.getViewport({scale});
        const canvas=document.createElement("canvas");
        canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
        const context=canvas.getContext("2d");
        if(!context) throw new Error("瀏覽器無法處理 PDF，請使用較新的瀏覽器。");
        await page.render({canvas,canvasContext:context,viewport}).promise;
        pages.push(await jpeg(canvas));page.cleanup();
      }
    } finally {await loading.destroy();}
  } else {
    let bitmap:ImageBitmap;
    try {bitmap=await createImageBitmap(file);} catch {throw new Error("無法讀取圖片，請確認檔案可正常開啟後再試。");}
    try {
      const scale=Math.min(1,2400/bitmap.width,6000/bitmap.height,Math.sqrt(4_000_000/(bitmap.width*bitmap.height)));
      const canvas=document.createElement("canvas");
      canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      const context=canvas.getContext("2d");
      if(!context) throw new Error("瀏覽器無法處理圖片。");
      context.fillStyle="#fff";context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
      pages.push(await jpeg(canvas));
    } finally {bitmap.close();}
  }
  return {file,hash,pages};
}
