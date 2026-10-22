import { describe,it,expect,vi } from "vitest";
import { getFxQuote } from "./fx";
const response=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json"}});
describe("historical exchange-rate selection",()=>{
  it("does not call an external service for HKD",async()=>{const fetcher=vi.fn();expect(await getFxQuote("HKD","2026-10-21",fetcher)).toEqual({rate:"1",date:"2026-10-21",source:"HKD 本位幣"});expect(fetcher).not.toHaveBeenCalled();});
  it("selects the newest eligible quote and excludes future and wrong-currency data",async()=>{
    const fetcher=vi.fn().mockResolvedValue(response([
      {date:"2026-10-20",base:"USD",quote:"HKD",rate:7.79},
      {date:"2026-10-21",base:"USD",quote:"HKD",rate:7.8},
      {date:"2026-10-22",base:"USD",quote:"HKD",rate:100},
      {date:"2026-10-21",base:"CNY",quote:"HKD",rate:1.1}
    ]));
    expect(await getFxQuote("USD","2026-10-21",fetcher)).toMatchObject({rate:"7.8",date:"2026-10-21"});
    expect(fetcher.mock.calls[0][0]).toContain("from=2026-10-11");
  });
  it("uses the previous available quote on a non-publishing day",async()=>{const fetcher=vi.fn().mockResolvedValue(response([{date:"2026-10-16",base:"USD",quote:"HKD",rate:7.8}]));expect((await getFxQuote("USD","2026-10-18",fetcher)).date).toBe("2026-10-16");});
  it("rejects missing or invalid quotes without a fabricated fallback",async()=>{for(const payload of [[],{},[{date:"2026-10-21",base:"USD",quote:"HKD",rate:0}],[{date:"2026-10-22",base:"USD",quote:"HKD",rate:7.8}]])await expect(getFxQuote("USD","2026-10-21",vi.fn().mockResolvedValue(response(payload)))).rejects.toThrow();});
  it("surfaces upstream failures",async()=>await expect(getFxQuote("USD","2026-10-21",vi.fn().mockResolvedValue(response({},503)))).rejects.toThrow());
});
