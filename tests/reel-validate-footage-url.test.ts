import { describe, expect, it } from "vitest";
import { assertFootageUrlIsSafe } from "@/lib/reels/validateFootageUrl";

describe("assertFootageUrlIsSafe", () => {
  it("rejects loopback IP literals", async () => {
    await expect(assertFootageUrlIsSafe("http://127.0.0.1/raw.mp4")).rejects.toThrow(/private|internal/i);
  });

  it("rejects the cloud metadata address", async () => {
    await expect(assertFootageUrlIsSafe("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(/private|internal/i);
  });

  it("rejects private 10.x / 192.168.x / 172.16-31.x ranges", async () => {
    await expect(assertFootageUrlIsSafe("http://10.0.0.5/raw.mp4")).rejects.toThrow();
    await expect(assertFootageUrlIsSafe("http://192.168.1.1/raw.mp4")).rejects.toThrow();
    await expect(assertFootageUrlIsSafe("http://172.20.0.1/raw.mp4")).rejects.toThrow();
  });

  it("rejects the literal hostname localhost", async () => {
    await expect(assertFootageUrlIsSafe("http://localhost/raw.mp4")).rejects.toThrow();
  });

  it("rejects non-http(s) protocols", async () => {
    await expect(assertFootageUrlIsSafe("file:///etc/passwd")).rejects.toThrow();
  });

  it("rejects an unparseable URL", async () => {
    await expect(assertFootageUrlIsSafe("not a url")).rejects.toThrow();
  });

  it("accepts a public IP literal", async () => {
    await expect(assertFootageUrlIsSafe("http://8.8.8.8/raw.mp4")).resolves.toBeUndefined();
  });
});
