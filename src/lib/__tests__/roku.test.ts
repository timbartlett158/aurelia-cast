import { describe, expect, it } from "vitest";
import {
  buildRokuPackage,
  manifest,
  mainBrs,
  httpServerTaskBrs,
  receiverSceneBrs,
  validateSettings,
} from "../roku/templates";

const base = { title: "Aurelia Cast", port: 8080, accent: "Gold" as const };

describe("validateSettings", () => {
  it("accepts valid settings", () => {
    expect(validateSettings(base)).toEqual([]);
  });
  it("rejects ports outside 8080-8099", () => {
    expect(validateSettings({ ...base, port: 80 })).toContain(
      "port must be an integer between 8080 and 8099"
    );
  });
  it("rejects empty titles", () => {
    expect(validateSettings({ ...base, title: "  " })).toContain("title is required");
  });
});

describe("generated package", () => {
  const files = buildRokuPackage(base);
  const byName = Object.fromEntries(files.map((f) => [f.name, f.content]));

  it("contains all expected files", () => {
    const names = files.map((f) => f.name);
    for (const expected of [
      "manifest",
      "source/main.brs",
      "source/components/HttpServerTask.xml",
      "source/components/HttpServerTask.brs",
      "source/components/ReceiverScene.xml",
      "source/components/ReceiverScene.brs",
      "source/components/HistoryRegistry.brs",
      "SIDELoad.md",
    ]) {
      expect(names).toContain(expected);
    }
  });

  it("manifest carries the configured port as a bs_const", () => {
    expect(manifest(base)).toContain("bs_const=RECEIVER_PORT=8080");
  });

  it("manifest is line-oriented key=value", () => {
    for (const line of manifest(base).split("\n")) {
      expect(line).toMatch(/^[a-z_]+=\S.*$/);
    }
  });

  it("main.brs wires port and accent from settings", () => {
    const src = mainBrs({ ...base, port: 8099, accent: "Crimson" });
    expect(src).toContain("httpTask.receiverPort = 8099");
    expect(src).toContain("0xDC2626FF");
  });

  it("http server task references the route set", () => {
    const src = httpServerTaskBrs(base);
    expect(src).toContain("/play?");
    expect(src).toContain("/stop");
    expect(src).toContain("roStreamSocket");
  });

  it("every brs function/sub has a matching terminator", () => {
    for (const brsName of Object.keys(byName).filter((n) => n.endsWith(".brs"))) {
      const src = byName[brsName];
      const subs = (src.match(/^\s*(sub|function)\s/m) ?? []).length;
      const openings = (src.match(/(^\s*(sub|function)\s)/gm) ?? []).length;
      const subEnds = (src.match(/end sub/gm) ?? []).length;
      const fnEnds = (src.match(/end function/gm) ?? []).length;
      expect(openings, brsName).toBeGreaterThan(0);
      expect(subs, brsName).toBeGreaterThanOrEqual(0);
      expect(subEnds + fnEnds, `${brsName} unterminated blocks`).toBe(openings);
    }
  });

  it("ReceiverScene handles key events", () => {
    expect(receiverSceneBrs()).toContain('key = "OK"');
  });
});
