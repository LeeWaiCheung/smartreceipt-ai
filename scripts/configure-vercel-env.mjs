import { spawnSync } from "node:child_process";
import { readFileSync,mkdirSync,writeFileSync } from "node:fs";
process.loadEnvFile(".env.local");
const project=JSON.parse(readFileSync(".vercel/project.json","utf8"));
if(project.projectName!=="smartreceipt-ai")throw new Error("Link the intended smartreceipt-ai Vercel project first.");
const keys=["NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY","SUPABASE_SECRET_KEY","DEEPSEEK_API_KEY","DEEPSEEK_MODEL","DEEPSEEK_BASE_URL"];
const updated=[];
for(const name of keys) {
  const value=process.env[name];
  if(!value)throw new Error("Missing local setting: "+name);
  // Only fixed names/flags enter the command; private values travel over stdin.
  const result=spawnSync("npx.cmd",["--yes","vercel@65.0.0","env","add",name,"--environment","production","--force","--yes",name.startsWith("NEXT_PUBLIC_")?"--no-sensitive":"--sensitive"],{
    shell:true,input:value,encoding:"utf8",windowsHide:true
  });
  if(result.status!==0){console.error("Could not configure "+name+". Check Vercel login and project access; secret values were not printed.");process.exitCode=1;break;}
  updated.push(name);console.log("Configured production setting: "+name);
}
mkdirSync("reports/private",{recursive:true});
writeFileSync("reports/private/vercel-env.json",JSON.stringify({configuredAt:new Date().toISOString(),projectId:project.projectId,environment:"production",updated,complete:updated.length===keys.length},null,2));
