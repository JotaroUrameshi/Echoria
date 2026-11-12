/* Echoria — fx.js : effets visuels repris de Parlo (particules, FLIP de la banque de mots, compteurs). Aucune dépendance. */
(function () {
  'use strict';
  var COLORS = ['#3DBB6B', '#2F8FE6', '#E5484D', '#F5B833', '#9A63E0', '#FF9600'];
  function reduced() { try { if (document.documentElement.classList.contains("rm")) return true; return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function canAnimate(el) { return !!(el && typeof el.animate === 'function'); }
  function rect(el) { return el.getBoundingClientRect(); }
  function retrigger(el, cls) { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  function once(el, cls, ms) { if (!el) return; retrigger(el, cls); setTimeout(function () { el.classList.remove(cls); }, ms || 800); }

  // ---------------------------------------------------------------- particules (burst)
  function burst(x, y, opts) {
    if (reduced()) return;
    opts = opts || {};
    var n = opts.count || 14, colors = opts.colors || COLORS, spread = opts.spread || 90, frag = document.createDocumentFragment(), els = [];
    for (var i = 0; i < n; i++) {
      var p = document.createElement('span');
      var kind = opts.stars && i % 3 === 0 ? 'star' : (i % 2 ? 'sq' : '');
      p.className = 'fx-particle ' + kind;
      var c = colors[i % colors.length];
      if (kind === 'star') p.textContent = ['✨', '⭐', '💫'][i % 3]; else p.style.background = c;
      var size = 8 + Math.random() * 9; if (kind !== 'star') { p.style.width = size + 'px'; p.style.height = size + 'px'; }
      p.style.transform = 'translate(' + (x - size / 2) + 'px,' + (y - size / 2) + 'px)';
      frag.appendChild(p); els.push(p);
    }
    document.body.appendChild(frag);
    els.forEach(function (p, i) {
      var a = (Math.PI * 2 * i) / n + (Math.random() - .5) * .6, d = spread * (.55 + Math.random() * .7);
      var tx = x + Math.cos(a) * d, ty = y + Math.sin(a) * d + (opts.gravity === false ? 0 : 30 + Math.random() * 30);
      var dur = 700 + Math.random() * 400;
      if (canAnimate(p)) {
        var anim = p.animate([
          { transform: 'translate(' + x + 'px,' + y + 'px) scale(.4) rotate(0deg)', opacity: 1 },
          { transform: 'translate(' + (x + (tx - x) * .6) + 'px,' + (y + (ty - y) * .45) + 'px) scale(1.15) rotate(120deg)', opacity: 1, offset: .5 },
          { transform: 'translate(' + tx + 'px,' + ty + 'px) scale(.6) rotate(240deg)', opacity: 0 }
        ], { duration: dur, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' });
        anim.onfinish = function () { if (p.parentNode) p.parentNode.removeChild(p); };
      } else { setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, dur); }
    });
    setTimeout(function () { els.forEach(function (p) { if (p.parentNode) p.parentNode.removeChild(p); }); }, 1400);
  }
  function burstAt(el, opts) { if (!el) return; var r = rect(el); burst(r.left + r.width / 2, r.top + r.height / 2, opts); }

  // ---------------------------------------------------------------- flash d'écran
  function flash(kind) {
    if (reduced()) return;
    var f = document.createElement('div'); f.className = 'fx-flash ' + kind; document.body.appendChild(f);
    setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 750);
  }

  // ---------------------------------------------------------------- compteur animé
  function countUp(el, to, opts) {
    if (!el) return;
    opts = opts || {};
    var from = opts.from || 0, ms = opts.ms || 900, prefix = opts.prefix || '', suffix = opts.suffix || '';
    if (reduced() || !(window.requestAnimationFrame)) { el.textContent = prefix + to + suffix; return; }
    var start = null;
    function ease(t) { return 1 - Math.pow(1 - t, 3); }
    function frame(ts) {
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / ms);
      el.textContent = prefix + Math.round(from + (to - from) * ease(p)) + suffix;
      if (p < 1) requestAnimationFrame(frame); else { el.textContent = prefix + to + suffix; if (opts.done) opts.done(); }
    }
    el.textContent = prefix + from + suffix;
    setTimeout(function () { requestAnimationFrame(frame); }, opts.delay || 0);
  }

  // ---------------------------------------------------------------- FLIP (tuiles de la banque de mots)
  // Appelle `mutate()` puis anime chaque tuile depuis son ancienne position (ou depuis `origins[key]`).
  function flipTiles(container, selector, keyOf, mutate, origins) {
    var before = {};
    if (container) Array.prototype.forEach.call(container.querySelectorAll(selector), function (t) { before[keyOf(t)] = rect(t); });
    mutate();
    if (reduced() || !container) return;
    Array.prototype.forEach.call(container.querySelectorAll(selector), function (t) {
      var k = keyOf(t), from = before[k] || (origins && origins[k]);
      var to = rect(t);
      if (!from) { t.classList.add('fx-appear'); return; }
      var dx = from.left - to.left, dy = from.top - to.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      if (canAnimate(t)) {
        t.classList.add('fx-fly');
        var a = t.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'translate(0,0)' }], { duration: 360, easing: 'cubic-bezier(.34,1.56,.64,1)' });
        a.onfinish = function () { t.classList.remove('fx-fly'); };
      } else {
        t.style.transition = 'none'; t.style.transform = 'translate(' + dx + 'px,' + dy + 'px)'; t.classList.add('fx-fly');
        void t.offsetWidth; t.classList.add('fx-flip'); t.style.transform = '';
        setTimeout(function () { t.classList.remove('fx-flip', 'fx-fly'); t.style.transition = ''; }, 400);
      }
    });
  }

  // ---------------------------------------------------------------- étincelles autour d'un élément (chemin)
  function sparkles(el, color, n) {
    if (!el || reduced()) return;
    var wrap = document.createElement('span'); wrap.className = 'fx-sparkles'; wrap.setAttribute('aria-hidden', 'true');
    n = n || 12;
    for (var i = 0; i < n; i++) {
      var s = document.createElement('span'); var a = (Math.PI * 2 * i) / n, d = 64 + Math.random() * 40;
      s.style.setProperty('--tx', Math.round(Math.cos(a) * d) + 'px'); s.style.setProperty('--ty', Math.round(Math.sin(a) * d) + 'px');
      s.style.setProperty('--c', i % 3 === 0 ? '#FFC800' : (color || '#58CC02')); s.style.setProperty('--d', (Math.random() * .15).toFixed(2) + 's');
      if (i % 2) s.className = 'round';
      wrap.appendChild(s);
    }
    el.appendChild(wrap);
    setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 1200);
  }

  // ---------------------------------------------------------------- hooks leçon
  var FX = {
    reduced: reduced, burst: burst, burstAt: burstAt, flash: flash, countUp: countUp, flipTiles: flipTiles, sparkles: sparkles, retrigger: retrigger, once: once,
    pendingNode: null, lastTab: null,

    // nouvel exercice affiché
    exerciseIn: function (root) { var inner = root && root.querySelector('.screen-inner'); if (inner) retrigger(inner, 'fx-ex-in'); },
    // le bouton VÉRIFIER devient actif
    ready: function (btn) { once(btn, 'fx-ready', 500); },
    // bonne réponse
    correct: function (root) {
      if (!root) return;
      var prog = root.querySelector('.progress'); if (prog) once(prog, 'fx-shine', 1300);
      var pico = root.querySelector('.screen-body .pico'); if (pico) once(pico, 'fx-hop', 800);
      var target = root.querySelector('.bank-answer') || root.querySelector('.screen-body .correct') || root.querySelector('.pairs') || root.querySelector('.btn-check');
      if (target) { var r = rect(target); burst(r.left + r.width / 2, Math.min(r.top + r.height / 2, window.innerHeight - 160), { count: 16, colors: ['#58CC02', '#8EE000', '#FFC800', '#1CB0F6'], spread: 85 }); }
    },
    // mauvaise réponse (heartLost : un cœur vient d'être perdu)
    wrong: function (root, heartLost) {
      if (!root) return;
      var pico = root.querySelector('.screen-body .pico'); if (pico) once(pico, 'fx-sad', 700);
      if (heartLost) { flash('red'); var h = root.querySelector('.screen-top .hearts'); if (h) once(h, 'fx-hit', 800); }
    },
    // 5 bonnes réponses d'affilée
    combo: function (root) { var prog = root && root.querySelector('.progress'); if (prog) burstAt(prog, { count: 16, colors: ['#FFC800', '#FF9600', '#FF4B4B', '#fff'], spread: 60, stars: true }); },
    // toutes les paires trouvées
    pairsDone: function (root) { var p = root && root.querySelector('.pairs'); if (p) burstAt(p, { count: 18, spread: 110 }); },

    // écran de récap : compteurs & petites célébrations
    recapIn: function (root) {
      if (!root) return;
      var cards = root.querySelectorAll('.stat-card'); Array.prototype.forEach.call(cards, function (c, i) { c.style.setProperty('--i', i); c.style.animationDelay = ''; });
      var xp = root.querySelector('.stat-card.xp .sc-value');
      if (xp) { var txt = xp.lastChild; var m = txt && /\d+/.exec(txt.textContent || ''); if (m) { var span = document.createElement('span'); xp.replaceChild(span, txt); countUp(span, parseInt(m[0], 10), { ms: 1100, delay: 650 }); } }
      var big = root.querySelector('.goal-ring .ring-center .big');
      if (big) { var to = parseInt(big.textContent, 10); if (!isNaN(to)) countUp(big, to, { ms: 1300, delay: 300, from: Math.max(0, to - 20) }); var ring = root.querySelector('.goal-ring'); var h1 = root.querySelector('h1'); if (ring && h1 && /atteint/.test(h1.textContent)) { ring.classList.add('fx-done'); setTimeout(function () { burstAt(ring, { count: 24, spread: 130, stars: true }); }, 1500); } }
      var streak = root.querySelector('.streak-num');
      if (streak) { var n = parseInt(streak.textContent, 10); if (!isNaN(n) && n > 1) countUp(streak, n, { ms: 700, delay: 250, from: n - 1 }); setTimeout(function () { burstAt(root.querySelector('.streak-big'), { count: 18, colors: ['#FF9600', '#FFC800', '#FF4B4B'], spread: 100 }); }, 500); }
      var picoEl = root.querySelector('.pico.party'); if (picoEl) setTimeout(function () { burstAt(picoEl, { count: 20, spread: 120, stars: true }); }, 350);
    },

    // pluie d étoiles/gemmes autour d un élément (butin, cristal)
    celebrate: function (el, colors) { if (!el) return; burstAt(el, { count: 22, spread: 120, stars: true, colors: colors }); }
  };
  window.FX = FX;
})();
