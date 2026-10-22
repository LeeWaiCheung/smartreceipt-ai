import { demoSnapshot } from "@/lib/demo";
const escape=(text:string)=>text.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]!));
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  const id=(await params).id;
  const receipt=demoSnapshot().receipts.find(row=>row.id===id);
  if(!receipt?.extraction) return new Response("Not found",{status:404});
  const r=receipt.extraction;
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="560" height="760" viewBox="0 0 560 760">'+
    '<defs><filter id="paper"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".045"/></feComponentTransfer></filter></defs>'+
    '<rect width="560" height="760" fill="#fffef9"/><rect width="560" height="760" filter="url(#paper)" opacity=".7"/>'+
    '<g fill="#33372f" font-family="monospace,Microsoft JhengHei,sans-serif" text-anchor="middle">'+
    '<text x="280" y="76" font-size="29" font-weight="bold">'+escape(r.merchant || "Sample Store")+'</text>'+
    '<text x="280" y="112" font-size="14" letter-spacing="3">SMARTRECEIPT · DEMO DOCUMENT</text>'+
    '<path d="M56 145H504M56 330H504M56 456H504" stroke="#9a9b91" stroke-dasharray="6 5"/>'+
    '<text x="72" y="186" font-size="18" text-anchor="start">DATE</text><text x="490" y="186" font-size="18" text-anchor="end">'+escape(r.transaction_date || "")+'</text>'+
    '<text x="72" y="222" font-size="18" text-anchor="start">RECEIPT</text><text x="490" y="222" font-size="18" text-anchor="end">SR-2026-001</text>'+
    '<text x="72" y="290" font-size="18" text-anchor="start">Goods / services</text><text x="490" y="290" font-size="18" text-anchor="end">'+escape(r.amount || "")+'</text>'+
    '<text x="72" y="389" font-size="23" font-weight="bold" text-anchor="start">TOTAL '+escape(r.currency || "$")+'</text>'+
    '<text x="490" y="389" font-size="33" font-weight="bold" text-anchor="end">'+escape(r.amount || "")+'</text>'+
    '<text x="280" y="511" font-size="17">Thank you. Have a lovely day.</text>'+
    '<text x="280" y="590" font-size="17" fill="#8b917e">示範憑證 · 非真實交易</text>'+
    '<text x="280" y="621" font-size="13" fill="#8b917e">Generated for product demonstration only</text>'+
    '<g stroke="#43473a" stroke-width="2">'+Array.from({length:55},(_,i)=>'<path d="M'+(125+i*6)+' 658v'+(i%3===0?40:33)+'"/>').join("")+'</g></g></svg>';
  return new Response(svg,{headers:{"Content-Type":"image/svg+xml; charset=utf-8","Cache-Control":"public, max-age=3600","X-Content-Type-Options":"nosniff"}});
}
