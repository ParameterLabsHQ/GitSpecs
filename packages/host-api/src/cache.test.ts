import { describe, it, expect } from "vitest";
import { HostApiCache, cacheKey } from "./cache.js";

describe("HostApiCache", () => {
  it("stores and returns values; respects maxAge", () => {
    const c = new HostApiCache();
    c.set("k", { n: 1 });
    expect(c.get<{ n: number }>("k")).toEqual({ n: 1 });
    expect(c.get("k", 0)).toBeUndefined(); // maxAge 0 → always stale for get
    expect(c.getStale<{ n: number }>("k")).toEqual({ n: 1 });
  });

  it("cacheKey joins parts", () => {
    expect(cacheKey(["a", 1, undefined])).toBe("a|1|");
  });
});
