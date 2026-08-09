import { describe, expect, it } from "vitest";
import { detectPageRoute } from "@capture-flow/core";

describe("detectPageRoute", () => {
  it("classifies zhihu", () => {
    const r = detectPageRoute(
      "https://www.zhihu.com/question/1/answer/2",
    );
    expect(r.site).toBe("zhihu");
    expect(r.canCapture).toBe(true);
  });

  it("rejects non-http", () => {
    const r = detectPageRoute("chrome://extensions");
    expect(r.canCapture).toBe(false);
  });
});
