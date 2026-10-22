import { redirect } from "next/navigation";
import { currentUser,userClient } from "@/lib/supabase/server";
import { isTrialUser } from "@/lib/trial";
import { snapshot } from "@/lib/repository";
import { SmartReceiptApp } from "@/components/smart-receipt-app";
import { StatusScreen } from "@/components/status-screen";
export const dynamic="force-dynamic";
export default async function WorkspacePage() {
  const user=await currentUser();
  if(!user) redirect("/auth");
  if(isTrialUser(user)) {
    const active=await (await userClient())!.rpc("workspace_access_active");
    if(!active.error&&!active.data)return <StatusScreen title="試用工作區已到期" message="這個工作區已結束。你可以返回首頁，查看範例或重新開始試用。" action="返回首頁" href="/"/>;
  }
  try {
    const initial=await snapshot();
    return <SmartReceiptApp mode={isTrialUser(user)?"trial":"live"} initial={initial} email={isTrialUser(user)?"訪客試用":user.email || "我的工作區"} today={new Date().toISOString()}/>;
  } catch {
    return <StatusScreen title="工作區正在準備中" message="資料服務尚未接通。你可以先看看完整的示範工作區，稍後再回來。" action="查看示範" href="/"/>;
  }
}
