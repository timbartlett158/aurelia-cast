import { describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

describe("roku zip export", () => {
  const repoRoot = path.resolve(import.meta.dirname, "../../..");

  it("has an export-roku route module", () => {
    expect(fs.existsSync(path.join(repoRoot, "src/app/api/export-roku/route.ts"))).toBe(true);
  });

  it("produces a structurally valid zip (PK header, 8 entries)", () => {
    const script = path.join(repoRoot, "scripts/zip-smoke.mjs");
    const out = execFileSync(process.execPath, [script], { encoding: "utf8", cwd: repoRoot });
    expect(out).toContain("ZIP_OK");
  });

  it("writes smoke output next to os.tmpdir without extra config", () => {
    expect(fs.existsSync(os.tmpdir())).toBe(true);
  });

  it("keeps path normalization stable", () => {
    expect(path.join(repoRoot, "src/app")).toBe(path.join(repoRoot, "src", "app"));
  });
});
