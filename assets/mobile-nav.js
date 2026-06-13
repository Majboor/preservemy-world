/*
 * mobile-nav.js — self-contained mobile/tablet navigation for preservemy.world
 *
 * The header hides `.nav-links` (<=1080px) and `.nav-actions` (<=720px), which
 * left phones and tablets with no way to reach the site sections or the primary
 * CTAs. This script injects an accessible hamburger toggle + slide-in drawer
 * that mirrors those links, with zero markup changes required in index.html
 * (only a single <script defer> tag). It is intentionally standalone to avoid
 * merge conflicts with the main module script.
 */
(function () {
  "use strict";

  // Only build the drawer when the header nav is actually collapsed.
  var COLLAPSE_QUERY = "(max-width: 1080px)";

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  ready(function () {
    var header = document.querySelector(".site-nav");
    if (!header) return;
    if (document.querySelector(".mnav-toggle")) return; // already initialized

    var navLinks = header.querySelector(".nav-links");
    var navActions = header.querySelector(".nav-actions");

    // ---- styles (scoped, injected once) --------------------------------
    var css = [
      ".mnav-toggle{",
      "  display:none;position:fixed;top:26px;right:var(--pad-x,16px);z-index:80;",
      "  width:48px;height:48px;border-radius:50%;",
      "  border:1px solid currentColor;background:transparent;color:inherit;",
      "  cursor:pointer;align-items:center;justify-content:center;",
      "  -webkit-tap-highlight-color:transparent;transition:color .2s ease,background .2s ease;",
      "}",
      ".site-nav .mnav-toggle{color:inherit;}",
      ".mnav-toggle:focus-visible{outline:2px solid var(--mint,#8fdbbb);outline-offset:2px;}",
      ".mnav-toggle .mnav-bars{display:block;position:relative;width:20px;height:14px;}",
      ".mnav-toggle .mnav-bars span{",
      "  position:absolute;left:0;right:0;height:2px;background:currentColor;border-radius:2px;",
      "  transition:transform .25s ease,opacity .2s ease,top .25s ease;",
      "}",
      ".mnav-toggle .mnav-bars span:nth-child(1){top:0;}",
      ".mnav-toggle .mnav-bars span:nth-child(2){top:6px;}",
      ".mnav-toggle .mnav-bars span:nth-child(3){top:12px;}",
      "body.mnav-open .mnav-toggle{position:fixed;color:var(--paper,#f3f7f7);}",
      "body.mnav-open .mnav-toggle .mnav-bars span:nth-child(1){top:6px;transform:rotate(45deg);}",
      "body.mnav-open .mnav-toggle .mnav-bars span:nth-child(2){opacity:0;}",
      "body.mnav-open .mnav-toggle .mnav-bars span:nth-child(3){top:6px;transform:rotate(-45deg);}",
      // drawer
      ".mnav-drawer{",
      "  position:fixed;inset:0;z-index:75;display:flex;flex-direction:column;",
      "  padding:96px var(--pad-x,16px) max(28px,env(safe-area-inset-bottom));",
      "  background:var(--ink,#07161c);color:var(--paper,#f3f7f7);",
      "  transform:translateX(100%);transition:transform .32s cubic-bezier(.4,0,.2,1);",
      "  overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;",
      "  visibility:hidden;",
      "}",
      "body.mnav-open .mnav-drawer{transform:translateX(0);visibility:visible;}",
      ".mnav-drawer a{",
      "  display:flex;align-items:center;min-height:52px;padding:6px 2px;",
      "  font-family:var(--soft-display,sans-serif);font-size:28px;line-height:1.1;",
      "  color:var(--paper,#f3f7f7);text-decoration:none;",
      "  border-bottom:1px solid var(--line-light,rgba(255,255,255,.18));",
      "}",
      ".mnav-drawer a:last-child{border-bottom:none;}",
      ".mnav-links{display:flex;flex-direction:column;}",
      ".mnav-actions{display:flex;flex-direction:column;gap:12px;margin-top:28px;}",
      ".mnav-actions a{",
      "  justify-content:center;min-height:56px;font-size:16px;font-family:var(--mono,monospace);",
      "  text-transform:uppercase;letter-spacing:.02em;border:1px solid var(--mint,#8fdbbb);",
      "  border-radius:var(--radius,8px);border-bottom:1px solid var(--mint,#8fdbbb);",
      "}",
      ".mnav-actions a.mnav-primary{background:var(--mint,#8fdbbb);color:var(--ink,#07161c);}",
      "@media (max-width:1080px){.mnav-toggle{display:flex;}}",
      "@media (prefers-reduced-motion:reduce){",
      "  .mnav-drawer{transition:none;}.mnav-toggle .mnav-bars span{transition:none;}",
      "}"
    ].join("");
    var style = document.createElement("style");
    style.setAttribute("data-mnav", "");
    style.textContent = css;
    document.head.appendChild(style);

    // ---- toggle button --------------------------------------------------
    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "mnav-toggle";
    toggle.setAttribute("aria-label", "Open navigation menu");
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML = '<span class="mnav-bars" aria-hidden="true"><span></span><span></span><span></span></span>';
    header.appendChild(toggle);

    // ---- drawer ---------------------------------------------------------
    var drawer = document.createElement("nav");
    drawer.className = "mnav-drawer";
    drawer.id = "mnav-drawer";
    drawer.setAttribute("aria-label", "Mobile navigation");
    drawer.setAttribute("aria-hidden", "true");
    toggle.setAttribute("aria-controls", drawer.id);

    var linksWrap = document.createElement("div");
    linksWrap.className = "mnav-links";
    if (navLinks) {
      navLinks.querySelectorAll("a").forEach(function (a) {
        var c = document.createElement("a");
        c.href = a.getAttribute("href");
        c.textContent = a.textContent.trim();
        linksWrap.appendChild(c);
      });
    }
    drawer.appendChild(linksWrap);

    var actionsWrap = document.createElement("div");
    actionsWrap.className = "mnav-actions";
    if (navActions) {
      navActions.querySelectorAll("a").forEach(function (a, i) {
        var c = document.createElement("a");
        c.href = a.getAttribute("href");
        c.textContent = a.textContent.trim();
        if (a.dataset.program) c.dataset.program = a.dataset.program;
        // preserve the form-jump hook so the existing module can bind it if present
        if (a.classList.contains("form-jump")) c.classList.add("form-jump");
        if (i === navActions.querySelectorAll("a").length - 1) c.classList.add("mnav-primary");
        actionsWrap.appendChild(c);
      });
    }
    if (actionsWrap.children.length) drawer.appendChild(actionsWrap);

    document.body.appendChild(drawer);

    // ---- open / close logic --------------------------------------------
    var lastFocus = null;

    function focusables() {
      return Array.prototype.slice.call(
        drawer.querySelectorAll('a[href], button:not([disabled])')
      );
    }

    function open() {
      lastFocus = document.activeElement;
      document.body.classList.add("mnav-open");
      document.body.style.overflow = "hidden";
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-label", "Close navigation menu");
      drawer.setAttribute("aria-hidden", "false");
      var f = focusables();
      if (f.length) f[0].focus();
      document.addEventListener("keydown", onKey, true);
    }

    function close(restoreFocus) {
      document.body.classList.remove("mnav-open");
      document.body.style.overflow = "";
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Open navigation menu");
      drawer.setAttribute("aria-hidden", "true");
      document.removeEventListener("keydown", onKey, true);
      if (restoreFocus !== false && lastFocus && typeof lastFocus.focus === "function") {
        lastFocus.focus();
      }
    }

    function isOpen() {
      return document.body.classList.contains("mnav-open");
    }

    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "Tab") {
        var f = focusables();
        if (!f.length) return;
        var first = f[0];
        var last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    toggle.addEventListener("click", function () {
      if (isOpen()) close();
      else open();
    });

    // Close when a nav link is tapped (it navigates within the page).
    drawer.addEventListener("click", function (e) {
      var a = e.target.closest ? e.target.closest("a") : null;
      if (a) close(false);
    });

    // If the viewport grows back to desktop while open, tidy up.
    var mq = window.matchMedia(COLLAPSE_QUERY);
    var onChange = function (ev) {
      if (!ev.matches && isOpen()) close(false);
    };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange); // Safari < 14
  });
})();
