"use client";
import { useState } from "react";
import { LoaderCircle,ScanLine } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client-api";
import { useLanguage } from "./language-provider";
import { Button } from "./ui/button";
export function TrialButton() {
  const {t,error:localizeError}=useLanguage();
  const [busy,setBusy]=useState(false);
  async function start() {
    setBusy(true);
    try {const result=await apiFetch<{url:string}>("/api/guest-session",{method:"POST"});window.location.assign(result.url);}
    catch(error){toast.error(localizeError(error));setBusy(false);}
  }
  return <Button disabled={busy} onClick={()=>void start()}>{busy?<LoaderCircle size={16} className="spin"/>:<ScanLine size={16}/>} {t(busy?"正在建立試用工作區…":"免註冊試用 AI")}</Button>;
}
