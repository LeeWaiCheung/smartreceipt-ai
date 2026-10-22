import { afterEach,describe,expect,it,vi } from "vitest";
import { extractReceipt } from "./ai-core";
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
const valid={merchant:"QA Cafe",transaction_date:"2026-09-01",amount:"68.00",currency:"HKD",tax:null,category_id:"food",warnings:[]};
describe("DeepSeek adapter contract (mock responses, not accuracy evaluation)",()=>{
  it("refuses to call an unconfigured provider",async()=>{vi.stubEnv("DEEPSEEK_API_KEY","");await expect(extractReceipt(["https://example.com/sample.jpg"])).rejects.toThrow("AI_NOT_CONFIGURED");});
  it("sends images with JSON output and retains provider usage",async()=>{
    vi.stubEnv("DEEPSEEK_API_KEY","test-key");
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({model:"provider-model",choices:[{finish_reason:"stop",message:{content:JSON.stringify(valid)}}],usage:{prompt_tokens:120,completion_tokens:35}})));
    vi.stubGlobal("fetch",fetcher);
    const result=await extractReceipt(["https://example.com/private-signed.jpg"]);
    expect(result.extraction).toEqual(valid);expect(result.inputTokens).toBe(120);expect(result.model).toBe("provider-model");
    const request=JSON.parse(fetcher.mock.calls[0][1].body);
    expect(request.response_format).toEqual({type:"json_object"});expect(request.messages[1].content[1].image_url.detail).toBe("original");
  });
  it.each([[401,"AI_CREDENTIAL_ERROR"],[429,"AI_RATE_LIMIT"],[500,"AI_UPSTREAM_ERROR"]])("handles upstream HTTP %i without leaking the response",async(status,code)=>{
    vi.stubEnv("DEEPSEEK_API_KEY","test-key");vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("private-provider-message",{status})));await expect(extractReceipt(["https://example.com/sample.jpg"])).rejects.toThrow(code);
  });
  it("rejects malformed and truncated JSON",async()=>{
    vi.stubEnv("DEEPSEEK_API_KEY","test-key");
    const fetcher=vi.fn().mockResolvedValueOnce(Response.json({choices:[{finish_reason:"stop",message:{content:"not JSON"}}]})).mockResolvedValueOnce(Response.json({choices:[{finish_reason:"length",message:{content:"{}"}}]}));
    vi.stubGlobal("fetch",fetcher);
    await expect(extractReceipt(["https://example.com/sample.jpg"])).rejects.toThrow("AI_INVALID_OUTPUT");
    await expect(extractReceipt(["https://example.com/sample.jpg"])).rejects.toThrow("AI_INCOMPLETE_OUTPUT");
  });
});
