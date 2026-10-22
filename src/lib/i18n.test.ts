import { describe,expect,it } from "vitest";
import { categoryLabel,errorText,monthLabel,translate,unitLabel } from "./i18n";
import { CATEGORIES } from "./types";
describe("locale presentation",()=>{
  it("uses singular and plural English units without changing Chinese counters",()=>{
    expect(unitLabel("en",1,"transactions")).toBe("transaction");
    expect(unitLabel("en",0,"receipts")).toBe("receipts");
    expect(unitLabel("en",2,"pages")).toBe("pages");
    expect(unitLabel("zh-Hant",1,"transactions")).toBe("筆");
  });
  it("substitutes values while preserving spacing and the selected language",()=>{
    expect(translate("en"," 收據原圖，第 {page} 頁 ",{page:2})).toBe(" Receipt image, page 2 ");
    expect(translate("zh-Hant","收據原圖，第 {page} 頁",{page:2})).toBe("收據原圖，第 2 頁");
  });
  it("localizes safe errors without exposing unrecognized server details",()=>{
    expect(errorText("en",new Error("已達今日辨識額度，請明天再試。"))).toMatch(/limit.*tomorrow/);
    expect(errorText("zh-Hant",new Error("Failed to fetch"))).toBe("網絡連線失敗，請檢查連線後重試。");
    expect(errorText("en",new Error("未知內部資訊"))).toBe("Please check the form fields.");
  });
  it("changes category labels and chart months without changing business identifiers",()=>{
    expect(categoryLabel("food","en")).toBe("Food & drinks");
    expect(categoryLabel("food","zh-Hant")).toBe("餐飲");
    expect(monthLabel("2026-09","en")).toMatch(/^Sep(?:t)?$/);
    expect(monthLabel("2026-09","zh-Hant")).toBe("9月");
    expect(CATEGORIES[0].id).toBe("food");
  });
  it("preserves original document text that is not an interface message",()=>{
    expect(translate("en","海港咖啡有限公司")).toBe("海港咖啡有限公司");
    expect(translate("en","")).toBe("");
  });
});
