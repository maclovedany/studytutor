import { describe, it, expect } from "vitest";
import { sumPoints } from "./points";

describe("sumPoints", () => {
  it("이벤트 points 합계를 반환한다", () => {
    expect(sumPoints([{ points: 1000 }, { points: 2000 }, { points: -500 }])).toBe(2500);
  });
  it("빈 배열은 0 을 반환한다", () => {
    expect(sumPoints([])).toBe(0);
  });
});
