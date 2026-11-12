/* Echoria — ui.js : petits composants partagés (échappement, icônes, modales, toasts, confettis).
   Repris et allégé de Parlo. Exposé via window.UI. */
(function () {
  'use strict';

  function esc(s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function shade(hex, pct) { // assombrit (pct<0) ou éclaircit une couleur hex
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return hex || '#8B5A2B';
    var n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    var f = function (c) { c = Math.round(c + (pct < 0 ? c * pct : (255 - c) * pct)); return Math.max(0, Math.min(255, c)); };
    return '#' + [f(r), f(g), f(b)].map(function (c) { return (c < 16 ? '0' : '') + c.toString(16); }).join('');
  }
  function plural(n, s, p) { return n + ' ' + (n > 1 ? (p || s + 's') : s); }

  // ---------------------------------------------------------------- icônes SVG
  var P = {
    speaker: '<path d="M4 10v8h5l6 5V5L9 10zm13.5 4a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zm-2.5-9.5v2.3a7.5 7.5 0 0 1 0 14.4v2.3a9.8 9.8 0 0 0 0-19z"/>',
    close: '<path d="M6 6l16 16M22 6 6 22" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" fill="none"/>',
    check: '<path d="M4 15l6 6L24 7" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    lock: '<path d="M8 12V9a6 6 0 0 1 12 0v3h1.5a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 5 23.5v-10A1.5 1.5 0 0 1 6.5 12zm3 0h6V9a3 3 0 0 0-6 0z"/>',
    star: '<path d="M14 2.5l3.4 7.3 8 1-5.9 5.5 1.5 7.9L14 20.3l-7 3.9 1.5-7.9-5.9-5.5 8-1z"/>',
    back: '<path d="M18 5 9 14l9 9" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    gear: '<path d="M12 2h4l.7 3.2 2.3 1 2.8-1.8 2.8 2.8-1.8 2.8 1 2.3L27 13v4l-3.2.7-1 2.3 1.8 2.8-2.8 2.8-2.8-1.8-2.3 1L16 28h-4l-.7-3.2-2.3-1-2.8 1.8-2.8-2.8 1.8-2.8-1-2.3L1 17v-4l3.2-.7 1-2.3-1.8-2.8 2.8-2.8 2.8 1.8 2.3-1zm2 8.500a4.500 4.500 0 1 0 0 9 4.500 4.500 0 0 0 0-9z" transform="scale(.93) translate(1 0)"/>',
    map: '<path d="M3 7l7-3 8 3 7-3v17l-7 3-8-3-7 3zm7-1v15l8 3V9z"/>',
    hero: '<path d="M14 3a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm0 14c6 0 10 3 10 6v2H4v-2c0-3 4-6 10-6z"/>',
    book: '<path d="M3 6.5c3-1.5 7-1.5 10 .5v16c-3-2-7-2-10-.5zm22 0c-3-1.5-7-1.5-10 .5v16c3-2 7-2 10-.5z"/>',
    shop: '<path d="M6 9h16l1.5 15a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 24zm4 0a4 4 0 0 1 8 0h-2a2 2 0 0 0-4 0z"/>',
    target: '<path d="M14 3a11 11 0 1 0 0 22 11 11 0 0 0 0-22zm0 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm0 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/>'
  };
  function icon(name, cls, label) {
    return '<svg class="ico-' + name + (cls ? ' ' + cls : '') + '" viewBox="0 0 28 28" fill="currentColor" aria-hidden="' + (label ? 'false' : 'true') + '"' + (label ? ' role="img" aria-label="' + esc(label) + '"' : '') + '>' + (P[name] || '') + '</svg>';
  }
  function speakBtn(text, cls, slow) {
    return '<button type="button" class="speak-inline ' + (cls || '') + '" data-action="speak" data-text="' + esc(text) + '"' + (slow ? ' data-slow="1"' : '') + ' aria-label="Écouter : ' + esc(text) + '">' + icon('speaker') + '</button>';
  }
  function progressBar(pct, cls, color) { return '<div class="progress ' + (cls || '') + '"><span style="width:' + Math.round(Math.max(0, Math.min(1, pct)) * 100) + '%' + (color ? ';background:' + color : '') + '"></span></div>'; }
  function strengthBars(s) { return '<span class="strength" data-s="' + s + '" aria-label="Force ' + s + ' sur 4"><i></i><i></i><i></i><i></i></span>'; }
  // Rangée de 3 étoiles (n gagnées) ; cls 'big' pour les écrans de bilan.
  function stars(n, cls) {
    var h = '<span class="stars ' + (cls || '') + '" aria-label="' + n + ' étoile' + (n > 1 ? 's' : '') + ' sur 3">';
    for (var i = 1; i <= 3; i++) h += '<span class="st' + (i <= n ? ' on' : '') + '" style="--i:' + i + '">' + icon('star') + '</span>';
    return h + '</span>';
  }
  // Pico (délègue au générateur de personnages) — utilisé par le lecteur de leçon.
  function pico(opts) {
    opts = opts || {};
    return window.Chars ? window.Chars.pico(opts) : '<span class="pico emoji" style="font-size:' + Math.round((opts.size || 80) * 0.7) + 'px">🦜</span>';
  }

  // ---------------------------------------------------------------- modales, toasts
  var modalRoot = function () { return document.getElementById('modals'); };
  function showModal(opts) {
    var root = modalRoot(); if (!root) return;
    var actions = (opts.actions || []).map(function (a) {
      return '<button class="btn btn-block ' + (a.cls || 'btn-green') + '" data-act="' + esc(a.act || 'close-modal') + '"' + Object.keys(a.data || {}).map(function (k) { return ' data-' + k + '="' + esc(a.data[k]) + '"'; }).join('') + (a.disabled ? ' disabled' : '') + '>' + a.label + '</button>';
    }).join('');
    root.innerHTML = '<div class="modal-backdrop" data-dismissable="' + (opts.dismissable === false ? '0' : '1') + '" data-act="' + (opts.dismissable === false ? 'noop' : 'close-modal-backdrop') + '"><div class="modal' + (opts.cls ? ' ' + opts.cls : '') + '" role="dialog" aria-modal="true" aria-labelledby="modal-title">' + (opts.pico ? '<div class="pico-wrap">' + pico(Object.assign({ size: 110 }, opts.pico)) + '</div>' : '') + (opts.emoji ? '<div class="emoji modal-emoji">' + opts.emoji + '</div>' : '') + (opts.art || '') + '<h2 id="modal-title">' + (opts.title || '') + '</h2>' + (opts.text ? '<p>' + opts.text + '</p>' : '') + (opts.html ? '<div class="modal-body">' + opts.html + '</div>' : '') + (actions ? '<div class="modal-actions">' + actions + '</div>' : '') + '</div></div>';
  }
  function closeModal() { var root = modalRoot(); if (root) root.innerHTML = ''; }
  function isModalOpen() { var root = modalRoot(); return !!(root && root.firstChild); }
  function isModalDismissable() { var b = modalRoot() && modalRoot().querySelector('.modal-backdrop'); return !b || b.getAttribute('data-dismissable') !== '0'; }
  var MAX_TOASTS = 3;
  function toast(msg, cls, ms) {
    var root = document.getElementById('toasts'); if (!root) return;
    var live = Array.prototype.slice.call(root.querySelectorAll('.toast:not(.out)'));
    while (live.length >= MAX_TOASTS) { var old = live.shift(); if (old.parentNode) old.parentNode.removeChild(old); }
    var el = document.createElement('div'); el.className = 'toast ' + (cls || ''); el.setAttribute('role', 'status'); el.innerHTML = msg;
    root.appendChild(el);
    setTimeout(function () { el.classList.add('out'); setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 320); }, ms || 2600);
  }
  function clearToasts() { var root = document.getElementById('toasts'); if (root) root.innerHTML = ''; }

  // ---------------------------------------------------------------- confettis (canvas)
  function confetti(canvas, opts) {
    opts = opts || {};
    if (!canvas || !canvas.getContext) return function () {};
    var reduce = document.documentElement.classList.contains('rm') || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var ctx = canvas.getContext('2d');
    var W = canvas.width = canvas.offsetWidth || 400, H = canvas.height = canvas.offsetHeight || 600;
    var colors = opts.colors || ['#3DBB6B', '#2F8FE6', '#E5484D', '#F5B833', '#9A63E0', '#FF9600'];
    var parts = [];
    var n = reduce ? 0 : (opts.count || 140);
    for (var i = 0; i < n; i++) parts.push({ x: Math.random() * W, y: -20 - Math.random() * H * 0.6, w: 6 + Math.random() * 8, h: 8 + Math.random() * 10, c: colors[i % colors.length], vy: 2 + Math.random() * 3, vx: -1.5 + Math.random() * 3, r: Math.random() * Math.PI, vr: -0.1 + Math.random() * 0.2 });
    var running = true, start = performance.now(), dur = opts.duration || 3000;
    function frame(t) {
      if (!running) return;
      ctx.clearRect(0, 0, W, H);
      var alive = false;
      parts.forEach(function (p) {
        p.y += p.vy; p.x += p.vx + Math.sin(t / 300 + p.r) * 0.6; p.r += p.vr;
        if (p.y < H + 20) alive = true;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.globalAlpha = Math.max(0, Math.min(1, 1 - (t - start - dur) / 800)); ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      });
      if (alive && t - start < dur + 800) requestAnimationFrame(frame); else { running = false; ctx.clearRect(0, 0, W, H); }
    }
    if (n) requestAnimationFrame(frame);
    return function () { running = false; };
  }

  window.UI = {
    esc: esc, shade: shade, plural: plural, icon: icon, speakBtn: speakBtn, progressBar: progressBar, strengthBars: strengthBars, stars: stars, pico: pico,
    showModal: showModal, closeModal: closeModal, isModalOpen: isModalOpen, isModalDismissable: isModalDismissable, toast: toast, clearToasts: clearToasts, confetti: confetti
  };
})();
