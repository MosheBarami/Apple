import { describe, expect, it } from "vitest";
import { guard } from "@/lib/guard";

const req = (headers: Record<string, string>) => new Request("http://127.0.0.1:4790/api/chat", { method: "POST", headers });

describe("local-only API guard", () => {
  it("allows loopback hosts, with or without a loopback Origin", () => {
    expect(guard(req({ host: "127.0.0.1:4790" }))).toBeNull();
    expect(guard(req({ host: "localhost:4790", origin: "http://localhost:4790" }))).toBeNull();
  });
  it("rejects a foreign Host (DNS rebinding) and a foreign Origin (cross-site page)", () => {
    expect(guard(req({ host: "evil.example.com" }))?.status).toBe(403);
    expect(guard(req({ host: "127.0.0.1:4790", origin: "https://evil.example.com" }))?.status).toBe(403);
    expect(guard(req({}))?.status).toBe(403);
  });
});
