// Shared helpers for the unit test suites. No external dependencies —
// everything here runs on the Node.js built-in test runner.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(here, "..", "..");

export const path = (...parts) => join(REPO_ROOT, ...parts);

export const read = (rel) => readFileSync(path(rel), "utf8");

export const INDEX_HTML = read("index.html");

/**
 * Program identifiers wired into the opportunity intake form. These MUST stay
 * in sync between the clickable buttons, the JS `formNames` lookup, and the
 * default iframe query string, otherwise a button would open the wrong form.
 */
export const EXPECTED_PROGRAMS = [
  "creator-access",
  "internship",
  "campus-ambassador",
  "partnership",
  "support",
  "webinar",
];

/** Pull every value of an attribute out of the raw HTML. */
export function attrValues(html, attr) {
  const re = new RegExp(`${attr}\\s*=\\s*"([^"]*)"`, "g");
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

/** Is this reference a local, on-disk asset (not http(s)/data/mailto/anchor)? */
export function isLocalAsset(ref) {
  if (!ref) return false;
  const r = ref.trim();
  if (!r) return false;
  // Skip JS template-literal placeholders picked up from inline scripts
  // (e.g. url("${poster}")) — those are not static file references.
  if (r.includes("${")) return false;
  return !/^(https?:|data:|mailto:|tel:|#|\/\/)/i.test(r);
}
