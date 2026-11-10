import { describe, it, expect } from "vitest";
import { formatProblem, summarise } from "./problems";
import { Problem } from "./editor";

describe("problems and status formatting", () => {
  it("formats problem paths relative to root", () => {
    const p: Problem = {
      path: "D:\\proj\\ch\\one.typ",
      line: 7,
      col: 39,
      severity: "error",
      message: "expected length",
    };
    expect(formatProblem(p, "D:\\proj")).toBe("ch\\one.typ:7:39  expected length");
  });

  it("summarises diagnostic counts", () => {
    const p: Problem = {
      path: "D:\\proj\\ch\\one.typ",
      line: 7,
      col: 39,
      severity: "error",
      message: "expected length",
    };
    expect(summarise([])).toBe("No problems");
    expect(summarise([p])).toBe("1 error");
    expect(summarise([p, p, { ...p, severity: "warning" }])).toBe("2 errors, 1 warning");
  });
});
