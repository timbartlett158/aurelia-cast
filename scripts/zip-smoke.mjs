import archiver from "archiver";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildRokuPackage } from "../src/lib/roku/templates.ts";

const files = buildRokuPackage({ title: "Aurelia Cast", port: 8080, accent: "Gold" });
const archive = archiver("zip", { zlib: { level: 9 } });
const chunks = [];
archive.on("data", (c) => chunks.push(c));
const done = new Promise((resolve, reject) => {
  archive.on("end", resolve);
  archive.on("error", reject);
});
for (const f of files) archive.append(f.content, { name: f.name });
archive.finalize();
await done;

const zip = Buffer.concat(chunks);
const headerOk = zip[0] === 0x50 && zip[1] === 0x4b && zip[2] === 0x03 && zip[3] === 0x04;
const outPath = path.join(os.tmpdir(), "aurelia-roku-smoke.zip");
fs.writeFileSync(outPath, zip);

const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
let entryCount = -1;
if (eocd >= 0 && eocd + 12 <= zip.length) {
  entryCount = zip.readUInt16LE(eocd + 10);
}

console.log(`zip bytes=${zip.length} header=${headerOk} entries=${entryCount} files=${files.length}`);
console.log(headerOk && entryCount === files.length && files.length === 8 ? "ZIP_OK" : "ZIP_FAIL");
if (headerOk && entryCount === files.length) process.exit(0);
process.exit(1);
