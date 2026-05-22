/* Capture Studio — tailored capture planner for preservemy.world
 *
 * Turning a place into a walkable 3D world lives or dies on the capture.
 * This tool takes what someone is trying to keep and hands back a concrete,
 * checkable filming plan: how many passes, at what height, how slowly, and
 * the mistakes that quietly ruin a reconstruction. No dependencies, no build.
 */
(function () {
  "use strict";

  var mount = document.getElementById("studioMount");
  if (!mount) return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- Capture knowledge base ------------------------------------------
   * Each place type carries a strategy plus the passes that give a splat
   * enough overlapping angles to solve. Specs adapt to scope + light below. */
  var TYPES = [
    {
      id: "room",
      icon: "🛋️", // couch
      name: "A room or interior",
      env: "Indoor",
      strategy: "Interiors are unforgiving — walls repeat and corners hide. Hug the perimeter, keep every wall in frame as you go, and cross the middle so opposite sides get seen from each other.",
      passes: [
        ["Perimeter loop", "Walk the walls at chest height, phone pointed slightly inward. Keep the wall you're passing filling most of the frame."],
        ["Corner sweeps", "Pause at each corner and pan slowly across it — corners are where reconstructions tear."],
        ["Low pass", "A second loop at knee height to catch furniture undersides and floor detail."],
        ["Cross the room", "Two diagonal walk-throughs so far walls are captured from close and from across."],
        ["Doorways & thresholds", "Step through each opening and back, filming both sides of the frame."]
      ],
      doTips: [
        "Open blinds and turn on every light — even coverage beats bright spots.",
        "Keep both feet moving slowly; a room tempts you to stand and spin.",
        "Get within an arm's reach of textured surfaces — rugs, bookshelves, brick."
      ],
      avoidTips: [
        "Mirrors and glass tabletops — they invent geometry that isn't there.",
        "Filming a whole wall from the far side of the room only.",
        "Standing in one spot and rotating — parallax is what a splat needs."
      ]
    },
    {
      id: "facade",
      icon: "🏛️", // building
      name: "A building or facade",
      env: "Outdoor",
      strategy: "Facades reward patience with height. Make horizontal passes at rising eye-levels and step back for the whole face, so fine trim and full form both solve.",
      passes: [
        ["Ground traverse", "Walk the full width at eye level, phone level, staying a consistent distance from the wall."],
        ["Raised traverse", "Same width with the phone held high overhead, angled up toward cornices and roofline."],
        ["Step-back pass", "Retreat until the whole facade fits, then traverse again for the overall shape."],
        ["Detail approach", "Slow, close passes over doorways, carvings, signage and weathering."],
        ["Corner wrap", "Round each visible corner so the facade connects to its return walls."]
      ],
      doTips: [
        "Keep the sun behind you or to the side for even, shadow-stable light.",
        "Overlap each pass with the last by more than half its width.",
        "Include a strip of ground and sky so the model knows where the wall ends."
      ],
      avoidTips: [
        "Shooting into direct sun or across harsh midday shadow lines.",
        "Zooming — walk closer instead; optical zoom breaks the geometry.",
        "Skipping the high pass; roofs collapse without upward angles."
      ]
    },
    {
      id: "garden",
      icon: "🌿", // herb
      name: "A garden or courtyard",
      env: "Outdoor",
      strategy: "Foliage moves and repeats, so lean on the fixed things — paths, walls, statues, benches. Orbit the anchors and let the greenery fill in around them.",
      passes: [
        ["Anchor orbits", "Circle every solid feature — fountain, statue, gate — a full lap at chest height."],
        ["Path walk", "Follow each path end to end, filming the edges and what borders them."],
        ["Boundary loop", "Trace the enclosing walls or hedges so the space has a defined edge."],
        ["Low texture pass", "Knee-height sweeps over paving, steps and planting beds.",],
        ["Overview", "A raised walk-through with the phone high for canopy and layout."]
      ],
      doTips: [
        "Shoot on a still day — wind-blown leaves confuse the solver.",
        "Give solid landmarks extra laps; they anchor the whole scene.",
        "Aim for flat, even light — overcast is ideal for gardens."
      ],
      avoidTips: [
        "Capturing only leaves and grass with no hard structure in frame.",
        "Windy conditions or fountains at full spray.",
        "Long gaps between passes as the light shifts."
      ]
    },
    {
      id: "street",
      icon: "🛣️", // road
      name: "A street or lane",
      env: "Outdoor",
      strategy: "Streets are long corridors. Walk both sides down and back, keep the phone across the way you're filming, and close the loop so the two walls of buildings meet.",
      passes: [
        ["Down one side", "Walk the length filming the opposite frontages across the street."],
        ["Back the other side", "Return along the far pavement, filming the frontages you just walked past."],
        ["Centre sweep", "Walk the middle once, panning side to side for the full corridor."],
        ["Ground & features", "Close passes on the road surface, kerbs, doorways, and any signage."],
        ["Ends & junctions", "Capture where the lane opens or turns so it doesn't float in space."]
      ],
      doTips: [
        "Pick a quiet hour — parked cars are fine, moving traffic is not.",
        "Keep a steady walking pace; count one step per second.",
        "Overlap the down and back passes generously at each end."
      ],
      avoidTips: [
        "Filming during footfall or traffic — moving objects tear the model.",
        "Rushing; fast panning smears every frame.",
        "Leaving one side of the street uncaptured."
      ]
    },
    {
      id: "landscape",
      icon: "🏞️", // national park
      name: "A landscape or path",
      env: "Outdoor",
      strategy: "Wide scenes need parallax you make by moving, not by turning. Walk a genuine path through it, keep foreground objects in frame, and vary your height and line.",
      passes: [
        ["Walk the line", "Move along the trail or ridge, keeping something near you in frame for depth."],
        ["Offset return", "Come back on a parallel line a few steps over, filming the same view from a new angle."],
        ["Foreground anchors", "Orbit rocks, trees or markers close to you — they give the scene scale."],
        ["High & low", "Alternate holding the phone high and low as you walk to add vertical parallax."],
        ["Vantage sweeps", "At each viewpoint, a slow steady pan — never a fast whip."]
      ],
      doTips: [
        "Always keep a near object in frame; pure distant vistas won't solve.",
        "Move in real straight lines to build honest parallax.",
        "Shoot in stable light — golden hour or even overcast, not patchy sun."
      ],
      avoidTips: [
        "Standing still and panning across an empty distant view.",
        "Waiting so long the shadows and light change mid-capture.",
        "Digital zoom to reach far features — walk toward them."
      ]
    },
    {
      id: "object",
      icon: "🏺", // amphora
      name: "An object or monument",
      env: "Either",
      strategy: "A single object is the friendliest capture — orbit it completely at three heights and it will solve crisply. The whole trick is closing every circle.",
      passes: [
        ["Eye-level orbit", "A full, unbroken circle at the object's mid-height, keeping it centred."],
        ["Low orbit", "A second complete circle from below, angled up."],
        ["High orbit", "A third circle from above, angled down onto the top."],
        ["Detail ring", "A slow close orbit over inscriptions, joins and worn areas."],
        ["Top & base", "Steady passes over the very top and where it meets the ground."]
      ],
      doTips: [
        "Complete every circle — a broken orbit leaves a hole in the model.",
        "Keep the object the same size in frame as you go round.",
        "Set exposure and focus once, then don't let them drift."
      ],
      avoidTips: [
        "Reflective or glass objects without a light dusting to matte them.",
        "Half-circles; the far side simply won't exist.",
        "Casting your own shadow across the object as you orbit."
      ]
    }
  ];

  var SCOPE = {
    quick: { label: "Quick pass", clip: "3–5 min", mult: 0.6, passLabel: "the first 3 passes" },
    thorough: { label: "Thorough", clip: "10–15 min", mult: 1, passLabel: "every pass" }
  };
  var LIGHT = {
    bright: {
      label: "Bright / daylight",
      pace: "1 step / sec",
      note: "Lock exposure and focus before you start so bright sky doesn't make the phone hunt.",
      extraAvoid: null
    },
    dim: {
      label: "Dim / indoor",
      pace: "½ step / sec",
      note: "Low light means slow down and add lamps — motion blur is a reconstruction killer indoors.",
      extraAvoid: "Any handheld speed; in dim light every quick move smears the frame."
    }
  };

  var state = {
    type: "object",
    scope: "thorough",
    light: "bright",
    checked: load()
  };

  function load() {
    try { return JSON.parse(localStorage.getItem("pmw-studio-checks") || "{}") || {}; }
    catch (e) { return {}; }
  }
  function save() {
    try { localStorage.setItem("pmw-studio-checks", JSON.stringify(state.checked)); } catch (e) {}
  }

  function typeById(id) {
    for (var i = 0; i < TYPES.length; i++) if (TYPES[i].id === id) return TYPES[i];
    return TYPES[0];
  }

  /* Build the ordered checklist items for the current selection. */
  function buildItems(t) {
    var scope = SCOPE[state.scope];
    var passCount = Math.max(3, Math.round(t.passes.length * scope.mult));
    var items = [];
    items.push({ key: "prep-frame", title: "Frame it up", note: "Landscape orientation, 4K if you have it, 30fps." });
    items.push({ key: "prep-lock", title: "Lock exposure & focus", note: LIGHT[state.light].note });
    var chosen = t.passes.slice(0, passCount);
    for (var i = 0; i < chosen.length; i++) {
      items.push({ key: "pass-" + i, title: chosen[i][0], note: chosen[i][1] });
    }
    items.push({ key: "wrap-loops", title: "Close every loop", note: "End each pass where it began so angles overlap all the way round." });
    items.push({ key: "wrap-review", title: "Review before you leave", note: "Scrub the footage on the spot — a reshoot now beats a hole later." });
    return { items: items, passCount: passCount };
  }

  function keyFor(item) { return state.type + "|" + state.scope + "|" + item.key; }

  function render() {
    var t = typeById(state.type);
    var scope = SCOPE[state.scope];
    var light = LIGHT[state.light];
    var built = buildItems(t);
    var items = built.items;

    var doneCount = 0;
    for (var i = 0; i < items.length; i++) if (state.checked[keyFor(items[i])]) doneCount++;
    var pct = items.length ? Math.round((doneCount / items.length) * 100) : 0;

    var avoid = t.avoidTips.slice();
    if (light.extraAvoid) avoid = avoid.concat([light.extraAvoid]);

    var html = "";

    /* Picker */
    html += '<div class="studio-picker">';
    html += '<div class="studio-field"><span class="studio-label">1 &middot; What are you keeping?</span><div class="studio-types">';
    for (var a = 0; a < TYPES.length; a++) {
      var ty = TYPES[a];
      html += '<button type="button" class="studio-type" data-type="' + ty.id + '" aria-pressed="' + (ty.id === state.type) + '">' +
        '<span class="studio-type__icon" aria-hidden="true">' + ty.icon + '</span>' +
        '<span class="studio-type__name">' + ty.name + '</span>' +
        '<span class="studio-type__env">' + ty.env + '</span></button>';
    }
    html += '</div></div>';

    html += '<div class="studio-field"><span class="studio-label">2 &middot; How much time?</span><div class="studio-toggle-row">';
    html += toggle("scope", "quick", SCOPE.quick.label + " · " + SCOPE.quick.clip);
    html += toggle("scope", "thorough", SCOPE.thorough.label + " · " + SCOPE.thorough.clip);
    html += '</div></div>';

    html += '<div class="studio-field"><span class="studio-label">3 &middot; Light on the day</span><div class="studio-toggle-row">';
    html += toggle("light", "bright", LIGHT.bright.label);
    html += toggle("light", "dim", LIGHT.dim.label);
    html += '</div></div>';
    html += '</div>';

    /* Plan */
    html += '<div class="studio-plan">';
    html += '<div class="studio-plan__head">' +
      '<p class="studio-plan__kicker">Your capture plan</p>' +
      '<h3 class="studio-plan__title">' + t.name + '</h3>' +
      '<p class="studio-plan__strategy">' + t.strategy + '</p></div>';

    html += '<dl class="studio-specs">' +
      spec("Session", scope.clip, "handheld") +
      spec("Passes", String(built.passCount), "overlapping") +
      spec("Overlap", "70%+", "frame to frame") +
      spec("Pace", light.pace, "smooth &amp; steady") +
      '</dl>';

    html += '<div class="studio-body">';
    html += '<div class="studio-shots"><p class="studio-subhead">Shot checklist</p><ul class="studio-check">';
    for (var c = 0; c < items.length; c++) {
      var it = items[c];
      var k = keyFor(it);
      var on = !!state.checked[k];
      html += '<li><label><input type="checkbox" data-check="' + escapeAttr(k) + '"' + (on ? " checked" : "") + '>' +
        '<span class="box" aria-hidden="true"></span>' +
        '<span class="txt"><b>' + it.title + '</b><span>' + it.note + '</span></span></label></li>';
    }
    html += '</ul></div>';

    html += '<div class="studio-tips">';
    html += '<div class="studio-tip-block"><p class="studio-subhead">Do</p><ul class="studio-tip-list">';
    for (var d = 0; d < t.doTips.length; d++) html += '<li>' + t.doTips[d] + '</li>';
    html += '</ul></div>';
    html += '<div class="studio-tip-block is-avoid"><p class="studio-subhead">Avoid</p><ul class="studio-tip-list">';
    for (var e = 0; e < avoid.length; e++) html += '<li>' + avoid[e] + '</li>';
    html += '</ul></div>';
    html += '</div>';
    html += '</div>';

    html += '<div class="studio-foot">' +
      '<div class="studio-progress"><div class="studio-progress__meta"><span>Ready to capture</span><span data-progress-label>' + doneCount + ' / ' + items.length + '</span></div>' +
      '<div class="studio-progress__track"><div class="studio-progress__fill" style="width:' + pct + '%"></div></div></div>' +
      '<div class="studio-actions">' +
      '<button type="button" class="studio-btn" data-copy>Copy plan</button>' +
      '<a class="studio-btn is-primary" href="#submit" data-submit>Submit this place</a>' +
      '</div></div>';

    html += '</div>';

    mount.innerHTML = html;
    wire(t, items, built.passCount);
  }

  function toggle(group, value, label) {
    return '<button type="button" class="studio-toggle" data-toggle="' + group + '" data-value="' + value + '" aria-pressed="' + (state[group] === value) + '">' + label + '</button>';
  }
  function spec(dt, dd, small) {
    return '<div class="studio-spec"><dt>' + dt + '</dt><dd>' + dd + '<small>' + small + '</small></dd></div>';
  }
  function escapeAttr(s) { return String(s).replace(/"/g, "&quot;"); }

  function wire(t, items, passCount) {
    mount.querySelectorAll(".studio-type").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (state.type === btn.dataset.type) return;
        state.type = btn.dataset.type;
        render();
      });
    });
    mount.querySelectorAll("[data-toggle]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var g = btn.dataset.toggle;
        if (state[g] === btn.dataset.value) return;
        state[g] = btn.dataset.value;
        render();
      });
    });
    mount.querySelectorAll("[data-check]").forEach(function (box) {
      box.addEventListener("change", function () {
        var k = box.getAttribute("data-check");
        if (box.checked) state.checked[k] = 1; else delete state.checked[k];
        save();
        updateProgress(items);
      });
    });
    var copyBtn = mount.querySelector("[data-copy]");
    if (copyBtn) copyBtn.addEventListener("click", function () { copyPlan(t, items, passCount, copyBtn); });
  }

  function updateProgress(items) {
    var done = 0;
    for (var i = 0; i < items.length; i++) if (state.checked[keyFor(items[i])]) done++;
    var pct = items.length ? Math.round((done / items.length) * 100) : 0;
    var fill = mount.querySelector(".studio-progress__fill");
    var lbl = mount.querySelector("[data-progress-label]");
    if (fill) fill.style.width = pct + "%";
    if (lbl) lbl.textContent = done + " / " + items.length;
  }

  function copyPlan(t, items, passCount, btn) {
    var scope = SCOPE[state.scope];
    var light = LIGHT[state.light];
    var lines = [];
    lines.push("CAPTURE PLAN — " + t.name + " (preservemy.world)");
    lines.push("");
    lines.push("Strategy: " + t.strategy);
    lines.push("");
    lines.push("Session: " + scope.clip + "  |  Passes: " + passCount + "  |  Overlap: 70%+  |  Pace: " + light.pace);
    lines.push("");
    lines.push("SHOT CHECKLIST");
    for (var i = 0; i < items.length; i++) {
      lines.push("  [ ] " + items[i].title + " — " + items[i].note);
    }
    lines.push("");
    lines.push("DO");
    for (var d = 0; d < t.doTips.length; d++) lines.push("  + " + t.doTips[d]);
    lines.push("");
    lines.push("AVOID");
    var avoid = t.avoidTips.slice();
    if (light.extraAvoid) avoid.push(light.extraAvoid);
    for (var a = 0; a < avoid.length; a++) lines.push("  - " + avoid[a]);
    lines.push("");
    lines.push("Then submit your place at preservemy.world");
    var text = lines.join("\n");

    var done = function () {
      btn.classList.add("is-copied");
      var prev = btn.textContent;
      btn.textContent = "Copied ✓";
      setTimeout(function () { btn.classList.remove("is-copied"); btn.textContent = prev; }, 1800);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
    } else {
      fallbackCopy(text, done);
    }
  }
  function fallbackCopy(text, done) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); done(); } catch (e) {}
    document.body.removeChild(ta);
  }

  var fb = document.querySelector("#studio .studio-fallback");
  if (fb) fb.remove();
  render();
})();
