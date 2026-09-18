/* Chrome shared by the inner pages. The home page has its own live version in
   app.js; this is the static counterpart so the bar and the crossfeed mean the
   same thing everywhere. */
window.AFShared = (function () {
  "use strict";
  var ENG = ENGINES.map(function (e) { return e.id; });

  function read(k, fallback) {
    try { var r = localStorage.getItem(k); return r ? JSON.parse(r) : fallback; }
    catch (e) { return fallback; }
  }
  function write(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; }
  }

  function paintChrome() {
    var s = read("af.settings", null) || { key: "", model: "auto", engines: ENG.slice() };
    var watch = read("af.watchlist", []) || [];

    var total = document.querySelector("[data-total]");
    if (total) total.textContent = INDEX.items.length;

    var counts = {};
    ENG.forEach(function (e) { counts[e] = 0; });
    INDEX.items.forEach(function (i) { counts[i.engine]++; });
    var max = Math.max.apply(null, ENG.map(function (e) { return counts[e]; }).concat([1]));

    ENG.forEach(function (e) {
      var fill = document.querySelector('[data-lane="' + e + '"]');
      var n = document.querySelector('[data-lanen="' + e + '"]');
      if (fill) {
        fill.style.setProperty("--fill-ms", Math.round(counts[e] * 95) + "ms");
        requestAnimationFrame(function () { fill.style.transform = "scaleX(" + (counts[e] / max) + ")"; });
      }
      if (n) n.textContent = counts[e];
    });

    var has = !!(s.key && s.key.length > 8);
    document.querySelectorAll("[data-status-key], [data-status-key-2]").forEach(function (el) {
      el.textContent = has ? "key set" : "no key";
    });
    var si = document.querySelector("[data-status-index]");
    if (si) si.textContent = watch.length ? "watching " + watch.length : "index live";
  }

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

  document.addEventListener("DOMContentLoaded", paintChrome);
  if (document.readyState !== "loading") paintChrome();

  return { read: read, write: write, paintChrome: paintChrome };
})();
