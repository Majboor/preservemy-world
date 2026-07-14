// Structural contract for the landing page. These guard the pieces that make
// the page a valid, shareable document and keep the opportunity form wired
// correctly — the site's primary conversion flow.
import { test } from "node:test";
import assert from "node:assert/strict";
import { INDEX_HTML, EXPECTED_PROGRAMS, attrValues } from "../helpers/repo.mjs";

test("document has a doctype, lang and utf-8 charset", () => {
  assert.match(INDEX_HTML, /^\s*<!doctype html>/i);
  assert.match(INDEX_HTML, /<html[^>]*lang="en"/i);
  assert.match(INDEX_HTML, /<meta[^>]*charset="utf-8"/i);
});

test("has a responsive viewport meta", () => {
  assert.match(
    INDEX_HTML,
    /<meta[^>]*name="viewport"[^>]*width=device-width/i,
  );
});

test("has a non-empty title", () => {
  const m = INDEX_HTML.match(/<title>([^<]+)<\/title>/i);
  assert.ok(m, "no <title> element found");
  assert.ok(m[1].trim().length > 0, "title is empty");
});

test("has social sharing metadata (Open Graph + Twitter card)", () => {
  for (const prop of ["og:title", "og:description", "og:image"]) {
    assert.ok(
      INDEX_HTML.includes(`property="${prop}"`),
      `missing Open Graph tag ${prop}`,
    );
  }
  assert.match(INDEX_HTML, /name="twitter:card"/i);
  assert.match(INDEX_HTML, /name="twitter:image"/i);
});

test("every in-page anchor points at an element that exists", () => {
  const ids = new Set(attrValues(INDEX_HTML, "id"));
  const anchors = attrValues(INDEX_HTML, "href")
    .filter((h) => h.startsWith("#") && h.length > 1)
    .map((h) => h.slice(1));
  assert.ok(anchors.length > 0, "expected at least one in-page anchor");
  for (const target of anchors) {
    assert.ok(ids.has(target), `anchor #${target} has no matching id`);
  }
});

test("the opportunity form exposes exactly the expected program buttons", () => {
  // Only the real form-option buttons — not the "form-jump" CTA links, which
  // all reuse creator-access and are validated separately.
  const optionPrograms = new Set(
    [...INDEX_HTML.matchAll(/class="form-option[^"]*"[^>]*data-program="([^"]+)"/g)].map(
      (m) => m[1],
    ),
  );
  assert.deepEqual(
    [...optionPrograms].sort(),
    [...EXPECTED_PROGRAMS].sort(),
    "form-option buttons drifted from the expected program set",
  );
});

test("every program has a human-readable name in the JS formNames map", () => {
  const block = INDEX_HTML.match(/const formNames\s*=\s*\{([\s\S]*?)\};/);
  assert.ok(block, "formNames map not found");
  const body = block[1];
  for (const program of EXPECTED_PROGRAMS) {
    // Keys may be quoted ("campus-ambassador") or bare (internship).
    const quoted = body.includes(`"${program}"`);
    const bare = new RegExp(`(^|[^\\w-])${program}\\s*:`).test(body);
    assert.ok(quoted || bare, `formNames is missing an entry for ${program}`);
  }
});

test("the default form iframe requests a known program", () => {
  const m = INDEX_HTML.match(/id="programForm"[\s\S]*?src="([^"]+)"/);
  assert.ok(m, "programForm iframe not found");
  const src = m[1];
  const program = new URL(src).searchParams.get("program");
  assert.ok(
    EXPECTED_PROGRAMS.includes(program),
    `default iframe program "${program}" is not a known program`,
  );
});

test("form-jump call-to-action links target the forms section", () => {
  const jumps = [
    ...INDEX_HTML.matchAll(/class="[^"]*form-jump[^"]*"[^>]*href="([^"]+)"/g),
  ].map((m) => m[1]);
  assert.ok(jumps.length > 0, "expected at least one form-jump link");
  for (const href of jumps) {
    assert.equal(href, "#forms", `form-jump link should go to #forms, got ${href}`);
  }
});
