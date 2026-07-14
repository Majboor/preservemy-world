// Broken asset references are the most common way a static site quietly rots:
// a renamed video, a moved poster, a font path typo. These tests walk every
// local reference in the HTML/CSS and assert the file is actually present.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { INDEX_HTML, path, attrValues, isLocalAsset } from "../helpers/repo.mjs";

function localRefs(html) {
  const refs = new Set();
  for (const attr of ["src", "poster", "href", "data-full-src", "data-full-poster"]) {
    for (const v of attrValues(html, attr)) {
      if (isLocalAsset(v)) refs.add(v.split(/[?#]/)[0]);
    }
  }
  // CSS url(...) references inside the inline <style> (fonts, textures, etc.)
  for (const m of html.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
    const v = m[1];
    if (isLocalAsset(v)) refs.add(v.split(/[?#]/)[0]);
  }
  return [...refs];
}

const refs = localRefs(INDEX_HTML);

test("index.html actually references local assets", () => {
  assert.ok(refs.length > 10, `only found ${refs.length} local refs — extractor may be broken`);
});

test("every local asset referenced by index.html exists on disk", () => {
  const missing = refs.filter((r) => !existsSync(path(r)));
  assert.deepEqual(missing, [], `missing assets:\n  ${missing.join("\n  ")}`);
});

test("hero and world media come in matched .mp4 + poster pairs", () => {
  // Any data-full-src video should ship with a data-full-poster fallback image.
  const videoBlocks = [...INDEX_HTML.matchAll(/<video[^>]*>/g)].map((m) => m[0]);
  const withFullSrc = videoBlocks.filter((b) => b.includes("data-full-src"));
  assert.ok(withFullSrc.length > 0, "expected videos with data-full-src");
  for (const block of withFullSrc) {
    assert.ok(
      /poster="/.test(block) || /data-full-poster="/.test(block),
      `a lite-mode video has no poster fallback: ${block.slice(0, 120)}...`,
    );
  }
});

test("all fonts declared via @font-face resolve to files", () => {
  const fontFaces = [...INDEX_HTML.matchAll(/@font-face\s*\{[\s\S]*?\}/g)].map((m) => m[0]);
  assert.ok(fontFaces.length >= 3, "expected several @font-face declarations");
  for (const face of fontFaces) {
    const url = face.match(/url\(\s*["']?([^"')]+)["']?\s*\)/);
    assert.ok(url, `@font-face without a url(): ${face.slice(0, 60)}`);
    if (isLocalAsset(url[1])) {
      assert.ok(existsSync(path(url[1])), `font file missing: ${url[1]}`);
    }
  }
});
