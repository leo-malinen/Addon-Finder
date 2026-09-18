/* Addon Forge. Surface logic.
 *
 * Everything on this page computes from catalog.js at runtime. No count is
 * written into the markup, so no number can ever drift from the data.
 *
 * The crossfeed is the signature move: four lanes fill at the SAME pixels per
 * second, so the lane with more results simply keeps going for longer. They
 * genuinely race, and the finish order is a real answer about where free
 * coverage lives.
 */
(function () {
  "use strict";

  var ENG = ENGINES.map(function (e) { return e.id; });
  var reduced = matchMedia("(prefers-reduced-motion: reduce)");

/* The bar wraps to two rows on a phone, so its height is not a constant.
   Measure it and publish it, or the hero headline sits under the chrome. */
(function () {
  var bar = document.querySelector(".bar");
  if (!bar) return;
  var sync = function () {
    document.documentElement.style.setProperty("--bar-real", bar.offsetHeight + "px");
  };
  sync();
  addEventListener("resize", sync, { passive: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(sync);
})();

  /* --------------------------------------------------------- settings --- */

  var STORE = "af.settings";
  var WATCH = "af.watchlist";

  function readJSON(k, fallback) {
    try {
      var raw = localStorage.getItem(k);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function writeJSON(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { return false; }
  }

  var settings = readJSON(STORE, null) || { key: "", model: "auto", engines: ENG.slice() };
  if (!Array.isArray(settings.engines) || !settings.engines.length) settings.engines = ENG.slice();

  window.AF = {
    get settings() { return settings; },
    save: function (next) {
      settings = next;
      writeJSON(STORE, settings);
      paintKeyState();
    },
    ENG: ENG
  };

  /* ------------------------------------------------------------ search --- */

  function matches(item, q) {
    if (!q) return true;
    var hay = (item.name + " " + item.engine + " " + item.licence + " " +
               item.tags.join(" ") + " " + item.note).toLowerCase();
    return q.toLowerCase().split(/\s+/).filter(Boolean).every(function (tok) {
      return hay.indexOf(tok) !== -1;
    });
  }

  var facet = null;   // null = all engines
  var query = "";
  var live = [];      // results discovered via OpenRouter

  function results() {
    return INDEX.items.filter(function (it) {
      if (facet && it.engine !== facet) return false;
      if (settings.engines.indexOf(it.engine) === -1) return false;
      return matches(it, query);
    });
  }

  function countsFor(list) {
    var c = {};
    ENG.forEach(function (e) { c[e] = 0; });
    list.forEach(function (it) { c[it.engine]++; });
    return c;
  }

  /* ---------------------------------------------------------- rendering -- */

  var engName = {};
  ENGINES.forEach(function (e) { engName[e.id] = e.name; });

  function row(it) {
    var a = document.createElement("a");
    a.className = "res";
    a.dataset.e = it.engine;
    a.href = it.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.innerHTML =
      '<span class="res__i">' + it.id + '</span>' +
      '<span class="res__n">' + esc(it.name) + '<small>' + esc(it.note) + '</small></span>' +
      '<span class="res__e">' + esc(it.engine) + '</span>' +
      '<span class="res__l">' + esc(it.licence) + '</span>';
    return a;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function fill(node, list, limit, emptyMsg) {
    if (!node) return;
    node.textContent = "";
    if (!list.length) {
      var d = document.createElement("p");
      d.className = "empty";
      d.textContent = emptyMsg || "no match in the index";
      node.appendChild(d);
      return;
    }
    var frag = document.createDocumentFragment();
    list.slice(0, limit).forEach(function (it) { frag.appendChild(row(it)); });
    node.appendChild(frag);
  }

  var topList  = document.querySelector("[data-listing-top]");
  var mainList = document.querySelector("[data-listing-main]");
  var listLabel = document.querySelector("[data-listing-label]");
  var listCount = document.querySelector("[data-listing-count]");

  /* ------------------------------------------------- the crossfeed ------- */

  var lanes = {}, laneN = {}, bigs = {}, bigN = {};
  ENG.forEach(function (e) {
    lanes[e] = document.querySelector('[data-lane="' + e + '"]');
    laneN[e] = document.querySelector('[data-lanen="' + e + '"]');
    bigs[e]  = document.querySelector('[data-big="' + e + '"]');
    bigN[e]  = document.querySelector('[data-bign="' + e + '"]');
  });

  var PX_PER_ITEM = 95;   // ms of fill per indexed item. The race's one constant.

  /* Paint the lanes at a given race position.
     t = 0..1 across the race. Every lane advances at the same rate, so a lane
     with more results is still moving after a smaller one has finished. */
  function paintRace(counts, t) {
    var max = Math.max.apply(null, ENG.map(function (e) { return counts[e]; }).concat([1]));
    ENG.forEach(function (e) {
      var n = counts[e];
      var shown = Math.min(t * max, n);
      var frac = max ? shown / max : 0;
      [lanes[e], bigs[e]].forEach(function (el) {
        if (!el) return;
        // Kill any transition left over from the load animation. Otherwise the
        // lane eases toward this value over its own duration instead of
        // tracking the scroll, and the four lanes read inconsistently with
        // each other mid-race.
        el.style.setProperty("--fill-ms", "0ms");
        el.style.transform = "scaleX(" + frac + ")";
      });
      var v = Math.round(shown);
      if (laneN[e]) { if (laneN[e]._raf) cancelAnimationFrame(laneN[e]._raf); laneN[e].textContent = v; }
      if (bigN[e])  { if (bigN[e]._raf)  cancelAnimationFrame(bigN[e]._raf);  bigN[e].textContent  = v; }
      var lane = lanes[e] && lanes[e].closest(".lane");
      if (lane) lane.classList.toggle("lane--empty", n === 0);
    });
  }

  /* Animated race, used when the visitor types. Duration per lane is
     proportional to its own count, which is what makes them finish apart. */
  function runRace(counts) {
    var max = Math.max.apply(null, ENG.map(function (e) { return counts[e]; }).concat([1]));
    ENG.forEach(function (e) {
      var n = counts[e];
      var frac = max ? n / max : 0;
      var ms = reduced.matches ? 1 : Math.round(n * PX_PER_ITEM);
      [lanes[e], bigs[e]].forEach(function (el) {
        if (!el) return;
        el.style.setProperty("--fill-ms", ms + "ms");
        el.style.transform = "scaleX(" + frac + ")";
      });
      tickTo(laneN[e], n, ms);
      tickTo(bigN[e], n, ms);
      var lane = lanes[e] && lanes[e].closest(".lane");
      if (lane) lane.classList.toggle("lane--empty", n === 0);
    });
  }

  function tickTo(el, target, ms) {
    if (!el) return;
    if (el._raf) cancelAnimationFrame(el._raf);
    if (reduced.matches || ms < 40) { el.textContent = target; return; }
    var from = parseInt(el.textContent, 10) || 0;
    var t0 = performance.now();
    (function step(now) {
      var p = Math.min(1, (now - t0) / ms);
      el.textContent = Math.round(from + (target - from) * p);
      if (p < 1) el._raf = requestAnimationFrame(step);
    })(t0);
  }

  /* ------------------------------------------------------------- paint --- */

  var qState = document.querySelector("[data-q-state]");
  var totalEl = document.querySelector("[data-total]");

  function paint(opts) {
    var list = results();
    var counts = countsFor(list);
    var merged = live.length ? list.concat(live) : list;

    fill(topList, list, 5, "no match in the index");
    fill(mainList, merged, 6, query ? "nothing indexed for that yet" : "index idle");

    if (listLabel) listLabel.textContent = facet ? engName[facet].toLowerCase() : "all engines";
    if (listCount) listCount.textContent = list.length;
    if (totalEl) totalEl.textContent = INDEX.items.length;

    ENG.forEach(function (e) {
      var el = document.querySelector('[data-count="' + e + '"]');
      if (el) el.textContent = countsFor(INDEX.items.filter(function (i) { return matches(i, query); }))[e];
      var ec = document.querySelector('[data-engc="' + e + '"]');
      if (ec) ec.textContent = countsFor(INDEX.items)[e];
    });

    if (qState) {
      qState.textContent = query
        ? list.length + (list.length === 1 ? " result" : " results") + ' for "' + query + '"'
        : list.length + " results · " + new Set(list.map(function (i) { return i.engine; })).size + " engines";
    }

    if (!opts || opts.race !== false) runRace(counts);
    return counts;
  }

  /* ------------------------------------------------------------ inputs --- */

  var qInput = document.querySelector("[data-q-input]");
  var scripted = true;   // until the visitor takes over

  function onQuery(v) {
    query = v.trim();
    scripted = false;
    paint();
    if (query.length >= 3 && settings.key) scheduleWeb(query);
    else live = [];
  }

  if (qInput) {
    qInput.addEventListener("input", function () { onQuery(this.value); });
    qInput.addEventListener("focus", function () { scripted = false; });
  }

  document.querySelectorAll(".facet").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var id = btn.dataset.facet;
      facet = (facet === id) ? null : id;
      document.querySelectorAll(".facet").forEach(function (b) {
        b.setAttribute("aria-pressed", String(b.dataset.facet === facet));
      });
      scripted = false;
      paint();
    });
  });

  /* ---------------------------------- act 3: the peak, driven by scroll --- */
  /* The race is scrubbed by the visitor's own hand rather than played back at
     them. Below RACE_FROM the index sits idle and empty: that silence is
     authored, and the stage is never blank because the chrome, the lane rails
     and the status line are all present at p = 0. */

  var RACE_FROM = 0.14, RACE_TO = 0.55;
  var act = document.getElementById("query");

  if (act) {
    var visible = false, rafId = 0;
    new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting;
      if (visible && !rafId) rafId = requestAnimationFrame(loop);
    }, { rootMargin: "10% 0px" }).observe(act);

    var lastT = -1;
    function loop() {
      rafId = visible ? requestAnimationFrame(loop) : 0;
      if (!scripted) return;
      var p = parseFloat(getComputedStyle(act).getPropertyValue("--sc-p")) || 0;
      var t = (p - RACE_FROM) / (RACE_TO - RACE_FROM);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      if (Math.abs(t - lastT) < 0.002) return;
      lastT = t;

      var counts = countsFor(results());
      paintRace(counts, t);

      if (qState) {
        qState.textContent = t === 0 ? "idle"
          : t < 1 ? "reading index"
          : INDEX.items.length + " results · " + ENG.length + " engines";
      }
      if (mainList) {
        var list = results();
        var max = Math.max.apply(null, ENG.map(function (e) { return counts[e]; }).concat([1]));
        var show = Math.round(t * max / (max || 1) * 6);
        fill(mainList, list.slice(0, show), 6, "index idle");
      }
    }
  }

  /* ----------------------------------------------- act 4: record card ---- */

  var rec = INDEX.items[0];
  var recMap = {
    "data-rec-id": rec.id, "data-rec-name": rec.name, "data-rec-eng": engName[rec.engine],
    "data-rec-lic": rec.licence, "data-rec-host": rec.host, "data-rec-tags": rec.tags.join(", "),
    "data-rec-checked": INDEX.checked, "data-rec-engine": rec.engine
  };
  Object.keys(recMap).forEach(function (k) {
    var el = document.querySelector("[" + k + "]");
    if (el) el.textContent = recMap[k];
  });
  var recUrl = document.querySelector("[data-rec-url]");
  if (recUrl) { recUrl.href = rec.url; recUrl.textContent = rec.host; }

  /* ------------------------------------- the plate labels, from the index -- */
  /* demoweb's six-field label schema. The package format and the manifest are
     vendor facts; the licences, the hosts and the count are computed from
     catalog.js so a plate can never claim something the index does not hold. */
  (function () {
    var uniq = function (a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }); };
    ENG.forEach(function (e) {
      var mine = INDEX.items.filter(function (i) { return i.engine === e; });
      var lic = document.querySelector('[data-pl-lic="' + e + '"]');
      var host = document.querySelector('[data-pl-host="' + e + '"]');
      var cnt = document.querySelector('[data-pl-count="' + e + '"]');
      if (lic) lic.textContent = uniq(mine.map(function (i) { return i.licence; })).join("  \u00b7  ");
      if (host) host.textContent = uniq(mine.map(function (i) { return i.host; })).join("  \u00b7  ");
      if (cnt) cnt.textContent = mine.length;
    });
    document.querySelectorAll("[data-pl-checked]").forEach(function (el) {
      el.textContent = INDEX.checked;
    });
  })();

  /* ------------------------------------------------- act 2: real stats --- */

  var hosts = new Set(INDEX.items.map(function (i) { return i.host; })).size;
  var lics  = new Set(INDEX.items.map(function (i) { return i.licence; })).size;
  var statVals = { total: INDEX.items.length, engines: ENG.length, hosts: hosts, licences: lics };
  Object.keys(statVals).forEach(function (k) {
    var el = document.querySelector('[data-stat="' + k + '"]');
    if (el) el.setAttribute("data-sc-count", "0 " + statVals[k]);
  });

  /* --------------------------------------------------- act 6: key state -- */

  function paintKeyState() {
    var has = !!(settings.key && settings.key.length > 8);
    var label = has ? "key set" : "no key";
    document.querySelectorAll("[data-status-key], [data-status-key-2]").forEach(function (el) {
      el.textContent = label;
    });
    var kp = document.querySelector("[data-key-preview]");
    if (kp) kp.textContent = has ? settings.key.slice(0, 10) + "•".repeat(14) : "not set";
    var mp = document.querySelector("[data-model-preview]");
    if (mp) mp.textContent = settings.model || "auto";
  }
  paintKeyState();

  /* ------------------------------------------- act 7: the gap recorder --- */

  var watch = readJSON(WATCH, []);
  var watchBox = document.querySelector("[data-watchlist]");
  var gapForm = document.querySelector("[data-gap-form]");
  var gapInput = document.querySelector("[data-gap-input]");
  var statusIndex = document.querySelector("[data-status-index]");

  function paintWatch() {
    if (!watchBox) return;
    watchBox.textContent = "";
    watch.forEach(function (w, i) {
      var chip = document.createElement("span");
      chip.className = "chip";
      chip.appendChild(document.createTextNode(w));
      var x = document.createElement("button");
      x.type = "button";
      x.setAttribute("aria-label", "Remove " + w + " from the watchlist");
      x.textContent = "×";
      x.addEventListener("click", function () {
        watch.splice(i, 1); writeJSON(WATCH, watch); paintWatch();
      });
      chip.appendChild(x);
      watchBox.appendChild(chip);
    });
    if (statusIndex) {
      statusIndex.textContent = watch.length ? "watching " + watch.length : "index live";
    }
  }
  paintWatch();

  if (gapForm) {
    gapForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var v = (gapInput.value || "").trim();
      if (!v || watch.indexOf(v) !== -1) return;
      watch.push(v);
      writeJSON(WATCH, watch);
      gapInput.value = "";
      paintWatch();
    });
  }

  /* --------------------------------------------- OpenRouter discovery ---- */
  /* Runs entirely in this browser. The key is read from localStorage and sent
     to openrouter.ai and nowhere else. There is no server behind this site. */

  var webTimer = 0;
  function scheduleWeb(q) {
    clearTimeout(webTimer);
    webTimer = setTimeout(function () { webSearch(q); }, 650);
  }

  function webSearch(q) {
    var model = (!settings.model || settings.model === "auto")
      ? "openai/gpt-4o-mini" : settings.model;

    fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + settings.key,
        "X-Title": "Addon Forge"
      },
      body: JSON.stringify({
        model: model,
        messages: [{
          role: "user",
          content: "List up to 5 genuinely FREE addons, plugins or packages for " +
            settings.engines.join(", ") + " matching: \"" + q + "\". " +
            "Only include ones that are actually free with a published licence. " +
            "Reply with JSON only, no prose: " +
            '{"items":[{"name":"","engine":"blender|unreal|unity|daz","licence":"","url":"","note":""}]}'
        }],
        temperature: 0
      })
    })
      .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
      .then(function (d) {
        var txt = d && d.choices && d.choices[0] && d.choices[0].message.content || "";
        var m = txt.match(/\{[\s\S]*\}/);
        if (!m) throw new Error("no json");
        var parsed = JSON.parse(m[0]);
        live = (parsed.items || []).filter(function (i) {
          return i && i.name && ENG.indexOf(i.engine) !== -1;
        }).map(function (i, n) {
          return {
            id: "w" + (n + 1), name: i.name, engine: i.engine,
            licence: i.licence || "see source", host: "web",
            url: i.url || "#", tags: [], note: (i.note || "found on the web") + " (live result, unverified)"
          };
        });
        paint({ race: false });
      })
      .catch(function () { live = []; });
  }

  /* The looping preview pane lived in the old hero and went with it when the
     top was rebuilt on demoweb's plates. Its clip now sits unused in raw/;
     plate 002 carries the motion instead, and it scrubs rather than loops. */

  /* ------------------------------------------------------------- start --- */

  // Licence breakdown, computed so it can never drift from the index.
  (function () {
    var box = document.querySelector("[data-lic-panel]");
    if (!box) return;
    var by = {};
    INDEX.items.forEach(function (i) { by[i.licence] = (by[i.licence] || 0) + 1; });
    var rows = Object.keys(by).map(function (k) { return [k, by[k]]; })
      .sort(function (a, b) { return b[1] - a[1]; });
    var max = rows[0] ? rows[0][1] : 1;
    rows.forEach(function (r) {
      var el = document.createElement("div");
      el.className = "licrow";
      el.innerHTML = '<span class="licrow__k">' + esc(r[0]) + '</span>' +
        '<span class="licrow__t"><span class="licrow__f" style="transform:scaleX(' + (r[1] / max) + ')"></span></span>' +
        '<span class="licrow__n">' + r[1] + '</span>';
      box.appendChild(el);
    });
    var c = document.querySelector("[data-lic-count]");
    if (c) c.textContent = rows.length + " in use";
  })();

  // The crossfeed rests on the REAL index distribution from the first paint.
  // A rail of zeros on the landing screen reads as "no results", which is the
  // opposite of what this page is saying. Act 3 clears it back to zero as it
  // scrolls into view, and that reset reads as a new query starting.
  paint({ race: false });
  runRace(countsFor(results()));
  fill(mainList, [], 6, "index idle");
})();
