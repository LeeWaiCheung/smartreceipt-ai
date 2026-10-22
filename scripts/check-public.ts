import { mkdir,writeFile } from "node:fs/promises";
const base=(process.argv[2]||"http://127.0.0.1:3001").replace(/\/$/,"");
async function main() {
  const uuid="00000000-0000-4000-8000-000000000000";
  const cases:[string,string,number][]=[
    ["/","GET",200],["/auth","GET",200],["/workspace","GET",307],
    ["/setup","GET",404],["/api/local-setup","POST",404],
    ["/api/workspace","GET",401],["/api/analytics?month=2026-10","GET",401],
    ["/api/fx?currency=USD&date=2026-09-20","GET",401],
    ["/api/receipts","POST",401],[`/api/receipts/${uuid}/extract`,"POST",401],
    [`/api/receipts/${uuid}/preview`,"GET",401],["/api/transactions","POST",401],
    [`/api/transactions/${uuid}`,"DELETE",401],["/api/budgets","POST",401]
  ];
  const results=[];
  for(const [route,method,expected] of cases) {
    const response=await fetch(base+route,{method,redirect:"manual",headers:{Origin:base,"Content-Type":"application/json"},...(method==="POST"?{body:"{}"}:{})});
    const text=await response.text();
    const headersOk=response.headers.get("x-content-type-options")==="nosniff"&&response.headers.get("x-frame-options")==="DENY";
    const contentOk=route!=="/"||text.includes("SmartReceipt")&&text.includes("示範");
    const passed=response.status===expected&&headersOk&&contentOk;
    results.push({route,method,expected,actual:response.status,headersOk,contentOk,passed});
    console.log(`${passed?"PASS":"FAIL"}: ${method} ${route} (${response.status})`);
  }
  const passed=results.every(r=>r.passed);
  await mkdir("reports",{recursive:true});
  await writeFile("reports/public-smoke.json",JSON.stringify({checkedAt:new Date().toISOString(),base,status:passed?"passed":"failed",note:"Anonymous access and production configuration gates only; does not test authenticated receipt processing.",results},null,2)+"\n");
  if(!passed)process.exitCode=1;
}
main().catch(()=>{console.error("Public smoke check could not complete; start a production server first.");process.exitCode=1;});
