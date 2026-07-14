// Validates the data + config files the site depends on: the places gallery
// manifest, the PWA manifest for the demo, and the dev server that must send
// cross-origin isolation headers so SparkJS can use SharedArrayBuffer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { read, path } from "../helpers/repo.mjs";

test("places.json is valid and every entry has a still image on disk", () => {
  const places = JSON.parse(read("assets/places/stills/places.json"));
  assert.ok(Array.isArray(places) && places.length > 0, "places.json should be a non-empty array");
  const slugs = new Set();
  for (const p of places) {
    for (const key of ["slug", "name", "loc", "file", "url"]) {
      assert.ok(typeof p[key] === "string" && p[key].length > 0, `place ${p.slug || "?"} missing ${key}`);
    }
    assert.ok(!slugs.has(p.slug), `duplicate place slug: ${p.slug}`);
    slugs.add(p.slug);
    assert.ok(
      existsSync(path("assets/places/stills", p.file)),
      `still image not found for ${p.slug}: ${p.file}`,
    );
  }
});

test("demo-game PWA manifest is valid and its icon exists", () => {
  const manifest = JSON.parse(read("demo-game/manifest.webmanifest"));
  for (const key of ["name", "start_url", "display", "icons"]) {
    assert.ok(manifest[key], `manifest missing "${key}"`);
  }
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0, "manifest has no icons");
  for (const icon of manifest.icons) {
    const rel = icon.src.replace(/^\.\//, "");
    assert.ok(existsSync(path("demo-game", rel)), `manifest icon missing: ${icon.src}`);
  }
});

test("the demo dev server sets COOP/COEP cross-origin isolation headers", () => {
  // Without these, SharedArrayBuffer is unavailable and the SparkJS flight
  // demo cannot start. This guards against a regression in serve.py.
  const serve = read("demo-game/serve.py");
  assert.match(serve, /Cross-Origin-Opener-Policy["']\s*,\s*["']same-origin/);
  assert.match(serve, /Cross-Origin-Embedder-Policy["']\s*,\s*["']require-corp/);
});

test("service worker and manifest are linked from the demo page", () => {
  const html = read("demo-game/index.html");
  assert.match(html, /manifest\.webmanifest/, "demo page does not link its manifest");
});
