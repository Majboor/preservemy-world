/* =====================================================================
   preservemy.world - UI polish layer (ui-enhance.js)
   Additive, dependency-free. Adds scroll-reveal choreography to content
   sections. Pure progressive enhancement: if anything here fails, the
   page stays fully visible and interactive.
   ===================================================================== */
(function () {
  "use strict";

  var reduceMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Groups of elements to stagger into view as their section scrolls up.
  var groups = [
    { sel: "#worlds .world-card", stagger: 55, max: 10 },
    { sel: "#capabilities .cap", stagger: 70, max: 8 },
    { sel: "#how .step", stagger: 70, max: 8 },
    { sel: "#stories .story", stagger: 90, max: 6 },
    { sel: "#latest .latest-copy > *", stagger: 60, max: 8 },
    { sel: ".forms .section-head > *", stagger: 60, max: 4 },
    { sel: ".cta-inner > *", stagger: 90, max: 4 }
  ];

  var targets = [];

  groups.forEach(function (g) {
    var nodes = document.querySelectorAll(g.sel);
    for (var i = 0; i < nodes.length && i < g.max; i++) {
      var el = nodes[i];
      el.setAttribute("data-ui-reveal", "");
      el.style.setProperty("--ui-reveal-delay", i * g.stagger + "ms");
      targets.push(el);
    }
  });

  if (!targets.length) return;

  // Enable the hidden pre-reveal state only now that JS is running.
  document.documentElement.classList.add("ui-reveal-ready");

  function revealAll() {
    targets.forEach(function (el) {
      el.classList.add("is-inview");
    });
  }

  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealAll();
    return;
  }

  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-inview");
          io.unobserve(entry.target);
        }
      });
    },
    { root: null, rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
  );

  targets.forEach(function (el) {
    io.observe(el);
  });

  // Safety net: guarantee everything is visible shortly after load even if
  // the observer never fires for some element (e.g. odd layout / print).
  window.setTimeout(function () {
    targets.forEach(function (el) {
      if (!el.classList.contains("is-inview")) {
        var r = el.getBoundingClientRect();
        if (r.top < window.innerHeight * 1.2) el.classList.add("is-inview");
      }
    });
  }, 2600);
})();
