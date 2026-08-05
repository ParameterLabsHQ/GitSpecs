import { describe, it, expect } from "vitest";
import {
  encodeRevisionUriParts,
  decodeRevisionUriParts,
  revisionDocumentTitle,
  revisionDiffTitle,
  REVISION_SCHEME,
} from "./uriParts.js";

describe("REVISION_SCHEME", () => {
  it("is gitspecs", () => {
    expect(REVISION_SCHEME).toBe("gitspecs");
  });
});

describe("revisionDocumentTitle / revisionDiffTitle", () => {
  it("formats short rev titles", () => {
    expect(revisionDocumentTitle("src/a.ts", "abcdef0123456789")).toBe("a.ts @ abcdef0");
    expect(revisionDocumentTitle("a.ts", "HEAD")).toBe("a.ts @ HEAD");
  });

  it("formats diff titles", () => {
    expect(revisionDiffTitle("src/a.ts", "abc", "Working Tree")).toBe(
      "a.ts (abc ↔ Working Tree)",
    );
  });
});

describe("encodeRevisionUriParts / decodeRevisionUriParts", () => {
  it("round-trips root, path, and rev", () => {
    const raw = encodeRevisionUriParts("/Users/dev/repo", "src/foo.ts", "abc123def456");
    const parts = decodeRevisionUriParts(raw.path, raw.query);
    expect(parts).toEqual({
      root: "/Users/dev/repo",
      path: "src/foo.ts",
      rev: "abc123def456",
    });
  });

  it("handles spaces and special characters in path and root", () => {
    const raw = encodeRevisionUriParts("/tmp/my repo", "path with spaces/a.ts", "deadbeef");
    const parts = decodeRevisionUriParts(raw.path, raw.query);
    expect(parts).toEqual({
      root: "/tmp/my repo",
      path: "path with spaces/a.ts",
      rev: "deadbeef",
    });
  });

  it("handles nested paths", () => {
    const raw = encodeRevisionUriParts("/r", "a/b/c.md", "1".repeat(40));
    expect(decodeRevisionUriParts(raw.path, raw.query)).toEqual({
      root: "/r",
      path: "a/b/c.md",
      rev: "1".repeat(40),
    });
  });

  it("returns undefined when rev or root is missing", () => {
    expect(decodeRevisionUriParts("/a.ts", "")).toBeUndefined();
    expect(decodeRevisionUriParts("/a.ts", "rev=abc")).toBeUndefined();
    expect(decodeRevisionUriParts("/a.ts", "root=/r")).toBeUndefined();
  });

  it("returns undefined for empty path", () => {
    expect(decodeRevisionUriParts("/", "rev=abc&root=/r")).toBeUndefined();
    expect(decodeRevisionUriParts("", "rev=abc&root=/r")).toBeUndefined();
  });
});
