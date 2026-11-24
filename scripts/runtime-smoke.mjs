import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["server.ts"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: "3111", HOST: "127.0.0.1" },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
child.stdout.on("data", (c) => (log += c));
child.stderr.on("data", (c) => (log += c));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForUp() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch("http://127.0.0.1:3111/api/health");
      if (res.ok) return;
    } catch {
      await wait(500);
    }
  }
  throw new Error("server never came up\n" + log);
}

try {
  await wait(2000);
  await waitForUp();

  const health = await (await fetch("http://127.0.0.1:3111/api/health")).json();
  console.log("health:", JSON.stringify(health));

  const cast = await fetch("http://127.0.0.1:3111/api/cast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", roomId: "smoke" }),
  });
  console.log("cast:", cast.status, JSON.stringify(await cast.json()));

  const bad = await fetch("http://127.0.0.1:3111/api/cast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "ftp://nope", roomId: "smoke" }),
  });
  console.log("cast-invalid:", bad.status);

  const history = await (await fetch("http://127.0.0.1:3111/api/history")).json();
  console.log("history items:", history.items.length);

  const zipRes = await fetch("http://127.0.0.1:3111/api/export-roku", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Aurelia Cast", port: 8080, accent: "Gold" }),
  });
  const zip = Buffer.from(await zipRes.arrayBuffer());
  const pk = zip[0] === 0x50 && zip[1] === 0x4b;
  console.log("export:", zipRes.status, zip.length, "bytes, PK header:", pk);

  const home = await fetch("http://127.0.0.1:3111/");
  console.log("home:", home.status);

  const receiver = await fetch("http://127.0.0.1:3111/receiver?room=smoke");
  console.log("receiver:", receiver.status);

  const allOk =
    health.ws === "up" &&
    cast.status === 200 &&
    bad.status === 422 &&
    history.items.length >= 1 &&
    zipRes.status === 200 &&
    pk &&
    home.status === 200 &&
    receiver.status === 200;

  console.log(allOk ? "SMOKE_OK" : "SMOKE_FAIL");
  process.exit(allOk ? 0 : 1);
} catch (err) {
  console.error("SMOKE_FAIL:", err.message);
  process.exit(1);
} finally {
  child.kill("SIGINT");
}
