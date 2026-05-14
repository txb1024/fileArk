import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { formatDate, formatSize, storage } from "../format";

describe("formatDate", () => {
  it("returns '暂无' for null input", () => {
    expect(formatDate(null)).toBe("暂无");
  });

  it("returns '暂无' for empty string", () => {
    expect(formatDate("")).toBe("暂无");
  });

  it("formats a valid date string", () => {
    const result = formatDate("2026-05-14T09:30:00");
    expect(result).toMatch(/^2026\/05\/14/);
    expect(result).toMatch(/09:30:00/);
  });

  it("pads single digit month and day", () => {
    const result = formatDate("2026-01-05T08:05:00");
    expect(result).toBe("2026/01/05 08:05:00");
  });
});

describe("formatSize", () => {
  it("formats bytes", () => {
    expect(formatSize(0)).toBe("0 B");
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(1023)).toBe("1023 B");
  });

  it("formats kilobytes", () => {
    expect(formatSize(1024)).toBe("1.0 KB");
    expect(formatSize(1536)).toBe("1.5 KB");
    expect(formatSize(10240)).toBe("10.0 KB");
  });

  it("formats megabytes", () => {
    expect(formatSize(1024 * 1024)).toBe("1.0 MB");
    expect(formatSize(1024 * 1024 * 5.5)).toBe("5.5 MB");
  });

  it("formats gigabytes", () => {
    expect(formatSize(1024 * 1024 * 1024)).toBe("1.0 GB");
    expect(formatSize(1024 * 1024 * 1024 * 2)).toBe("2.0 GB");
  });
});

describe("storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("storage.get", () => {
    it("returns fallback for missing key", () => {
      expect(storage.get("missing", "default")).toBe("default");
      expect(storage.get("missing", 123)).toBe(123);
      expect(storage.get("missing", { a: 1 })).toEqual({ a: 1 });
    });

    it("returns parsed value for existing key", () => {
      localStorage.setItem("test", JSON.stringify({ name: "test" }));
      expect(storage.get("test", {})).toEqual({ name: "test" });
    });

    it("returns fallback for invalid JSON", () => {
      localStorage.setItem("bad", "not json");
      expect(storage.get("bad", "fallback")).toBe("fallback");
    });
  });

  describe("storage.set", () => {
    it("stores stringified value", () => {
      storage.set("key", "value");
      expect(localStorage.getItem("key")).toBe('"value"');
    });

    it("stores object value", () => {
      storage.set("obj", { a: 1, b: 2 });
      expect(localStorage.getItem("obj")).toBe('{"a":1,"b":2}');
    });

    it("stores array value", () => {
      storage.set("arr", [1, 2, 3]);
      expect(localStorage.getItem("arr")).toBe("[1,2,3]");
    });

    it("handles errors gracefully", () => {
      // Mock localStorage.setItem to throw
      const original = localStorage.setItem;
      localStorage.setItem = () => {
        throw new Error("Quota exceeded");
      };
      // Should not throw
      expect(() => storage.set("key", "value")).not.toThrow();
      localStorage.setItem = original;
    });
  });
});
