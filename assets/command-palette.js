/*
 * preservemy.world - Command Palette
 * A self-contained quick-navigation overlay for this long single-page site.
 * Open with Cmd/Ctrl+K or "/" (when not typing). Fuzzy-search sections,
 * worlds, and quick actions; navigate with the keyboard; hit Enter to jump.
 *
 * Self-contained on purpose: injects its own styles, builds its index from
 * the existing DOM, and adds a single trigger. No external dependencies.
 */
(function () {
  "use strict";

  if (window.__pmwPaletteLoaded) return;
  window.__pmwPaletteLoaded = true;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- styles ---------- */
  var css = "\
  .pmw-cmd-trigger{position:fixed;left:20px;bottom:20px;z-index:940;display:inline-flex;align-items:center;gap:8px;\
    padding:9px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.16);\
    background:rgba(7,22,28,.72);color:#f3f7f7;font-family:'DM Mono',ui-monospace,monospace;\
    font-size:12px;letter-spacing:.02em;cursor:pointer;backdrop-filter:blur(10px);\
    -webkit-backdrop-filter:blur(10px);box-shadow:0 8px 30px rgba(7,22,28,.28);\
    transition:transform .18s ease,background .18s ease,opacity .3s ease;opacity:0;transform:translateY(8px)}\
  .pmw-cmd-trigger.is-in{opacity:1;transform:translateY(0)}\
  .pmw-cmd-trigger:hover{transform:translateY(-2px);background:rgba(14,42,49,.9)}\
  .pmw-cmd-trigger kbd{display:inline-flex;align-items:center;padding:2px 6px;border-radius:5px;\
    background:rgba(143,219,187,.18);color:#8fdbbb;font-family:inherit;font-size:11px;line-height:1;border:1px solid rgba(143,219,187,.22)}\
  .pmw-cmd-trigger .pmw-cmd-trigger__txt{opacity:.9}\
  @media (max-width:640px){.pmw-cmd-trigger .pmw-cmd-trigger__txt{display:none}.pmw-cmd-trigger{padding:11px}}\
  .pmw-cmd-overlay{position:fixed;inset:0;z-index:1000;display:none;align-items:flex-start;justify-content:center;\
    padding:12vh 20px 20px;background:rgba(4,12,15,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}\
  .pmw-cmd-overlay.is-open{display:flex}\
  .pmw-cmd-panel{width:min(620px,100%);max-height:70vh;display:flex;flex-direction:column;overflow:hidden;\
    border-radius:16px;background:#0e2a31;border:1px solid rgba(143,219,187,.2);\
    box-shadow:0 30px 80px rgba(4,12,15,.6);color:#f3f7f7;\
    transform:translateY(-10px) scale(.985);opacity:0;transition:transform .2s cubic-bezier(.2,.7,.3,1),opacity .2s ease}\
  .pmw-cmd-overlay.is-open .pmw-cmd-panel{transform:none;opacity:1}\
  .pmw-cmd-search{display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid rgba(255,255,255,.08)}\
  .pmw-cmd-search svg{flex:0 0 auto;opacity:.6}\
  .pmw-cmd-search input{flex:1;background:transparent;border:0;outline:0;color:#f3f7f7;\
    font-family:'Inter',system-ui,sans-serif;font-size:16px;letter-spacing:.01em}\
  .pmw-cmd-search input::placeholder{color:rgba(243,247,247,.42)}\
  .pmw-cmd-esc{font-family:'DM Mono',monospace;font-size:11px;color:rgba(243,247,247,.5);\
    border:1px solid rgba(255,255,255,.14);border-radius:5px;padding:3px 7px}\
  .pmw-cmd-list{list-style:none;margin:0;padding:8px;overflow-y:auto;overscroll-behavior:contain}\
  .pmw-cmd-group{padding:12px 10px 4px;font-family:'DM Mono',monospace;font-size:10.5px;\
    text-transform:uppercase;letter-spacing:.14em;color:rgba(143,219,187,.7)}\
  .pmw-cmd-item{display:flex;align-items:center;gap:13px;padding:10px 12px;border-radius:10px;cursor:pointer}\
  .pmw-cmd-item[aria-selected='true']{background:rgba(143,219,187,.14)}\
  .pmw-cmd-item .pmw-ic{flex:0 0 auto;width:34px;height:34px;border-radius:8px;display:flex;align-items:center;\
    justify-content:center;background:rgba(255,255,255,.06);overflow:hidden;font-size:15px}\
  .pmw-cmd-item .pmw-ic img{width:100%;height:100%;object-fit:cover}\
  .pmw-cmd-item .pmw-tx{min-width:0;flex:1}\
  .pmw-cmd-item .pmw-tt{font-family:'Inter',system-ui,sans-serif;font-size:14.5px;white-space:nowrap;\
    overflow:hidden;text-overflow:ellipsis}\
  .pmw-cmd-item .pmw-tt b{color:#8fdbbb;font-weight:600}\
  .pmw-cmd-item .pmw-sub{font-size:12px;color:rgba(243,247,247,.5);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
  .pmw-cmd-item .pmw-go{flex:0 0 auto;font-family:'DM Mono',monospace;font-size:11px;color:rgba(243,247,247,.35);opacity:0}\
  .pmw-cmd-item[aria-selected='true'] .pmw-go{opacity:1}\
  .pmw-cmd-empty{padding:26px 14px;text-align:center;color:rgba(243,247,247,.5);\
    font-family:'Inter',system-ui,sans-serif;font-size:14px}\
  @media (prefers-reduced-motion:reduce){.pmw-cmd-panel,.pmw-cmd-trigger{transition:none}}\
  ";
  var style = document.createElement("style");
  style.setAttribute("data-pmw", "command-palette");
  style.textContent = css;
  document.head.appendChild(style);

  /* ---------- build the searchable index from the live DOM ---------- */
  function buildIndex() {
    var items = [];
    var seen = {};

    function push(item) {
      var key = item.group + "|" + item.title;
      if (seen[key]) return;
      seen[key] = 1;
      items.push(item);
    }

    // Quick actions
    push({ group: "Actions", title: "Upload a memory", sub: "Submit your footage", icon: "↑", href: "#forms" });
    push({ group: "Actions", title: "Play the 3D demo", sub: "game.preservemy.world", icon: "▶", url: "https://game.preservemy.world" });
    push({ group: "Actions", title: "Submit a memory", sub: "A place worth remembering", icon: "✦", href: "#submit" });

    // Sections - derived from primary nav so it tracks whatever the site ships
    var navLinks = document.querySelectorAll(".site-nav .nav-links a[href^='#'], .site-nav .nav-actions a[href^='#']");
    navLinks.forEach(function (a) {
      var id = a.getAttribute("href").slice(1);
      var target = id && document.getElementById(id);
      if (!target) return;
      var label = (a.textContent || "").trim();
      var head = target.querySelector("h2, h1, .eyebrow");
      push({
        group: "Sections",
        title: label || (head ? head.textContent.trim() : id),
        sub: head ? head.textContent.trim() : "",
        icon: "◈",
        href: "#" + id,
      });
    });

    // Worlds - each captured place becomes a jump target
    var cards = document.querySelectorAll("#worlds .world-card");
    cards.forEach(function (fig, i) {
      var name = fig.querySelector("figcaption strong");
      var place = fig.querySelector("figcaption span");
      var img = fig.querySelector("img");
      if (!name) return;
      push({
        group: "Worlds",
        title: name.textContent.trim(),
        sub: place ? place.textContent.trim() : "Captured world",
        thumb: img ? img.getAttribute("src") : null,
        icon: "◉",
        href: "#worlds",
        worldIndex: i,
      });
    });

    // Follow links
    var socials = document.querySelectorAll(".footer-social a[href^='http']");
    socials.forEach(function (a) {
      var label = (a.textContent || "").trim();
      if (!label) return;
      push({ group: "Follow", title: label, sub: "Open in a new tab", icon: "→", url: a.href });
    });

    return items;
  }

  /* ---------- fuzzy subsequence scorer ---------- */
  function score(query, text) {
    if (!query) return 0.0001; // keep original order when idle
    query = query.toLowerCase();
    text = text.toLowerCase();
    var qi = 0, ti = 0, s = 0, streak = 0, firstHit = -1;
    while (qi < query.length && ti < text.length) {
      if (query[qi] === text[ti]) {
        if (firstHit < 0) firstHit = ti;
        streak += 1;
        s += 1 + streak * 0.6 + (ti === 0 || text[ti - 1] === " " ? 2 : 0);
        qi += 1;
      } else {
        streak = 0;
      }
      ti += 1;
    }
    if (qi < query.length) return -1; // not all chars matched
    return s - firstHit * 0.05;
  }

  function highlight(text, query) {
    if (!query) return escapeHtml(text);
    var q = query.toLowerCase();
    var out = "";
    var qi = 0;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (qi < q.length && ch.toLowerCase() === q[qi]) {
        out += "<b>" + escapeHtml(ch) + "</b>";
        qi += 1;
      } else {
        out += escapeHtml(ch);
      }
    }
    return out;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /* ---------- DOM ---------- */
  var overlay = document.createElement("div");
  overlay.className = "pmw-cmd-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Quick navigation");
  overlay.innerHTML =
    '<div class="pmw-cmd-panel">' +
    '<div class="pmw-cmd-search">' +
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>' +
    '<input type="text" placeholder="Jump to a world, section, or action…" aria-label="Search" autocomplete="off" spellcheck="false" />' +
    '<span class="pmw-cmd-esc">esc</span>' +
    "</div>" +
    '<ul class="pmw-cmd-list" role="listbox" aria-label="Results"></ul>' +
    "</div>";
  document.body.appendChild(overlay);

  var input = overlay.querySelector("input");
  var list = overlay.querySelector(".pmw-cmd-list");
  var panel = overlay.querySelector(".pmw-cmd-panel");

  var trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "pmw-cmd-trigger";
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-label", "Open quick navigation");
  var isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  trigger.innerHTML =
    '<span class="pmw-cmd-trigger__txt">Quick nav</span>' +
    "<kbd>" + (isMac ? "⌘" : "Ctrl") + "K</kbd>";
  document.body.appendChild(trigger);
  requestAnimationFrame(function () {
    setTimeout(function () { trigger.classList.add("is-in"); }, 900);
  });

  var index = [];
  var results = [];
  var selected = 0;
  var isOpen = false;

  function render() {
    var q = input.value.trim();
    results = index
      .map(function (it) { return { it: it, sc: score(q, it.title + " " + (it.sub || "")) }; })
      .filter(function (r) { return r.sc >= 0; })
      .sort(function (a, b) { return b.sc - a.sc; })
      .map(function (r) { return r.it; });

    if (!q) {
      results = index.slice();
    }

    selected = 0;
    list.innerHTML = "";

    if (!results.length) {
      var empty = document.createElement("li");
      empty.className = "pmw-cmd-empty";
      empty.textContent = "Nothing matches “" + q + "”";
      list.appendChild(empty);
      return;
    }

    var lastGroup = null;
    results.forEach(function (it, i) {
      if (it.group !== lastGroup) {
        lastGroup = it.group;
        var gl = document.createElement("li");
        gl.className = "pmw-cmd-group";
        gl.textContent = it.group;
        gl.setAttribute("aria-hidden", "true");
        list.appendChild(gl);
      }
      var li = document.createElement("li");
      li.className = "pmw-cmd-item";
      li.setAttribute("role", "option");
      li.dataset.idx = String(i);
      var icHtml = it.thumb
        ? '<span class="pmw-ic"><img src="' + escapeHtml(it.thumb) + '" alt="" loading="lazy"/></span>'
        : '<span class="pmw-ic">' + escapeHtml(it.icon || "◈") + "</span>";
      li.innerHTML =
        icHtml +
        '<span class="pmw-tx">' +
        '<span class="pmw-tt">' + highlight(it.title, q) + "</span>" +
        (it.sub ? '<span class="pmw-sub">' + escapeHtml(it.sub) + "</span>" : "") +
        "</span>" +
        '<span class="pmw-go">↵</span>';
      li.addEventListener("mousemove", function () { setSelected(i); });
      li.addEventListener("click", function () { choose(i); });
      list.appendChild(li);
    });
    updateSelection();
  }

  function itemEls() {
    return Array.prototype.slice.call(list.querySelectorAll(".pmw-cmd-item"));
  }

  function setSelected(i) {
    selected = i;
    updateSelection();
  }

  function updateSelection() {
    var els = itemEls();
    els.forEach(function (el) {
      var i = Number(el.dataset.idx);
      var on = i === selected;
      el.setAttribute("aria-selected", on ? "true" : "false");
      if (on) el.scrollIntoView({ block: "nearest" });
    });
  }

  function move(delta) {
    if (!results.length) return;
    selected = (selected + delta + results.length) % results.length;
    updateSelection();
  }

  function choose(i) {
    var it = results[i];
    if (!it) return;
    close();
    if (it.url) {
      window.open(it.url, "_blank", "noopener");
      return;
    }
    if (it.href) {
      var id = it.href.slice(1);
      var target = document.getElementById(id);
      if (target) {
        // Update the hash without a jarring native jump, then smooth-scroll.
        try { history.pushState(null, "", it.href); } catch (e) {}
        target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      }
    }
  }

  function open() {
    if (isOpen) return;
    index = buildIndex();
    isOpen = true;
    overlay.classList.add("is-open");
    input.value = "";
    render();
    document.documentElement.style.setProperty("overflow", "hidden");
    setTimeout(function () { input.focus(); }, 20);
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    overlay.classList.remove("is-open");
    document.documentElement.style.removeProperty("overflow");
    input.blur();
  }

  /* ---------- events ---------- */
  trigger.addEventListener("click", open);
  input.addEventListener("input", render);
  overlay.addEventListener("mousedown", function (e) {
    if (e.target === overlay) close();
  });

  input.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter") { e.preventDefault(); choose(selected); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
  });

  document.addEventListener("keydown", function (e) {
    var mod = e.metaKey || e.ctrlKey;
    if (mod && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      isOpen ? close() : open();
      return;
    }
    if (isOpen) return;
    // "/" opens too, but never while the visitor is typing in a field.
    if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || "")) && !e.target.isContentEditable) {
      e.preventDefault();
      open();
    }
  });
})();
