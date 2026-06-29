/* preservemy.world - Hero A/B test controller (Variant B)
 *
 * Activation:
 *   ?variant=b   -> force Variant B  (also remembered in localStorage)
 *   ?variant=a   -> force Variant A  (clears the remembered choice)
 *   (no param)   -> use remembered choice, else default Variant A
 *
 * What Variant B changes (content-only rewrite of the PRIMARY hero blocks -
 * the ones with an <h1>; the secondary story slides with <h2> are left as-is):
 *   - Headline:  "Save a place / before it's / gone."
 *   - Subhead:   action-first framing of a phone walkthrough -> walkable world
 *   - CTAs:      solid accent "Preserve a memory" primary + quiet secondary link
 * Layout shifts (centered column, accent button) live in hero-variant-b.css,
 * gated on <body class="variant-b">. This script is a no-op for Variant A
 * apart from rendering the small A/B switch control.
 */
(function () {
  "use strict";

  var STORE_KEY = "pmw-hero-variant";

  function resolveVariant() {
    var forced = null;
    try {
      forced = new URLSearchParams(window.location.search).get("variant");
    } catch (e) {
      forced = null;
    }
    if (forced === "b" || forced === "a") {
      try { window.localStorage.setItem(STORE_KEY, forced); } catch (e) {}
      return forced;
    }
    try {
      var saved = window.localStorage.getItem(STORE_KEY);
      if (saved === "b" || saved === "a") return saved;
    } catch (e) {}
    return "a";
  }

  var VARIANT_B_COPY = {
    headline: [
      { text: "Save a place" },
      { text: "before it's" },
      { text: "", em: "gone", after: "." }
    ],
    subhead:
      "Turn a five-minute phone walkthrough into a world people can step back into - a street, a home, a shrine, kept exactly as it was.",
    primary: { label: "Preserve a memory", href: "#forms", program: "creator-access" },
    secondary: { label: "Tour a live world", href: "#worlds" }
  };

  function buildHeadline(h) {
    h.innerHTML = "";
    VARIANT_B_COPY.headline.forEach(function (part) {
      var span = document.createElement("span");
      if (part.text) span.appendChild(document.createTextNode(part.text));
      if (part.em) {
        var em = document.createElement("em");
        em.textContent = part.em;
        span.appendChild(em);
      }
      if (part.after) span.appendChild(document.createTextNode(part.after));
      h.appendChild(span);
    });
  }

  function applyToBlock(block) {
    var h1 = block.querySelector("h1");
    if (!h1) return; // only rewrite primary blocks (skip <h2> story slides)

    // Badge above headline (idempotent).
    if (!block.querySelector(".variant-badge")) {
      var badge = document.createElement("div");
      badge.className = "variant-badge";
      badge.textContent = "Heritage at risk";
      h1.parentNode.insertBefore(badge, h1);
    }

    buildHeadline(h1);

    var p = h1.parentNode.querySelector("p");
    if (p) p.textContent = VARIANT_B_COPY.subhead;

    var actions = block.querySelector(".hero-actions");
    if (actions) {
      actions.innerHTML = "";

      var primary = document.createElement("a");
      primary.className = "btn variant-cta form-jump";
      primary.href = VARIANT_B_COPY.primary.href;
      primary.setAttribute("data-program", VARIANT_B_COPY.primary.program);
      primary.textContent = VARIANT_B_COPY.primary.label;
      // The site's form-jump handlers are bound at page load, so a button we
      // inject afterwards won't be wired. Re-use the existing form-option
      // buttons (already wired to setProgram) instead of duplicating logic.
      primary.addEventListener("click", function () {
        var opt = document.querySelector(
          '.form-option[data-program="' + VARIANT_B_COPY.primary.program + '"]'
        );
        if (opt) opt.click();
      });
      actions.appendChild(primary);

      var secondary = document.createElement("a");
      secondary.className = "btn is-ghost variant-link";
      secondary.href = VARIANT_B_COPY.secondary.href;
      secondary.textContent = VARIANT_B_COPY.secondary.label;
      actions.appendChild(secondary);
    }
  }

  function applyVariantB() {
    document.body.classList.add("variant-b");
    var blocks = document.querySelectorAll(".hero-slide-copy, .hero-copy");
    Array.prototype.forEach.call(blocks, applyToBlock);
  }

  function renderSwitch(active) {
    if (document.querySelector(".variant-switch")) return;
    var base = window.location.pathname;
    var wrap = document.createElement("div");
    wrap.className = "variant-switch";
    wrap.setAttribute("aria-label", "Hero A/B variant switch");

    var label = document.createElement("span");
    label.textContent = "Hero";
    wrap.appendChild(label);

    [["A", "a"], ["B", "b"]].forEach(function (pair) {
      var a = document.createElement("a");
      a.href = base + "?variant=" + pair[1];
      a.textContent = pair[0];
      if (active === pair[1]) a.className = "is-active";
      wrap.appendChild(a);
    });
    document.body.appendChild(wrap);
  }

  function init() {
    var variant = resolveVariant();
    if (variant === "b") applyVariantB();
    renderSwitch(variant);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
