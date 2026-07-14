import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, "..", "..");
const DEMO_PORT = Number(process.env.PMW_DEMO_PORT || 9067);

let server;

test.beforeAll(async () => {
  server = spawn("python3", ["demo-game/serve.py", String(DEMO_PORT)], {
    cwd: REPO_ROOT,
    stdio: "ignore",
  });
  // Poll until the demo server answers.
  const deadline = Date.now() + 15_000;
  for (;;) {
    try {
      const r = await fetch(`http://127.0.0.1:${DEMO_PORT}/index.html`);
      if (r.ok) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error("demo serve.py did not start");
    await new Promise((r) => setTimeout(r, 250));
  }
});

test.afterAll(() => {
  server?.kill("SIGTERM");
});

test.describe("3D demo dev server", () => {
  test("serves the flight demo with cross-origin isolation headers", async () => {
    // SparkJS requires SharedArrayBuffer, which requires a cross-origin
    // isolated context (COOP + COEP). Missing headers => black screen.
    const res = await fetch(`http://127.0.0.1:${DEMO_PORT}/index.html`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cross-origin-opener-policy")).toBe("same-origin");
    expect(res.headers.get("cross-origin-embedder-policy")).toBe("require-corp");
  });

  test("the demo page and its PWA manifest are reachable", async () => {
    const html = await (await fetch(`http://127.0.0.1:${DEMO_PORT}/index.html`)).text();
    expect(html).toMatch(/manifest\.webmanifest/);
    const manifest = await fetch(`http://127.0.0.1:${DEMO_PORT}/manifest.webmanifest`);
    expect(manifest.status).toBe(200);
    const parsed = JSON.parse(await manifest.text());
    expect(parsed.icons.length).toBeGreaterThan(0);
  });
});
