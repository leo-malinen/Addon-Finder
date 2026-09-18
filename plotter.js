/* Addon Forge — the origin plotter.
 *
 * demoweb's search page, built to its spec and wearing this site's own style.
 * Pick the platforms you actually use; a crosshair travels to the centroid of
 * that selection, drawing a construction line to each mark; the categories
 * nearest the crosshair light up and become a REAL query against catalog.js,
 * not a picture of one.
 *
 * The SVG field is the visual. The control surface is a set of real buttons
 * that are always present, so the page is keyboard operable and works the same
 * on touch and under reduced motion, where the travel is simply not animated.
 */
(function () {
  "use strict";

  var S = 6;                       // taxonomy space (0-100) -> svg space (0-600)
  var NS = "http://www.w3.org/2000/svg";
  var reduced = matchMedia("(prefers-reduced-motion: reduce)");
  var ENG = ENGINES.map(function (e) { return e.id; });
  var engName = {}, engShort = {};
  ENGINES.forEach(function (e) { engName[e.id] = e.name; engShort[e.id] = e.short; });

  var field = document.getElementById("field");
  if (!field) return;

  /* ------------------------------------------------ categories from data --- */
  /* A category's coordinate is the centroid of the platforms whose addons
     actually carry that tag, weighted by how many carry it. Nothing is placed
     by hand, so the field always tells the truth about the index. */

  function buildCategories() {
    var t = {};
    INDEX.items.forEach(function (it) {
      it.tags.forEach(function (g) {
        if (!t[g]) t[g] = { tag: g, n: 0, e: {} };
        t[g].n++;
        t[g].e[it.engine] = (t[g].e[it.engine] || 0) + 1;
      });
    });

    var list = Object.keys(t)
      .map(function (k) { return t[k]; })
      .filter(function (c) { return c.n >= TAXONOMY.categories.minCount; });

    list.forEach(function (c) {
      var pin = TAXONOMY.categories.pin[c.tag];
      if (pin) { c.x = pin.x; c.y = pin.y; c.pinned = true; return; }
      var sx = 0, sy = 0, w = 0;
      Object.keys(c.e).forEach(function (e) {
        var p = TAXONOMY.platforms[e];
        if (!p) return;
        sx += p.x * c.e[e]; sy += p.y * c.e[e]; w += c.e[e];
      });
      c.x = w ? sx / w : 50;
      c.y = w ? sy / w : 50;
    });

    /* Categories sharing a platform mix land on the same point, so fan each
       group around its centroid. Ordered by name, so labels never jump. */
    var groups = {};
    list.forEach(function (c) {
      var k = Math.round(c.x) + ":" + Math.round(c.y);
      (groups[k] = groups[k] || []).push(c);
    });
    Object.keys(groups).forEach(function (k) {
      var g = groups[k].sort(function (a, b) { return a.tag < b.tag ? -1 : 1; });
      if (g.length === 1) return;
      var per = TAXONOMY.categories.spread.perRing;
      g.forEach(function (c, i) {
        var ring = Math.floor(i / per) + 1;
        var idx = i % per;
        var count = Math.min(per, g.length - (ring - 1) * per);
        var a = (idx / count) * Math.PI * 2 - Math.PI / 2;
        var r = TAXONOMY.categories.spread.radius * ring;
        var dx = Math.cos(a) * r;
        c.x += dx;
        c.y += Math.sin(a) * r * TAXONOMY.categories.spread.squash;
        // Labels on the left of a fan read leftwards, so the text runs away
        // from the group instead of back across it and over the platform mark.
        c.flip = dx < -0.5;
      });
    });

    /* The fan only separates labels that share a centroid. Two labels from
       different groups can still land on each other, so relax the whole set:
       nudge any overlapping pair apart along y until nothing collides. Runs on
       estimated boxes rather than measured ones because it happens before the
       text exists, and it is deterministic, so labels never move between
       loads. */
    var CH = 1.05, LH = 2.7;                      // char width, line height, in field units
    for (var pass = 0; pass < 24; pass++) {
      var moved = false;
      for (var i = 0; i < list.length; i++) {
        for (var j = i + 1; j < list.length; j++) {
          var a = list[i], b2 = list[j];
          var aw = a.tag.length * CH, bw = b2.tag.length * CH;
          var al = a.flip ? a.x - aw - 1.4 : a.x + 1.4, ar = al + aw;
          var bl = b2.flip ? b2.x - bw - 1.4 : b2.x + 1.4, br = bl + bw;
          if (ar < bl || br < al) continue;        // no horizontal overlap
          var dy = b2.y - a.y;
          if (Math.abs(dy) >= LH) continue;        // already clear
          var push = (LH - Math.abs(dy)) / 2 + 0.05;
          var dir = dy === 0 ? (a.tag < b2.tag ? -1 : 1) : (dy > 0 ? 1 : -1);
          a.y -= push * dir; b2.y += push * dir;
          moved = true;
        }
      }
      if (!moved) break;
    }

    return list.sort(function (a, b) { return b.n - a.n; });
  }

  var CATS = buildCategories();

  /* ------------------------------------------------------------- the field -- */

  function el(name, attrs) {
    var n = document.createElementNS(NS, name);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }

  // the visible window
  var VB = TAXONOMY.view;
  field.setAttribute("viewBox", VB.x + " " + VB.y + " " + VB.w + " " + VB.h);

  // ruled ground, drawn across the whole window rather than the platform box,
  // so the margin the labels need does not read as the field running out
  var gGrid = el("g", { class: "fld__grid" });
  var sub = TAXONOMY.grid.sub * S, maj = TAXONOMY.grid.step * S;
  for (var x = Math.ceil(VB.x / sub) * sub; x <= VB.x + VB.w; x += sub) {
    gGrid.appendChild(el("line", { x1: x, y1: VB.y, x2: x, y2: VB.y + VB.h,
      class: x % maj === 0 ? "fld__maj" : "fld__min" }));
  }
  for (var y = Math.ceil(VB.y / sub) * sub; y <= VB.y + VB.h; y += sub) {
    gGrid.appendChild(el("line", { x1: VB.x, y1: y, x2: VB.x + VB.w, y2: y,
      class: y % maj === 0 ? "fld__maj" : "fld__min" }));
  }
  field.appendChild(gGrid);

  var gLines = el("g", { class: "fld__cons" });  field.appendChild(gLines);
  var gCats  = el("g", { class: "fld__cats" });  field.appendChild(gCats);
  var gMarks = el("g", { class: "fld__marks" }); field.appendChild(gMarks);

  // categories
  CATS.forEach(function (c) {
    var g = el("g", { class: "cat", "data-tag": c.tag });
    g.appendChild(el("circle", { cx: c.x * S, cy: c.y * S, r: 3.2, class: "cat__d" }));
    var tx = el("text", {
      x: c.x * S + (c.flip ? -8 : 8), y: c.y * S + 4,
      class: "cat__t" + (c.flip ? " cat__t--e" : "")
    });
    tx.textContent = c.tag;
    g.appendChild(tx);
    gCats.appendChild(g);
    c.node = g;
  });

  // platform marks
  ENG.forEach(function (e) {
    var p = TAXONOMY.platforms[e];
    if (!p) return;
    var g = el("g", { class: "mark", "data-e": e });
    g.appendChild(el("circle", { cx: p.x * S, cy: p.y * S, r: 26, class: "mark__hit" }));
    g.appendChild(el("circle", { cx: p.x * S, cy: p.y * S, r: 11, class: "mark__o" }));
    g.appendChild(el("circle", { cx: p.x * S, cy: p.y * S, r: 4.5, class: "mark__i" }));
    var tx = el("text", { x: p.x * S, y: p.y * S - 22, class: "mark__t" });
    tx.textContent = engShort[e];
    g.appendChild(tx);
    gMarks.appendChild(g);
    g.addEventListener("click", function () { toggle(e); });
  });

  // crosshair
  var gCross = el("g", { class: "cross", opacity: 0 });
  gCross.appendChild(el("circle", { cx: 0, cy: 0, r: 15, class: "cross__r" }));
  gCross.appendChild(el("line", { x1: -26, y1: 0, x2: 26, y2: 0, class: "cross__l" }));
  gCross.appendChild(el("line", { x1: 0, y1: -26, x2: 0, y2: 26, class: "cross__l" }));
  field.appendChild(gCross);

  /* ------------------------------------------------------------- the state -- */

  var picked = [];
  var qInput = document.getElementById("s-q");
  var elCoord = document.querySelector("[data-coord]");
  var elRec = document.querySelector("[data-rec]");
  var elOut = document.querySelector("[data-out]");
  var elCount = document.querySelector("[data-count-out]");
  var elState = document.querySelector("[data-s-state]");

  function centroid() {
    if (!picked.length) return null;
    var x = 0, y = 0;
    picked.forEach(function (e) { x += TAXONOMY.platforms[e].x; y += TAXONOMY.platforms[e].y; });
    return { x: x / picked.length, y: y / picked.length };
  }

  function nearest(c) {
    if (!c) return [];
    // Only categories the selection can actually reach. Proximity alone would
    // recommend a tag that no selected platform carries, which reads as a
    // suggestion and returns nothing.
    var reachable = CATS.filter(function (k) {
      return !picked.length || picked.some(function (e) { return k.e[e]; });
    });
    return reachable.map(function (k) {
      var dx = k.x - c.x, dy = k.y - c.y;
      return { cat: k, d: Math.sqrt(dx * dx + dy * dy) };
    }).sort(function (a, b) { return a.d - b.d; })
      .slice(0, TAXONOMY.recommend)
      .map(function (r) { return r.cat; });
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch];
    });
  }

  function results(tags) {
    var q = (qInput && qInput.value || "").trim().toLowerCase();
    return INDEX.items.filter(function (it) {
      if (picked.length && picked.indexOf(it.engine) === -1) return false;
      if (tags.length && !it.tags.some(function (g) { return tags.indexOf(g) !== -1; })) return false;
      if (q) {
        var hay = (it.name + " " + it.engine + " " + it.licence + " " +
                   it.tags.join(" ") + " " + it.note).toLowerCase();
        if (!q.split(/\s+/).filter(Boolean).every(function (tok) { return hay.indexOf(tok) !== -1; })) return false;
      }
      return true;
    });
  }

  function paintFeed(list) {
    var c = {}; ENG.forEach(function (e) { c[e] = 0; });
    list.forEach(function (i) { c[i.engine]++; });
    var max = Math.max.apply(null, ENG.map(function (e) { return c[e]; }).concat([1]));
    ENG.forEach(function (e) {
      var f = document.querySelector('[data-lane="' + e + '"]');
      var n = document.querySelector('[data-lanen="' + e + '"]');
      if (f) {
        f.style.setProperty("--fill-ms", (reduced.matches ? 1 : Math.round(c[e] * 95)) + "ms");
        f.style.transform = "scaleX(" + (c[e] / max) + ")";
      }
      if (n) n.textContent = c[e];
      var lane = f && f.closest(".lane");
      if (lane) lane.classList.toggle("lane--empty", c[e] === 0);
    });
  }

  function render() {
    var c = centroid();
    var rec = nearest(c);
    var recTags = rec.map(function (r) { return r.tag; });

    // marks
    gMarks.querySelectorAll(".mark").forEach(function (m) {
      m.classList.toggle("is-on", picked.indexOf(m.dataset.e) !== -1);
    });
    document.querySelectorAll("[data-pick]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(picked.indexOf(b.dataset.pick) !== -1));
    });

    // crosshair and its construction lines
    gLines.textContent = "";
    if (c) {
      picked.forEach(function (e) {
        var p = TAXONOMY.platforms[e];
        gLines.appendChild(el("line", {
          x1: c.x * S, y1: c.y * S, x2: p.x * S, y2: p.y * S, "data-e": e
        }));
      });
      gCross.setAttribute("opacity", 1);
      gCross.setAttribute("transform", "translate(" + (c.x * S) + "," + (c.y * S) + ")");
    } else {
      gCross.setAttribute("opacity", 0);
    }

    // categories
    CATS.forEach(function (k) {
      k.node.classList.toggle("is-near", recTags.indexOf(k.tag) !== -1);
    });

    // readouts
    if (elCoord) elCoord.textContent = c ? ("x " + c.x.toFixed(1) + "   y " + c.y.toFixed(1)) : "no selection";
    if (elRec) {
      elRec.textContent = "";
      if (!rec.length) {
        var s = document.createElement("span");
        s.className = "rec__none";
        s.textContent = "pick a platform";
        elRec.appendChild(s);
      } else rec.forEach(function (k) {
        var s = document.createElement("span");
        s.className = "rec__t";
        s.textContent = k.tag;
        var b = document.createElement("b");
        b.textContent = k.n;
        s.appendChild(b);
        elRec.appendChild(s);
      });
    }

    // the real query
    var list = results(recTags);
    if (elCount) elCount.textContent = list.length;
    if (elState) {
      elState.textContent = !picked.length ? "idle"
        : list.length + (list.length === 1 ? " result" : " results")
          + " · " + picked.length + (picked.length === 1 ? " platform" : " platforms");
    }
    if (elOut) {
      elOut.textContent = "";
      if (!list.length) {
        var p = document.createElement("p");
        p.className = "empty";
        p.textContent = picked.length ? "nothing indexed for that combination yet"
                                      : "pick the platforms you use to plot a recommendation";
        elOut.appendChild(p);
      } else {
        var frag = document.createDocumentFragment();
        list.slice(0, 12).forEach(function (it) {
          var a = document.createElement("a");
          a.className = "res";
          a.dataset.e = it.engine;
          a.href = it.url; a.target = "_blank"; a.rel = "noopener noreferrer";
          a.innerHTML =
            '<span class="res__i">' + it.id + '</span>' +
            '<span class="res__n">' + esc(it.name) + '<small>' + esc(it.note) + '</small></span>' +
            '<span class="res__e">' + esc(it.engine) + '</span>' +
            '<span class="res__l">' + esc(it.licence) + '</span>';
          frag.appendChild(a);
        });
        elOut.appendChild(frag);
      }
    }
    paintFeed(list);
  }

  function toggle(e) {
    var i = picked.indexOf(e);
    if (i === -1) picked.push(e); else picked.splice(i, 1);
    render();
  }

  document.querySelectorAll("[data-pick]").forEach(function (b) {
    b.addEventListener("click", function () { toggle(b.dataset.pick); });
  });
  if (qInput) qInput.addEventListener("input", render);
  var clear = document.querySelector("[data-clear]");
  if (clear) clear.addEventListener("click", function () {
    picked = []; if (qInput) qInput.value = ""; render();
  });

  render();
})();
