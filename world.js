/* Echoria — world.js : moteur d'exploration vu de dessus (façon RPG 2D). Exposé via window.World.
   La carte est décrite en données (chapitre.world : tuiles, cartes, objets, zones, passages) ; ce fichier ne contient
   aucun texte de jeu. Le « directeur » (cfg.director, voir minigames.js) décide de ce que font les interactions.

   World.open(root, cfg) → instance
     cfg : { def, save, ui, hero: { sprite(facing, step, extra) → svg }, actors: { id: { sprite(facing, step) → svg, ... } },
             hooks: { speak, sound, vibrate, frHelp(), reduced(), persist(), onBack(), onList(), onWord(word) }, director }
   Tests : World.state (lecture seule), World.debug.walkTo(id), World.debug.interact(), World.debug.route(id), World.debug.goto(map, x, y). */
(function () {
  'use strict';
  var U = 32, cur = null;
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function hash(x, y) { var h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  var FLAT = { rug: 1, mat: 1 };
  var SPEAKER = '<svg viewBox="0 0 28 28" fill="currentColor" aria-hidden="true"><path d="M4 10v8h5l6 5V5L9 10zm13.5 4a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zm-2.5-9.5v2.3a7.5 7.5 0 0 1 0 14.4v2.3a9.8 9.8 0 0 0 0-19z"/></svg>';

  // ---------------------------------------------------------------- sols et murs (dessinés au canvas)
  function planks(c, x, y, s, tx, ty, base, line) {
    c.fillStyle = base; c.fillRect(x, y, s, s); c.fillStyle = line;
    c.fillRect(x, y + s / 2 - 1, s, 2); c.fillRect(x, y + s - 1, s, 2);
    var odd = (tx + ty) % 2; c.fillRect(x + s * (odd ? 0.3 : 0.72), y, 2, s / 2); c.fillRect(x + s * (odd ? 0.8 : 0.22), y + s / 2, 2, s / 2);
  }
  function checker(c, x, y, s, tx, ty, a, b, grout) { c.fillStyle = (tx + ty) % 2 ? a : b; c.fillRect(x, y, s, s); c.fillStyle = grout; c.fillRect(x, y, s, 1); c.fillRect(x, y, 1, s); }
  var FLOOR = {
    parquet: function (c, x, y, s, tx, ty) { planks(c, x, y, s, tx, ty, '#E7BE84', '#CFA064'); },
    wood: function (c, x, y, s, tx, ty) { planks(c, x, y, s, tx, ty, '#D3A268', '#B98548'); },
    carpet: function (c, x, y, s, tx, ty) { c.fillStyle = '#EBCFA6'; c.fillRect(x, y, s, s); c.fillStyle = '#DDBB8A'; for (var i = 0; i < 4; i++) c.fillRect(x + hash(tx * 7 + i, ty) * (s - 3), y + hash(tx, ty * 5 + i) * (s - 3), 3, 3); },
    bath: function (c, x, y, s, tx, ty) { checker(c, x, y, s, tx, ty, '#EAF6FF', '#CDE8FA', '#B4D6EE'); },
    kitchen: function (c, x, y, s, tx, ty) { checker(c, x, y, s, tx, ty, '#FFF4DC', '#F7C990', '#E5B273'); },
    stone: function (c, x, y, s) { c.fillStyle = '#DCCFB2'; c.fillRect(x, y, s, s); c.strokeStyle = '#C4B490'; c.lineWidth = 2; c.strokeRect(x + 2, y + 2, s - 4, s - 4); },
    grass: function (c, x, y, s, tx, ty) {
      c.fillStyle = (tx + ty) % 2 ? '#8BD460' : '#84CE59'; c.fillRect(x, y, s, s); c.strokeStyle = '#63B63F'; c.lineWidth = Math.max(1.5, s / 28); c.beginPath();
      for (var i = 0; i < 3; i++) { var gx = x + hash(tx * 3 + i, ty) * (s - 8) + 4, gy = y + hash(tx, ty * 3 + i) * (s - 10) + 8; c.moveTo(gx - 3, gy); c.lineTo(gx - 1, gy - 6); c.moveTo(gx, gy); c.lineTo(gx + 1, gy - 7); c.moveTo(gx + 3, gy); c.lineTo(gx + 4, gy - 5); }
      c.stroke();
      if (hash(tx + 11, ty + 5) > 0.8) { c.fillStyle = ['#FFE066', '#FF8FC0', '#fff'][(tx + ty) % 3]; c.beginPath(); c.arc(x + s * 0.3 + hash(tx, ty) * s * 0.4, y + s * 0.6, s / 14, 0, 7); c.fill(); }
    },
    path: function (c, x, y, s, tx, ty) { c.fillStyle = '#EDDBAA'; c.fillRect(x, y, s, s); c.fillStyle = '#D9C48A'; for (var i = 0; i < 3; i++) { c.beginPath(); c.arc(x + 6 + hash(tx * 5 + i, ty) * (s - 12), y + 6 + hash(tx, ty * 7 + i) * (s - 12), s / 12, 0, 7); c.fill(); } },
    stairs: function (c, x, y, s) { for (var i = 0; i < 4; i++) { c.fillStyle = i % 2 ? '#C28A52' : '#D9A66B'; c.fillRect(x, y + i * s / 4, s, s / 4); c.fillStyle = '#8B5A2B'; c.fillRect(x, y + (i + 1) * s / 4 - 2, s, 2); } c.fillStyle = '#5E3A1A'; c.fillRect(x, y, 3, s); c.fillRect(x + s - 3, y, 3, s); },
    step: function (c, x, y, s) { c.fillStyle = '#D9D2C4'; c.fillRect(x, y, s, s); c.fillStyle = '#B9B0A0'; c.fillRect(x, y + s * 0.5, s, 2); c.fillStyle = '#3DBB6B'; c.fillRect(x + s * 0.15, y + s * 0.1, s * 0.7, s * 0.3); }
  };
  function drawTile(c, def, below, x, y, s, tx, ty) {
    if (!def || def.empty) return;
    if (def.wall) {
      if (below && below.floor && !below.wall && below.wallc !== false) {
        c.fillStyle = below.wallc || '#F2E3C6'; c.fillRect(x, y, s, s);
        c.fillStyle = 'rgba(255,255,255,.22)'; for (var i = 0; i < 3; i++) c.fillRect(x + s * (0.12 + i * 0.33), y + s * 0.2, s * 0.1, s * 0.66);
        c.fillStyle = '#FFFDF6'; c.fillRect(x, y + s * 0.86, s, s * 0.14);
        c.fillStyle = '#5B4636'; c.fillRect(x, y, s, s * 0.2); c.fillStyle = '#7A604A'; c.fillRect(x, y + s * 0.2 - 2, s, 2);
      } else { c.fillStyle = '#4A3A30'; c.fillRect(x, y, s, s); c.fillStyle = '#5B4636'; c.fillRect(x + 2, y + 2, s - 4, s - 4); }
      return;
    }
    if (def.roof) { c.fillStyle = '#C8553A'; c.fillRect(x, y, s, s); c.strokeStyle = '#A8402A'; c.lineWidth = 2; for (var r = 0; r < 2; r++) for (var k = 0; k < 2; k++) { c.beginPath(); c.arc(x + (k + (r % 2 ? 0.5 : 0)) * s / 2 + s / 4 - (r % 2 ? s / 4 : 0), y + r * s / 2, s / 4, 0, Math.PI); c.stroke(); } return; }
    (FLOOR[def.floor] || FLOOR.parquet)(c, x, y, s, tx, ty);
    if (def.fence) { c.fillStyle = '#fff'; c.fillRect(x, y + s * 0.3, s, s * 0.1); c.fillRect(x, y + s * 0.62, s, s * 0.1); for (var p = 0; p < 3; p++) { var px = x + s * (0.08 + p * 0.33); c.fillRect(px, y + s * 0.14, s * 0.17, s * 0.72); c.beginPath(); c.moveTo(px, y + s * 0.14); c.lineTo(px + s * 0.085, y + s * 0.03); c.lineTo(px + s * 0.17, y + s * 0.14); c.fill(); } }
    if (def.hedge) { c.fillStyle = '#2E8B4A'; c.beginPath(); c.arc(x + s * 0.28, y + s * 0.55, s * 0.36, 0, 7); c.arc(x + s * 0.72, y + s * 0.55, s * 0.36, 0, 7); c.arc(x + s * 0.5, y + s * 0.36, s * 0.36, 0, 7); c.fill(); c.fillStyle = '#3FA35C'; c.beginPath(); c.arc(x + s * 0.42, y + s * 0.3, s * 0.14, 0, 7); c.fill(); }
  }

  // ---------------------------------------------------------------- instance
  function open(root, cfg) {
    if (cur) cur.destroy();
    var def = cfg.def, save = cfg.save, ui = cfg.ui || {}, hooks = cfg.hooks || {}, dir8 = cfg.director || {};
    save.flags = save.flags || {}; save.seen = save.seen || {};
    var destroyed = false, raf = 0, last = 0, t = 0, paused = false;
    var canvas, ctx, el = {}, dpr = 1, vw = 0, vh = 0, ts = 56, insetTop = 150, insetBottom = 110, baseTop = 150, baseBottom = 110;
    var mapId = null, map = null, grid = null, layer = null, layerKey = '';
    var cam = { x: 0, y: 0 }, sprites = {}, actors = {}, objective = [], objById = {};
    var hero = { id: 'hero', x: 0, y: 0, dir: 'down', moving: false, path: null, onArrive: null, hidden: false, carry: null, step: 0, speed: 4.3, extra: '' };
    var input = { jx: 0, jy: 0, keys: {}, pid: null, sx: 0, sy: 0, st: 0, stick: false };
    var locked = 0, talk = null, menu = null, labelT = 0, labelAnchor = null, picoT = 0, sayRestore = null, fading = false, zoneId = null, idle = 0, target = null, roomT = 0;

    // ---- DOM
    root.innerHTML = '<div class="world"><canvas class="w-canvas"></canvas>' +
      '<div class="w-top"><button class="w-btn w-back" data-w="back" aria-label="' + esc(ui.back || 'Retour') + '"><svg viewBox="0 0 28 28" aria-hidden="true"><path d="M18 5 9 14l9 9" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg></button>' +
      '<button class="w-banner" data-w="list"><span class="w-banner-ico emoji" data-role="bico">📜</span><span class="w-banner-txt"><b data-role="ben" lang="en"></b><small data-role="bfr"></small></span><span class="w-banner-more emoji" aria-hidden="true">📜</span></button></div>' +
      '<div class="w-say hidden" data-w="say-next" data-role="say"></div>' +
      '<div class="w-room hidden" data-role="room"></div>' +
      '<div class="w-label hidden" data-w="label" data-role="label"></div>' +
      '<div class="w-menu hidden" data-role="menu"></div>' +
      '<div class="w-pico hidden" data-w="pico-close" data-role="pico"></div>' +
      '<div class="w-stick hidden" data-role="stick"><i></i></div>' +
      '<button class="w-a hidden" data-w="a" data-role="a" aria-label="' + esc(ui.aLabel || 'Action') + '"><b>A</b><small data-role="averb"></small></button>' +
      '<div class="w-fade" data-role="fade"></div></div>';
    var wrap = root.firstChild;
    canvas = wrap.querySelector('canvas'); ctx = canvas.getContext('2d');
    ['say', 'room', 'label', 'menu', 'pico', 'stick', 'a', 'fade', 'ben', 'bfr', 'bico', 'averb'].forEach(function (r) { el[r] = wrap.querySelector('[data-role="' + r + '"]'); });

    // ---- cartes
    function tileDef(ch) { return (def.tiles || {})[ch] || { floor: 'parquet' }; }
    function tileAt(m, tx, ty) { var row = m.rows[ty]; return row && tx >= 0 && tx < row.length ? tileDef(row[tx]) : { empty: true }; }
    function cond(k) { if (!k) return true; var neg = k.charAt(0) === '!'; if (neg) k = k.slice(1); var v = !!save.flags[k]; return neg ? !v : v; }
    function visible(o) { return cond(o.if); }
    function isSolid(o) { return o.solid !== undefined ? o.solid : !(FLAT[o.kind] || o.kind === 'item' || o.wall); }
    function buildGrid() {
      var rows = map.rows.length, cols = map.cols; grid = [];
      for (var y = 0; y < rows; y++) { grid.push([]); for (var x = 0; x < cols; x++) { var d = tileAt(map, x, y); grid[y].push(!!(d.empty || d.wall || d.solid || d.roof || d.fence || d.hedge)); } }
      map.objects.forEach(function (o) {
        var yy, xx;
        if (o.blockIf && cond(o.blockIf)) for (yy = 0; yy < (o.h || 1); yy++) for (xx = 0; xx < (o.w || 1); xx++) if (grid[o.y + yy]) grid[o.y + yy][o.x + xx] = true;
        if (!visible(o) || !isSolid(o) || o.wall) return;
        for (yy = 0; yy < (o.h || 1); yy++) for (xx = 0; xx < (o.w || 1); xx++) if (grid[o.y + yy]) grid[o.y + yy][o.x + xx] = true;
      });
    }
    function free(tx, ty) { return ty >= 0 && ty < grid.length && tx >= 0 && tx < map.cols && !grid[ty][tx]; }
    function actorBlocks(tx, ty) { for (var k in actors) { var a = actors[k]; if (a.solid && a.map === mapId && Math.floor(a.x) === tx && Math.floor(a.y) === ty) return true; } return false; }
    function setMap(id) {
      mapId = id; map = def.maps[id]; map.cols = map.cols || Math.max.apply(null, map.rows.map(function (r) { return r.length; })); map.objects = map.objects || [];
      objById = {}; Object.keys(def.maps).forEach(function (m) { (def.maps[m].objects || []).forEach(function (o) { o.map = m; objById[o.id] = o; }); });
      buildGrid(); layerKey = ''; zoneId = null;
      wrap.setAttribute('data-map', id);
    }
    function renderLayer() {
      var key = mapId + ':' + ts + ':' + dpr; if (layerKey === key) return; layerKey = key;
      layer = document.createElement('canvas'); layer.width = Math.ceil(map.cols * ts * dpr); layer.height = Math.ceil(map.rows.length * ts * dpr);
      var c = layer.getContext('2d'); c.scale(dpr, dpr);
      for (var y = 0; y < map.rows.length; y++) for (var x = 0; x < map.cols; x++) drawTile(c, tileAt(map, x, y), tileAt(map, x, y + 1), x * ts, y * ts, ts, x, y);
    }

    // ---- images (SVG → canvas pré-rendu)
    function sprite(key, wU, hU, svgFn) {
      var k = key + '@' + ts + 'x' + dpr, s = sprites[k];
      if (s) return s.ready ? s : null;
      s = sprites[k] = { ready: false, c: null };
      var svg = svgFn(); if (!svg) return null;
      var img = new Image();
      img.onload = function () { if (destroyed) return; var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(wU / U * ts * dpr)); c.height = Math.max(1, Math.round(hU / U * ts * dpr)); try { c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); } catch (e) { /* ignore */ } s.c = c; s.ready = true; };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      return null;
    }
    function spriteFlags() { return Object.assign({}, save.flags, cfg.spriteCtx ? cfg.spriteCtx() : {}); }
    function objSprite(o) {
      var f = spriteFlags(), key = 'o:' + o.id + ':' + (o.stateKeys || []).map(function (k) { return f[k] || 0; }).join(',');
      var w = (o.w || 1) * U, h = ((o.h || 1) + (o.tall || 0)) * U;
      return sprite(key, w, h, function () { var sp = window.Props && window.Props.sprite(o.kind, o, f); return sp ? sp.svg : ''; });
    }
    function actorSprite(a) {
      var step = a.moving ? (Math.floor(t * 7) % 2 ? 1 : 2) : 0, facing = a.dir || 'down', extra = a.extra || '';
      if (a.pose) return sprite('a:' + a.id + ':' + a.pose, 100, 100, function () { return a.def.sprite(a.pose); });
      var key = 'a:' + a.id + ':' + facing + ':' + step + ':' + extra + ':' + (a.ver || 0);
      return sprite(key, 200, 200, function () { return a.def.sprite(facing, step, extra); }) || sprite('a:' + a.id + ':' + facing + ':0:' + extra + ':' + (a.ver || 0), 200, 200, function () { return a.def.sprite(facing, 0, extra); });
    }

    // ---- géométrie
    function resize() {
      var r = wrap.getBoundingClientRect(); vw = r.width || 390; vh = r.height || 700; dpr = Math.min(2, window.devicePixelRatio || 1);
      ts = clamp(Math.round(vw / 7), 44, 64);
      baseTop = insetTop = vh >= 700 ? 150 : 128; baseBottom = insetBottom = vh >= 700 ? 104 : 76;
      canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr); layerKey = '';
    }
    // Zone utile de l'écran : sous la bannière et la bulle de consigne, au-dessus du menu de choix (s'il est ouvert).
    function insets() {
      // en haut : juste sous la bannière ; sous la bulle de consigne quand elle est affichée (pas de bande vide au-dessus de la maison)
      var b = baseBottom, r = wrap.getBoundingClientRect(), top = wrap.querySelector('.w-top'), t = top ? top.getBoundingClientRect().bottom - r.top + 8 : baseTop;
      var sTop = Math.round(t - 2) + 'px'; if (el.say.style.top !== sTop) el.say.style.top = sTop;
      if (!el.say.classList.contains('hidden')) { var sb = el.say.getBoundingClientRect().bottom - r.top; if (sb > 0) t = Math.max(t, sb + 8); }
      if (menu && el.menu.firstChild) { var mh = el.menu.firstChild.offsetHeight; if (mh) b = Math.max(b, mh + 30); }
      if (t !== insetTop || b !== insetBottom) { insetTop = t; insetBottom = b; }
    }
    function camera(snap) {
      var mw = map.cols * ts, mh = map.rows.length * ts, uh = vh - insetTop - insetBottom, tx, ty;
      tx = mw <= vw ? (mw - vw) / 2 : clamp(hero.x * ts - vw / 2, 0, mw - vw);
      ty = mh <= uh ? (mh - uh) / 2 - insetTop : clamp(hero.y * ts - insetTop - uh / 2, -insetTop, Math.max(-insetTop, mh - vh + insetBottom));
      if (snap) { cam.x = tx; cam.y = ty; } else { cam.x += (tx - cam.x) * 0.18; cam.y += (ty - cam.y) * 0.18; }
    }
    function toScreen(x, y) { return { x: x * ts - cam.x, y: y * ts - cam.y }; }
    function toWorld(px, py) { return { x: (px + cam.x) / ts, y: (py + cam.y) / ts }; }
    function rectOf(o) { return { x: o.x, y: o.y, w: o.w || 1, h: o.h || 1 }; }
    function distRect(px, py, r) { var dx = Math.max(r.x - px, 0, px - (r.x + r.w)), dy = Math.max(r.y - py, 0, py - (r.y + r.h)); return Math.sqrt(dx * dx + dy * dy); }
    function interactable(o) { return visible(o) && (o.en || o.act) && o.passive !== true; }

    // ---- collisions et déplacement
    var R = 0.27;
    function blocked(x, y) {
      var x0 = Math.floor(x - R), x1 = Math.floor(x + R), y0 = Math.floor(y - R), y1 = Math.floor(y + R);
      for (var ty = y0; ty <= y1; ty++) for (var tx = x0; tx <= x1; tx++) if (!free(tx, ty)) return true;
      for (var k in actors) { var a = actors[k]; if (a.solid && a.map === mapId && Math.abs(a.x - x) < 0.62 && Math.abs(a.y - y) < 0.62) return true; }
      return false;
    }
    function bfs(sx, sy, goal) { // goal(tx, ty) → bool ; renvoie la liste des cases (sans la case de départ) ou null
      var cols = map.cols, rows = grid.length, prev = {}, q = [[sx, sy]], k0 = sx + ',' + sy, found = null; prev[k0] = null;
      while (q.length) {
        var c = q.shift();
        if (goal(c[0], c[1])) { found = c; break; }
        [[0, 1], [1, 0], [0, -1], [-1, 0]].forEach(function (d) { var nx = c[0] + d[0], ny = c[1] + d[1], k = nx + ',' + ny; if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || k in prev || !free(nx, ny) || actorBlocks(nx, ny)) return; prev[k] = c; q.push([nx, ny]); });
      }
      if (!found) return null;
      var path = []; for (var p = found; p && !(p[0] === sx && p[1] === sy); p = prev[p[0] + ',' + p[1]]) path.unshift(p);
      return path;
    }
    function standTiles(tg) { // cases où se tenir pour interagir avec la cible
      var out = [], add = function (x, y) { if (free(x, y) && !actorBlocks(x, y)) out.push([x, y]); };
      if (tg.type === 'npc') { var a = actors[tg.id], ax = Math.floor(a.x), ay = Math.floor(a.y); add(ax, ay + 1); add(ax - 1, ay); add(ax + 1, ay); add(ax, ay - 1); return out; }
      var o = tg.obj, w = o.w || 1, h = o.h || 1, i;
      if (!isSolid(o) && !o.wall) { for (i = 0; i < w; i++) add(o.x + i, o.y); if (out.length) return out; }
      if (o.face === 'up') { for (i = 0; i < w; i++) add(o.x + i, o.y - 1); return out; }
      for (i = 0; i < w; i++) add(o.x + i, o.y + h);
      if (!o.wall) { for (i = 0; i < h; i++) { add(o.x - 1, o.y + i); add(o.x + w, o.y + i); } for (i = 0; i < w; i++) add(o.x + i, o.y - 1); }
      return out;
    }
    function faceTarget(tg) {
      var cx, cy; if (tg.type === 'npc') { cx = actors[tg.id].x; cy = actors[tg.id].y; } else { cx = tg.obj.x + (tg.obj.w || 1) / 2; cy = tg.obj.y + (tg.obj.h || 1) / 2; }
      var dx = cx - hero.x, dy = cy - hero.y; if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) return;
      hero.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    }
    function pathTo(goal) { var p = bfs(Math.floor(hero.x), Math.floor(hero.y), goal); return p; }
    function goTile(tx, ty, done) {
      if (!free(tx, ty)) { var best = null, bd = 1e9; for (var y = 0; y < grid.length; y++) for (var x = 0; x < map.cols; x++) if (free(x, y)) { var d = Math.abs(x - tx) + Math.abs(y - ty); if (d < bd) { bd = d; best = [x, y]; } } if (!best || bd > 2) return false; tx = best[0]; ty = best[1]; }
      var p = pathTo(function (x, y) { return x === tx && y === ty; }); if (!p) return false;
      hero.path = p; hero.onArrive = done || null; return true;
    }
    function goTarget(tg, done) {
      var st = standTiles(tg), set = {}; st.forEach(function (c) { set[c[0] + ',' + c[1]] = 1; }); if (!st.length) return false;
      var p = pathTo(function (x, y) { return set[x + ',' + y] === 1; }); if (!p) return false;
      hero.path = p; hero.onArrive = function () { faceTarget(tg); if (done) done(); }; return true;
    }
    function moveHero(dt) {
      var vx = 0, vy = 0, k = input.keys;
      if (!locked && !talk && !menu && !hero.hidden && !fading) {
        vx = input.jx + ((k.ArrowRight || k.d) ? 1 : 0) - ((k.ArrowLeft || k.a || k.q) ? 1 : 0);
        vy = input.jy + ((k.ArrowDown || k.s) ? 1 : 0) - ((k.ArrowUp || k.w || k.z) ? 1 : 0);
        if (vx || vy) { hero.path = null; hero.onArrive = null; }
        else if (hero.path) {
          if (!hero.path.length) { hero.path = null; var cb = hero.onArrive; hero.onArrive = null; persistPos(); if (cb) cb(); }
          else { var n = hero.path[0], gx = n[0] + 0.5, gy = n[1] + 0.5, dx = gx - hero.x, dy = gy - hero.y, d = Math.sqrt(dx * dx + dy * dy), stepLen = hero.speed * dt; if (d <= stepLen + 0.02) { hero.x = gx; hero.y = gy; hero.path.shift(); hero.moving = true; if (Math.abs(dx) > Math.abs(dy)) hero.dir = dx > 0 ? 'right' : 'left'; else if (Math.abs(dy) > 0.01) hero.dir = dy > 0 ? 'down' : 'up'; return; } vx = dx / d; vy = dy / d; hero.x += vx * stepLen; hero.y += vy * stepLen; hero.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'); hero.moving = true; return; }
        }
      } else if (hero.path && (talk || menu)) { hero.path = null; hero.onArrive = null; }
      var len = Math.sqrt(vx * vx + vy * vy);
      if (len < 0.18) { hero.moving = false; return; }
      if (len > 1) { vx /= len; vy /= len; }
      hero.dir = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'right' : 'left') : (vy > 0 ? 'down' : 'up');
      var sp = hero.speed * dt, nx = hero.x + vx * sp, ny = hero.y + vy * sp, moved = false;
      if (!blocked(nx, hero.y)) { hero.x = nx; moved = true; } else { var sx = Math.floor(hero.y) + 0.5 - hero.y; if (Math.abs(vy) < 0.3 && Math.abs(sx) > 0.02 && !blocked(hero.x + Math.sign(vx) * 0.3, Math.floor(hero.y) + 0.5)) { hero.y += Math.sign(sx) * Math.min(Math.abs(sx), sp); moved = true; } }
      if (!blocked(hero.x, ny)) { hero.y = ny; moved = true; } else { var sy = Math.floor(hero.x) + 0.5 - hero.x; if (Math.abs(vx) < 0.3 && Math.abs(sy) > 0.02 && !blocked(Math.floor(hero.x) + 0.5, hero.y + Math.sign(vy) * 0.3)) { hero.x += Math.sign(sy) * Math.min(Math.abs(sy), sp); moved = true; } }
      hero.moving = moved || len > 0.18;
    }
    function moveActor(a, dt) {
      if (a.follow) { // Pico : volette derrière le héros
        var d = DIRS[hero.dir], gx = hero.x - d[0] * 0.75 + (d[0] ? 0 : 0.55), gy = hero.y - d[1] * 0.6 - 0.1;
        if (a.map !== mapId) { a.map = mapId; a.x = gx; a.y = gy; }
        var dx = gx - a.x, dy = gy - a.y; a.x += dx * Math.min(1, dt * 4); a.y += dy * Math.min(1, dt * 4); a.moving = Math.abs(dx) + Math.abs(dy) > 0.15; if (Math.abs(dx) > 0.05) a.dir = dx > 0 ? 'right' : 'left'; return;
      }
      if (a.path && a.path.length) {
        var n = a.path[0], tx = n[0] + 0.5, ty = n[1] + 0.5, ex = tx - a.x, ey = ty - a.y, dd = Math.sqrt(ex * ex + ey * ey), st = (a.speed || 3.4) * dt;
        a.moving = true; a.dir = Math.abs(ex) > Math.abs(ey) ? (ex > 0 ? 'right' : 'left') : (ey > 0 ? 'down' : 'up');
        if (dd <= st) { a.x = tx; a.y = ty; a.path.shift(); if (!a.path.length) { a.moving = false; var cb = a.onArrive; a.onArrive = null; if (cb) cb(); } } else { a.x += ex / dd * st; a.y += ey / dd * st; }
        return;
      }
      a.moving = false;
      if (a.wander && a.map === mapId && !a.busy) { a.wt = (a.wt || 2) - dt; if (a.wt <= 0) { a.wt = 2.5 + Math.random() * 3; var w = a.wander, gx2 = w.x + Math.floor(Math.random() * w.w), gy2 = w.y + Math.floor(Math.random() * w.h); if (free(gx2, gy2) && !(Math.floor(hero.x) === gx2 && Math.floor(hero.y) === gy2)) sendActor(a.id, gx2, gy2); } }
    }
    function sendActor(id, tx, ty, done) {
      var a = actors[id]; if (!a) return false;
      if (a.map !== mapId) { a.x = tx + 0.5; a.y = ty + 0.5; if (done) done(); return true; }
      var wasSolid = a.solid; a.solid = false;
      var cols = map.cols, rows = grid.length, sx = Math.floor(a.x), sy = Math.floor(a.y), prev = {}, q = [[sx, sy]], found = null; prev[sx + ',' + sy] = null;
      while (q.length) { var c = q.shift(); if (c[0] === tx && c[1] === ty) { found = c; break; } [[0, 1], [1, 0], [0, -1], [-1, 0]].forEach(function (d) { var nx = c[0] + d[0], ny = c[1] + d[1], k = nx + ',' + ny; if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || k in prev || !free(nx, ny)) return; prev[k] = c; q.push([nx, ny]); }); }
      a.solid = wasSolid;
      if (!found) { a.x = tx + 0.5; a.y = ty + 0.5; if (done) done(); return true; }
      var path = []; for (var p = found; p && !(p[0] === sx && p[1] === sy); p = prev[p[0] + ',' + p[1]]) path.unshift(p);
      a.path = path; a.onArrive = done || null; if (!path.length && done) { a.onArrive = null; done(); }
      return true;
    }

    // ---- passages, zones
    function warpAt(x, y) { var ws = map.warps || []; for (var i = 0; i < ws.length; i++) { var w = ws[i]; if (x >= w.x && x < w.x + (w.w || 1) && y >= w.y && y < w.y + (w.h || 1)) return w; } return null; }
    function warpOk(w) { if (w.if) { var k = w.if, neg = k.charAt(0) === '!'; if (neg) k = k.slice(1); if (neg ? !!save.flags[k] : !save.flags[k]) return false; } return !dir8.canWarp || dir8.canWarp(w) !== false; }
    function fade(mid, done) {
      fading = true; el.fade.classList.add('on');
      setTimeout(function () { if (destroyed) return; mid(); camera(true); setTimeout(function () { if (destroyed) return; el.fade.classList.remove('on'); fading = false; if (done) done(); }, 120); }, hooks.reduced && hooks.reduced() ? 20 : 200);
    }
    function enter(m, x, y, d, silent) { setMap(m); hero.x = x + 0.5; hero.y = y + 0.5; if (d) hero.dir = d; hero.path = null; hero.onArrive = null; hideLabel(); persistPos(); if (!silent && dir8.enterMap) dir8.enterMap(m); checkZone(); }
    function doWarp(w) { if (hooks.sound) hooks.sound('page'); var from = mapId; fade(function () { enter(w.to.map, w.to.x, w.to.y, w.to.dir); if (dir8.onWarp) dir8.onWarp(w, from); }); }
    function zoneAt(x, y) { var zs = map.zones || []; for (var i = 0; i < zs.length; i++) { var z = zs[i]; if (x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h) return z; } return null; }
    function checkZone() {
      var z = zoneAt(hero.x, hero.y), id = z ? z.id : null; if (id === zoneId) return; zoneId = id;
      if (z) { var first = !save.seen['zone:' + z.id]; save.seen['zone:' + z.id] = 1; showRoom(z, first); if (first && z.word && hooks.onWord) hooks.onWord(z.word); }
      if (dir8.enterZone) dir8.enterZone(id);
    }
    function persistPos() { save.map = mapId; save.x = Math.round(hero.x * 100) / 100; save.y = Math.round(hero.y * 100) / 100; save.dir = hero.dir; if (hooks.persist) hooks.persist(); }

    // ---- interface : bulles, étiquettes, menu
    function frBlock(fr) { var help = hooks.frHelp ? hooks.frHelp() : 'tap'; if (!fr || help === 'never') return ''; return help === 'always' ? '<div class="w-fr">' + esc(fr) + '</div>' : '<div class="w-fr hidden" data-role="fr">' + esc(fr) + '</div>'; }
    function frBtn(fr) { var help = hooks.frHelp ? hooks.frHelp() : 'tap'; return fr && help === 'tap' ? '<button class="w-tool" data-w="fr" aria-label="' + esc(ui.frLabel || 'Traduction') + '"><span class="emoji">🇫🇷</span></button>' : ''; }
    function sayHtml(l, dialog) {
      var who = l.who || 'mum', a = cfg.portraits && cfg.portraits[who] ? cfg.portraits[who]() : '', en = l.en, name = (cfg.names && cfg.names[who]) || '';
      return '<div class="w-say-face">' + a + '</div><div class="w-say-body">' + (name ? '<div class="w-say-name">' + esc(name) + (l.tag ? ' <i>' + esc(l.tag) + '</i>' : '') + '</div>' : '') +
        (en ? '<div class="w-say-en' + (en.length > 30 ? ' long' : '') + '" lang="en">' + esc(en) + '</div>' + frBlock(l.fr) : '<div class="w-say-frtext">' + esc(l.fr || '') + '</div>') + '</div>' +
        '<div class="w-say-tools">' + (en ? '<button class="w-tool" data-w="speak" data-text="' + esc(en) + '" aria-label="' + esc(ui.listen || 'Écouter') + '">' + SPEAKER + '</button>' + frBtn(l.fr) : '') + '</div>' + (dialog ? '<div class="w-say-next" aria-hidden="true">▼</div>' : '');
    }
    var sayLine = null;
    function say(l, opts) { // consigne persistante (ou null pour effacer)
      opts = opts || {}; clearTimeout(sayRestore);
      if (!l) { sayLine = null; if (!talk) el.say.classList.add('hidden'); return; }
      if (!opts.temp) sayLine = l;
      if (talk) return;
      el.say.className = 'w-say who-' + (l.who || 'mum') + (opts.cls ? ' ' + opts.cls : ''); el.say.innerHTML = sayHtml(l, false);
      if (window.FX) window.FX.once(el.say, opts.cls === 'oops' ? 'w-shake' : 'w-pop', 450);
      if (l.en && !opts.silent && hooks.speak) hooks.speak(l.en);
      if (opts.temp) sayRestore = setTimeout(function () { if (!destroyed && !talk) { if (sayLine) say(sayLine, { silent: true }); else el.say.classList.add('hidden'); } }, opts.temp);
    }
    function startTalk(lines, done) {
      lines = (lines || []).filter(Boolean); if (!lines.length) { if (done) done(); return; }
      talk = { lines: lines, i: -1, done: done, t0: 0 }; hero.path = null; input.jx = input.jy = 0; hideLabel(); nextTalk();
    }
    function nextTalk() {
      if (!talk) return; if (Date.now() - talk.t0 < 250) return;
      talk.i++; talk.t0 = Date.now();
      if (talk.i >= talk.lines.length) { var d = talk.done; talk = null; if (hooks.stopSpeak) hooks.stopSpeak(); if (sayLine) say(sayLine, { silent: true }); else el.say.classList.add('hidden'); if (d) d(); return; }
      var l = talk.lines[talk.i]; el.say.className = 'w-say dialog who-' + (l.who || 'mum'); el.say.innerHTML = sayHtml(l, true);
      if (window.FX) window.FX.once(el.say, 'w-pop', 400);
      if (hooks.sound) hooks.sound('page'); if (l.en && hooks.speak) hooks.speak(l.en);
    }
    function pico(text, ms) { if (!text) { el.pico.classList.add('hidden'); return; } el.pico.innerHTML = '<div class="w-pico-face">' + (cfg.portraits && cfg.portraits.pico ? cfg.portraits.pico() : '') + '</div><div class="w-pico-txt">' + text + '</div>'; el.pico.classList.remove('hidden'); if (window.FX) window.FX.once(el.pico, 'w-pop', 400); picoT = ms === 0 ? 1e9 : (ms || 6500) / 1000; }
    function hideLabel() { el.label.classList.add('hidden'); labelT = 0; labelAnchor = null; }
    function label(anchor, en, fr, opts) {
      opts = opts || {}; labelAnchor = anchor; labelT = opts.ms ? opts.ms / 1000 : 3.6;
      el.label.innerHTML = (opts.art || '') + '<span class="w-label-txt"><b lang="en">' + esc(en) + '</b>' + (fr && (!hooks.frHelp || hooks.frHelp() !== 'never') ? '<small>' + esc(fr) + '</small>' : '') + '</span><span class="w-label-say">' + SPEAKER + '</span>';
      el.label.setAttribute('data-text', en); el.label.classList.remove('hidden'); placeLabel(); if (window.FX) window.FX.once(el.label, 'w-pop', 350);
      if (!opts.silent && hooks.speak) hooks.speak(en);
    }
    function placeLabel() {
      if (!labelAnchor) return; var p = toScreen(labelAnchor.x, labelAnchor.y), w = el.label.offsetWidth || 160, h = el.label.offsetHeight || 56;
      var top = p.y - h - 10, below = top < insetTop - 6;
      if (below) top = toScreen(labelAnchor.x, labelAnchor.yb !== undefined ? labelAnchor.yb : labelAnchor.y + 1).y + 10;
      el.label.classList.toggle('below', below);
      el.label.style.left = clamp(p.x - w / 2, 6, vw - w - 6) + 'px'; el.label.style.top = clamp(top, insetTop - 6, vh - h - 8) + 'px';
    }
    function showRoom(z, speak) { if (!z.en) return; el.room.innerHTML = '<b lang="en">' + esc(z.en) + '</b>' + (z.fr ? '<small>' + esc(z.fr) + '</small>' : ''); el.room.classList.remove('hidden'); roomT = 2.6; el.room.style.top = Math.round(insetTop + 8) + 'px'; if (window.FX) window.FX.once(el.room, 'w-pop', 350); if (speak && hooks.speak && !talk) hooks.speak(z.en); }
    function openMenu(m, done) { // m : { title: {en, fr}, options: [{ id, en, fr, art, html }] }
      menu = { def: m, done: done }; hero.path = null; input.jx = input.jy = 0; hideLabel();
      el.menu.innerHTML = '<div class="w-menu-card">' + (m.title ? '<div class="w-menu-title">' + esc(m.title) + '</div>' : '') + '<div class="w-menu-grid n' + m.options.length + '">' + m.options.map(function (o) { return '<button class="w-opt" data-w="opt" data-id="' + esc(o.id) + '">' + (o.html || '') + '<b lang="en">' + esc(o.en) + '</b></button>'; }).join('') + '</div>' + (m.cancel ? '<button class="w-menu-x" data-w="opt" data-id="">' + esc(m.cancel) + '</button>' : '') + '</div>';
      el.menu.classList.remove('hidden'); if (window.FX) window.FX.once(el.menu.firstChild, 'w-pop', 350);
    }
    function pickMenu(id) { if (!menu) return; var m = menu; menu = null; el.menu.classList.add('hidden'); if (m.done) m.done(id || null); }
    function banner(b) { b = b || {}; el.ben.textContent = b.en || ''; el.bfr.textContent = b.fr || ''; el.bico.textContent = b.icon || '📜'; el.bfr.classList.toggle('hidden', !b.fr); }

    // ---- cible du bouton A
    function findTarget() {
      if (talk || menu || fading) return null;
      if (dir8.forcedTarget) { var ft = dir8.forcedTarget(); if (ft) return ft; }
      if (hero.hidden) return null;
      var best = null, bs = 1e9, d = DIRS[hero.dir];
      map.objects.forEach(function (o) {
        if (!interactable(o)) return;
        var r = rectOf(o), dist = distRect(hero.x, hero.y, r), reach = isSolid(o) || o.wall ? 0.66 : 0.5; if (dist > reach) return;
        var cx = r.x + r.w / 2 - hero.x, cy = r.y + r.h / 2 - hero.y, n = Math.sqrt(cx * cx + cy * cy) || 1, sc = dist - 0.3 * ((cx * d[0] + cy * d[1]) / n) - (o.prio || 0) - (objective.indexOf(o.id) >= 0 ? 0.45 : 0);
        if (sc < bs) { bs = sc; best = { type: 'obj', id: o.id, obj: o }; }
      });
      for (var k in actors) { var a = actors[k]; if (a.map !== mapId || !a.talk || a.hidden) continue; var dx = a.x - hero.x, dy = a.y - hero.y, dd = Math.sqrt(dx * dx + dy * dy); if (dd > 1.15) continue; var s2 = dd - 0.45 - 0.3 * ((dx * d[0] + dy * d[1]) / (dd || 1)); if (s2 < bs) { bs = s2; best = { type: 'npc', id: a.id, actor: a }; } }
      return best;
    }
    function defaultInteract(tg) {
      if (tg.type !== 'obj') return; var o = tg.obj; if (!o.en) return;
      var first = !save.seen[o.id]; save.seen[o.id] = 1;
      label({ x: o.x + (o.w || 1) / 2, y: o.y - (o.tall || 0) }, o.en, o.fr);
      if (o.word && hooks.onWord) hooks.onWord(o.word);
      if (first && hooks.persist) hooks.persist();
    }
    function interact(forced) {
      if (destroyed || fading) return false;
      if (talk) { nextTalk(); return true; }
      if (menu) return false;
      var tg = (forced && forced.type) ? forced : findTarget(); if (!tg) return false;
      if (tg.type === 'obj' || tg.type === 'npc') faceTarget(tg);
      if (hooks.sound) hooks.sound('click');
      idle = 0;
      if (dir8.interact && dir8.interact(tg) === true) return true;
      defaultInteract(tg); return true;
    }

    // ---- boucle
    function update(dt) {
      t += dt;
      moveHero(dt);
      for (var k in actors) moveActor(actors[k], dt);
      if (!fading && !hero.hidden) { var w = warpAt(hero.x, hero.y); if (w) { if (warpOk(w)) doWarp(w); } else checkZone(); }
      if (labelT > 0) { labelT -= dt; if (labelT <= 0) hideLabel(); }
      if (roomT > 0) { roomT -= dt; if (roomT <= 0) el.room.classList.add('hidden'); }
      if (picoT > 0 && picoT < 1e8) { picoT -= dt; if (picoT <= 0) el.pico.classList.add('hidden'); }
      if (!talk && !menu && !locked) { idle += dt; if (idle > 20) { idle = 0; if (dir8.idleHint) dir8.idleHint(); } }
      if (dir8.tick) dir8.tick(dt);
      target = findTarget();
      var show = !!target && !talk && !menu;
      if (el.a.classList.contains('hidden') === show) el.a.classList.toggle('hidden', !show);
      var verb = show ? ((dir8.verb && dir8.verb(target)) || (target.type === 'npc' ? ui.talk : ui.look) || '') : ''; if (el.averb.textContent !== verb) el.averb.textContent = verb;
      el.a.classList.toggle('gold', show && isObjective(target));
      hero.saveT = (hero.saveT || 0) + dt; if (hero.saveT > 4 && !hero.moving) { hero.saveT = 0; if (Math.abs((save.x || 0) - hero.x) > 0.3 || Math.abs((save.y || 0) - hero.y) > 0.3 || save.map !== mapId) persistPos(); }
    }
    function isObjective(tg) { return objective.some(function (o) { return (tg.type === 'npc' ? 'npc:' + tg.id : tg.id) === o; }); }
    function objectivePoints() { // points (carte courante) à signaler : objets, PNJ, ou passage vers une autre carte
      var pts = [];
      objective.forEach(function (id) {
        var m, x, y;
        if (id.indexOf('npc:') === 0) { var a = actors[id.slice(4)]; if (!a || a.hidden) return; m = a.map; x = a.x; y = a.y - 1.25; }
        else if (id.indexOf('map:') === 0) { m = id.slice(4); x = y = 0; }
        else if (id.indexOf('zone:') === 0) { var zid = id.slice(5); Object.keys(def.maps).forEach(function (mm) { (def.maps[mm].zones || []).forEach(function (z) { if (z.id === zid) { m = mm; x = z.x + z.w / 2; y = z.y + z.h / 2 - 0.4; } }); }); if (!m) return; }
        else { var o = objById[id]; if (!o || !visible(o)) return; m = o.map; x = o.x + (o.w || 1) / 2; y = o.y - (o.tall || 0) - 0.15; }
        if (m === mapId && id.indexOf('map:') !== 0) { pts.push({ x: x, y: y, zone: id.indexOf('zone:') === 0 }); return; }
        var w = nextWarp(mapId, m); if (w) pts.push({ x: w.x + (w.w || 1) / 2, y: w.y + (w.h || 1) / 2 - 0.7, warp: true });
      });
      return pts;
    }
    function nextWarp(from, to) { // premier passage sur le chemin entre deux cartes
      if (from === to) return null; var seen = {}, q = [[from, null]]; seen[from] = 1;
      while (q.length) { var c = q.shift(); var ws = def.maps[c[0]].warps || []; for (var i = 0; i < ws.length; i++) { var w = ws[i], first = c[1] || w; if (w.to.map === to) return first; if (!seen[w.to.map]) { seen[w.to.map] = 1; q.push([w.to.map, first]); } } }
      return null;
    }
    function draw() {
      renderLayer(); insets(); camera(false);
      var c = ctx; c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.fillStyle = map.bg || '#2B2233'; c.fillRect(0, 0, vw, vh);
      c.drawImage(layer, Math.round(-cam.x * dpr) / dpr, Math.round(-cam.y * dpr) / dpr, layer.width / dpr, layer.height / dpr);
      var list = [], f = save.flags;
      map.objects.forEach(function (o) { if (visible(o)) list.push({ o: o, z: FLAT[o.kind] ? -1e3 + o.y : o.wall ? o.y + 0.99 : o.y + (o.h || 1) - (isSolid(o) ? 0 : 0.45) }); });
      if (!hero.hidden) list.push({ a: hero, z: hero.y + 0.3 });
      for (var k in actors) { var a = actors[k]; if (a.map === mapId && !a.hidden) list.push({ a: a, z: a.y + 0.3 + (a.fly ? 0.4 : 0) }); }
      list.sort(function (p, q) { return p.z - q.z; });
      list.forEach(function (it) {
        if (it.o) {
          var o = it.o, s = objSprite(o), p = toScreen(o.x, o.y - (o.tall || 0));
          if (s) c.drawImage(s.c, Math.round(p.x), Math.round(p.y), (o.w || 1) * ts, ((o.h || 1) + (o.tall || 0)) * ts);
          if (interactable(o) && !save.seen[o.id] && !hero.hidden && o.en) { var tw = 0.5 + 0.5 * Math.sin(t * 3 + o.x * 1.7 + o.y); c.globalAlpha = 0.35 + tw * 0.55; c.fillStyle = '#FFF6C8'; var sxp = p.x + (o.w || 1) * ts - ts * 0.2, syp = p.y + ts * 0.2, rr = ts * (0.07 + tw * 0.05); c.beginPath(); c.moveTo(sxp, syp - rr * 2); c.lineTo(sxp + rr * 0.6, syp - rr * 0.6); c.lineTo(sxp + rr * 2, syp); c.lineTo(sxp + rr * 0.6, syp + rr * 0.6); c.lineTo(sxp, syp + rr * 2); c.lineTo(sxp - rr * 0.6, syp + rr * 0.6); c.lineTo(sxp - rr * 2, syp); c.lineTo(sxp - rr * 0.6, syp - rr * 0.6); c.closePath(); c.fill(); c.globalAlpha = 1; }
        } else drawActor(c, it.a);
      });
      if (dir8.draw) dir8.draw(c, { toScreen: toScreen, ts: ts, t: t, map: mapId });
      // objectif : « ! » doré qui rebondit, flèche au bord de l'écran s'il est hors champ
      objectivePoints().forEach(function (pt) {
        var p = toScreen(pt.x, pt.y), bob = Math.abs(Math.sin(t * 4)) * ts * 0.16, r = ts * 0.24;
        var inView = p.x > 20 && p.x < vw - 20 && p.y > insetTop - 30 && p.y < vh - 30;
        if (inView) {
          var bx = p.x, by = p.y - r - bob - (pt.zone ? 0 : 2);
          c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.ellipse(bx, p.y + (pt.warp || pt.zone ? ts * 0.7 : 4), r * 0.7, r * 0.22, 0, 0, 7); c.fill();
          c.fillStyle = '#F5B833'; c.strokeStyle = '#8A5A00'; c.lineWidth = 3; c.beginPath(); c.arc(bx, by, r, 0, 7); c.fill(); c.stroke();
          c.fillStyle = '#fff'; c.beginPath(); c.arc(bx - r * 0.3, by - r * 0.35, r * 0.22, 0, 7); c.fill();
          c.fillStyle = '#5A3A00'; c.font = '900 ' + Math.round(r * 1.5) + 'px Baloo 2, Nunito, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('!', bx, by + 1);
        } else {
          var cx = vw / 2, cy = insetTop + (vh - insetTop - insetBottom) / 2, ang = Math.atan2(p.y - cy, p.x - cx), m = 34;
          var ex = clamp(p.x, m, vw - m), ey = clamp(p.y, insetTop + 6, vh - insetBottom - 6), pul = 1 + 0.12 * Math.sin(t * 6);
          c.save(); c.translate(ex, ey); c.rotate(ang); c.scale(pul, pul); c.fillStyle = '#F5B833'; c.strokeStyle = '#8A5A00'; c.lineWidth = 3; c.beginPath(); c.moveTo(20, 0); c.lineTo(-10, -16); c.lineTo(-4, 0); c.lineTo(-10, 16); c.closePath(); c.fill(); c.stroke(); c.restore();
        }
      });
      if (target && !talk && !menu && target.type === 'obj') { var o2 = target.obj, p2 = toScreen(o2.x, o2.y - (o2.tall || 0)); c.strokeStyle = 'rgba(255,255,255,' + (0.55 + 0.3 * Math.sin(t * 6)) + ')'; c.lineWidth = 3; c.setLineDash([8, 6]); c.lineDashOffset = -t * 20; var pad = 3; c.strokeRect(p2.x - pad, p2.y - pad, (o2.w || 1) * ts + pad * 2, ((o2.h || 1) + (o2.tall || 0)) * ts + pad * 2); c.setLineDash([]); }
      placeLabel();
    }
    function drawActor(c, a) {
      var p = toScreen(a.x, a.y), size = ts * (a.size || 1.22), s = actorSprite(a), bob = a.moving && !a.fly ? Math.abs(Math.sin(t * 14)) * ts * 0.03 : 0, lift = a.fly ? ts * (0.75 + 0.08 * Math.sin(t * 5)) : 0;
      c.fillStyle = 'rgba(0,0,0,.18)'; c.beginPath(); c.ellipse(p.x, p.y + ts * 0.3, size * (a.fly ? 0.16 : 0.26), size * 0.08, 0, 0, 7); c.fill();
      if (!s) { c.fillStyle = '#F5B833'; c.beginPath(); c.arc(p.x, p.y - ts * 0.1, ts * 0.25, 0, 7); c.fill(); return; }
      var flip = (a.pose || a.flipX) && a.dir === 'right';
      if (flip) { c.save(); c.translate(p.x, 0); c.scale(-1, 1); c.drawImage(s.c, -size / 2, p.y + ts * 0.36 - size - bob - lift, size, size); c.restore(); }
      else c.drawImage(s.c, p.x - size / 2, p.y + ts * 0.36 - size - bob - lift, size, size);
      if (a === hero && hero.carry) { var cs = sprite('art:' + hero.carry, 100, 100, function () { return window.Props.art(hero.carry, 100); }); if (cs) c.drawImage(cs.c, p.x - ts * 0.3, p.y + ts * 0.36 - size - ts * 0.42 - bob, ts * 0.6, ts * 0.6); }
      if (a.mark) { c.font = Math.round(ts * 0.42) + 'px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(a.mark, p.x + size * 0.36, p.y - size * 0.62 - lift); }
    }
    function frame(now) {
      raf = 0; if (destroyed || paused) return;
      var dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
      try { update(dt); draw(); } catch (e) { if (window.console) console.error('World : ' + (e && e.stack || e)); destroyed = true; return; }
      raf = requestAnimationFrame(frame);
    }
    function start() { if (!raf && !destroyed && !paused) { last = performance.now(); raf = requestAnimationFrame(frame); } }

    // ---- entrées
    function onDown(e) {
      if (e.target !== canvas || input.pid !== null) return;
      if (talk) { nextTalk(); return; }
      if (menu) return;
      input.pid = e.pointerId; input.sx = e.clientX; input.sy = e.clientY; input.st = Date.now(); input.stick = false;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }
    function onMove(e) {
      if (e.pointerId !== input.pid) return;
      var dx = e.clientX - input.sx, dy = e.clientY - input.sy, d = Math.sqrt(dx * dx + dy * dy), max = 46;
      if (!input.stick && d > 12) { input.stick = true; var r = wrap.getBoundingClientRect(); el.stick.style.left = (input.sx - r.left) + 'px'; el.stick.style.top = (input.sy - r.top) + 'px'; el.stick.classList.remove('hidden'); }
      if (input.stick) { var k = d > max ? max / d : 1; el.stick.firstChild.style.transform = 'translate(' + dx * k + 'px,' + dy * k + 'px)'; input.jx = clamp(dx / max, -1, 1); input.jy = clamp(dy / max, -1, 1); if (d < 10) { input.jx = input.jy = 0; } idle = Math.min(idle, 12); }
      e.preventDefault();
    }
    function onUp(e) {
      if (e.pointerId !== input.pid) return;
      var wasStick = input.stick, quick = Date.now() - input.st < 450; input.pid = null; input.stick = false; input.jx = input.jy = 0; el.stick.classList.add('hidden');
      if (!wasStick && quick && e.type !== 'pointercancel') { var r = wrap.getBoundingClientRect(); tap(e.clientX - r.left, e.clientY - r.top); }
    }
    function hitTest(px, py) {
      var best = null, k;
      for (k in actors) { var a = actors[k]; if (a.map !== mapId || a.hidden) continue; var p = toScreen(a.x, a.y), size = ts * (a.size || 1.22), lift = a.fly ? ts * 0.75 : 0; if (px > p.x - size * 0.4 && px < p.x + size * 0.4 && py > p.y + ts * 0.36 - size - lift && py < p.y + ts * 0.36 - lift) { if (a.talk) best = { type: 'npc', id: a.id, actor: a }; else if (a.onTap) return { type: 'tap', actor: a }; } }
      if (best) return best;
      // plusieurs objets sous le doigt : l'objectif en cours d'abord, sinon le plus petit (le plus précis), sinon celui du dessus
      var hits = [];
      for (var i = map.objects.length - 1; i >= 0; i--) { var o = map.objects[i]; if (!interactable(o) || FLAT[o.kind]) continue; var q = toScreen(o.x, o.y - (o.tall || 0)); if (px >= q.x && px <= q.x + (o.w || 1) * ts && py >= q.y && py <= q.y + ((o.h || 1) + (o.tall || 0)) * ts) hits.push(o); }
      if (!hits.length) return null;
      var pick = hits.filter(function (o) { return objective.indexOf(o.id) >= 0; })[0];
      if (!pick) { pick = hits[0]; hits.forEach(function (o) { if ((o.w || 1) * ((o.h || 1) + (o.tall || 0)) < (pick.w || 1) * ((pick.h || 1) + (pick.tall || 0))) pick = o; }); }
      return { type: 'obj', id: pick.id, obj: pick };
    }
    function tap(px, py) {
      if (locked || hero.hidden || fading) { if (hero.hidden && dir8.forcedTarget && dir8.forcedTarget()) interact(); return; }
      var h = hitTest(px, py); idle = Math.min(idle, 12);
      if (h && h.type === 'tap') { h.actor.onTap(); return; }
      // une porte ouverte qu'on touche : on la traverse (pour la refermer, c'est le bouton A)
      if (h && h.type === 'obj' && h.obj.wall && free(h.obj.x, h.obj.y) && (map.warps || []).some(function (w) { return w.x === h.obj.x && w.y === h.obj.y; })) { goTile(h.obj.x, h.obj.y); return; }
      if (h) { var cur2 = findTarget(); if (cur2 && cur2.id === h.id && cur2.type === h.type) { interact(); return; } }
      // on a touché un objet ou un personnage : le héros y va et agit dessus en arrivant (c'est bien lui qu'on a choisi)
      if (h) { if (goTarget(h, function () { if (talk || menu || locked) return; if (h.type === 'npc' && (!h.actor || h.actor.map !== mapId || h.actor.hidden)) return; if (h.type === 'obj' && !visible(h.obj)) return; interact(h); })) return; }
      var w = toWorld(px, py); goTile(Math.floor(w.x), Math.floor(w.y));
    }
    function onKey(e) {
      if (destroyed || paused || !wrap.isConnected) return;
      if (document.getElementById('modals') && document.getElementById('modals').firstChild) return;
      var k = e.key.length === 1 ? e.key.toLowerCase() : e.key, down = e.type === 'keydown';
      if (k === ' ' || k === 'Enter') { if (down && !e.repeat) { interact(); } e.preventDefault(); return; }
      if (/^(Arrow(Up|Down|Left|Right)|[wasdzq])$/.test(k)) { input.keys[k] = down; if (down) idle = Math.min(idle, 12); e.preventDefault(); }
    }
    function onClick(e) {
      var a = e.target.closest('[data-w]'); if (!a) return;
      var act = a.getAttribute('data-w');
      if (act === 'a') interact();
      else if (act === 'back') { if (hooks.onBack) hooks.onBack(); }
      else if (act === 'list') { if (hooks.onList) hooks.onList(); }
      else if (act === 'speak') { e.stopPropagation(); if (hooks.speak) hooks.speak(a.getAttribute('data-text')); }
      else if (act === 'fr') { e.stopPropagation(); var fr = el.say.querySelector('[data-role="fr"]'); if (fr) fr.classList.toggle('hidden'); if (hooks.onFr) hooks.onFr(); }
      else if (act === 'say-next') { if (talk) nextTalk(); }
      else if (act === 'label') { if (hooks.speak) hooks.speak(el.label.getAttribute('data-text')); labelT = 3; }
      else if (act === 'pico-close') { el.pico.classList.add('hidden'); picoT = 0; }
      else if (act === 'opt') pickMenu(a.getAttribute('data-id'));
    }
    function onVis() { if (document.visibilityState === 'hidden') { paused = true; if (raf) cancelAnimationFrame(raf); raf = 0; input.keys = {}; input.jx = input.jy = 0; persistPos(); if (hooks.flush) hooks.flush(); } else { paused = false; start(); } }
    function onResize() { resize(); camera(true); }
    function onPageHide() { persistPos(); if (hooks.flush) hooks.flush(); }
    canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    wrap.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey); document.addEventListener('keyup', onKey);
    document.addEventListener('visibilitychange', onVis); window.addEventListener('resize', onResize); window.addEventListener('pagehide', onPageHide);

    // ---- API
    var api = {
      get map() { return mapId; }, hero: hero, actors: actors, def: def, save: save,
      flag: function (k) { return save.flags[k]; },
      setFlag: function (k, v) { if (v) save.flags[k] = v; else delete save.flags[k]; buildGrid(); },
      setFlags: function (o) { Object.keys(o || {}).forEach(function (k) { if (o[k]) save.flags[k] = o[k]; else delete save.flags[k]; }); buildGrid(); },
      visible: function (id) { var o = objById[id]; return !!o && visible(o); }, cond: cond, wrap: wrap,
      addActor: function (id, a) { actors[id] = Object.assign({ id: id, x: 0, y: 0, dir: 'down', map: null, moving: false }, a); return actors[id]; },
      place: function (id, pos) { var a = id === 'hero' ? hero : actors[id]; if (!a || !pos) return; if (id === 'hero') { if (pos.map && pos.map !== mapId) setMap(pos.map); hero.x = pos.x + 0.5; hero.y = pos.y + 0.5; hero.dir = pos.dir || hero.dir; hero.path = null; camera(true); checkZone(); return; } a.map = pos.map || a.map; a.x = pos.x + 0.5; a.y = pos.y + 0.5; if (pos.dir) a.dir = pos.dir; a.path = null; a.hidden = !!pos.hidden; },
      send: sendActor, goTarget: function (id) { var tg = resolve(id); return tg ? goTarget(tg) : false; },
      say: say, talk: startTalk, pico: pico, label: label, hideLabel: hideLabel, menu: openMenu, banner: banner, fade: fade,
      objective: function (ids) { objective = (ids || []).filter(Boolean); }, progress: function () { idle = 0; },
      lock: function (v) { locked = Math.max(0, locked + (v ? 1 : -1)); if (v) { hero.path = null; input.jx = input.jy = 0; } },
      teleport: function (m, x, y, d) { enter(m, x, y, d, true); camera(true); },
      object: function (id) { return objById[id] || null; }, refresh: function () { buildGrid(); },
      zone: function () { return zoneId; }, interact: function () { return interact(); }, persist: persistPos,
      pause: function () { paused = true; if (raf) cancelAnimationFrame(raf); raf = 0; }, resume: function () { if (destroyed) return; paused = false; input.keys = {}; input.jx = input.jy = 0; input.pid = null; el.stick.classList.add('hidden'); start(); },
      refreshHero: function () { hero.ver = (hero.ver || 0) + 1; },
      topInset: function () { return insetTop; },
      screenOf: function (id) { var tg = resolve(id), r = wrap.getBoundingClientRect(), p; if (!tg) return null; if ((tg.type === 'npc' ? tg.actor.map : tg.obj.map) !== mapId) return null; if (tg.type === 'npc') p = toScreen(tg.actor.x, tg.actor.y - 0.4); else p = toScreen(tg.obj.x + (tg.obj.w || 1) / 2, tg.obj.y + (tg.obj.h || 1) - 0.5); return { x: p.x + r.left, y: p.y + r.top }; },
      destroy: function () { if (destroyed) return; persistPos(); destroyed = true; if (raf) cancelAnimationFrame(raf); clearTimeout(sayRestore); document.removeEventListener('keydown', onKey); document.removeEventListener('keyup', onKey); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('resize', onResize); window.removeEventListener('pagehide', onPageHide); if (cur === api) cur = null; sprites = {}; layer = null; if (dir8.destroy) dir8.destroy(); },
      get destroyed() { return destroyed; }
    };
    function resolve(id) { if (!id) return null; if (id.indexOf('npc:') === 0) { var a = actors[id.slice(4)]; return a ? { type: 'npc', id: a.id, actor: a } : null; } var o = objById[id]; return o ? { type: 'obj', id: id, obj: o } : null; }
    api.state = function () {
      return { open: !destroyed, map: mapId, x: Math.round(hero.x * 100) / 100, y: Math.round(hero.y * 100) / 100, dir: hero.dir, zone: zoneId, flags: Object.assign({}, save.flags), target: target ? (target.type === 'npc' ? 'npc:' + target.id : target.id) : null,
        objective: objective.slice(), talking: !!talk, menu: menu ? menu.def.options.map(function (o) { return o.id; }) : null, locked: locked > 0 || hero.hidden || fading, hidden: hero.hidden, carrying: hero.carry, moving: hero.moving || !!hero.path, say: sayLine ? (sayLine.en || sayLine.fr) : null, paused: paused, ts: ts,
        quest: dir8.state ? dir8.state() : null };
    };
    // Tests : place le héros à côté de la cible (en changeant de carte au besoin), tourné vers elle.
    api.walkTo = function (id) {
      var tg = resolve(id); if (!tg && id.indexOf('map:') === 0) { var mm = id.slice(4); if (mm !== mapId) { var w0 = nextWarp(mapId, mm); while (w0 && mapId !== mm) { if (!warpOk(w0)) return false; enter(w0.to.map, w0.to.x, w0.to.y, w0.to.dir); w0 = nextWarp(mapId, mm); } camera(true); } return mapId === mm; }
      if (!tg && id.indexOf('zone:') === 0) { var zid = id.slice(5), ok = false; Object.keys(def.maps).forEach(function (m2) { (def.maps[m2].zones || []).forEach(function (z) { if (z.id === zid && !ok) { if (m2 !== mapId && !api.walkTo('map:' + m2)) return; for (var yy = z.y; yy < z.y + z.h && !ok; yy++) for (var xx = z.x; xx < z.x + z.w && !ok; xx++) if (free(xx, yy)) { hero.x = xx + 0.5; hero.y = yy + 0.5; ok = true; } } }); }); camera(true); checkZone(); return ok; }
      if (!tg) return false;
      var m = tg.type === 'npc' ? tg.actor.map : tg.obj.map;
      if (m !== mapId && !api.walkTo('map:' + m)) return false;
      var st = standTiles(tg); if (!st.length) return false;
      var p = pathTo(function (x, y) { return st.some(function (c) { return c[0] === x && c[1] === y; }); }), dest = p && p.length ? p[p.length - 1] : (p ? [Math.floor(hero.x), Math.floor(hero.y)] : st[0]);
      hero.x = dest[0] + 0.5; hero.y = dest[1] + 0.5; hero.path = null; faceTarget(tg); camera(true); checkZone(); target = findTarget(); return true;
    };
    api.route = function (id) { // points (centres de cases, coordonnées carte) jusqu'à la cible ou jusqu'au passage qui y mène
      var tg = resolve(id), m = tg ? (tg.type === 'npc' ? tg.actor.map : tg.obj.map) : (id.indexOf('map:') === 0 ? id.slice(4) : null), goal;
      if (id.indexOf('zone:') === 0) { var zid = id.slice(5); Object.keys(def.maps).forEach(function (m2) { (def.maps[m2].zones || []).forEach(function (z) { if (z.id === zid) { m = m2; goal = function (x, y) { return x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h; }; } }); }); }
      if (m && m !== mapId) { var w = nextWarp(mapId, m); if (!w) return null; goal = function (x, y) { return x >= w.x && x < w.x + (w.w || 1) && y >= w.y && y < w.y + (w.h || 1); }; var g0 = grid; }
      else if (tg) { var st = standTiles(tg); goal = function (x, y) { return st.some(function (c) { return c[0] === x && c[1] === y; }); }; }
      if (!goal) return null;
      var p = pathTo(goal); return p ? p.map(function (c) { return [c[0] + 0.5, c[1] + 0.5]; }) : null;
    };
    api.toScreen = function (x, y) { var r = wrap.getBoundingClientRect(), p = toScreen(x, y); return { x: p.x + r.left, y: p.y + r.top }; };

    // ---- démarrage
    resize();
    var st0 = save.map && def.maps[save.map] ? { map: save.map, x: save.x - 0.5, y: save.y - 0.5, dir: save.dir } : def.start;
    setMap(st0.map); hero.x = st0.x + 0.5; hero.y = st0.y + 0.5; hero.dir = st0.dir || 'down';
    if (blocked(hero.x, hero.y) && !free(Math.floor(hero.x), Math.floor(hero.y))) { hero.x = def.start.x + 0.5; hero.y = def.start.y + 0.5; setMap(def.start.map); }
    hero.def = cfg.hero;
    cur = api;
    if (dir8.open) dir8.open(api);
    camera(true); checkZone(); start();
    return api;
  }

  window.World = {
    open: open,
    get current() { return cur; },
    get state() { return cur ? cur.state() : { open: false }; },
    debug: {
      walkTo: function (id) { return cur ? cur.walkTo(id) : false; },
      interact: function () { return cur ? cur.interact() : false; },
      route: function (id) { return cur ? cur.route(id) : null; },
      goto: function (m, x, y, d) { if (cur) cur.teleport(m, x, y, d); },
      screenOf: function (id) { return cur ? cur.screenOf(id) : null; },
      toScreen: function (x, y) { return cur ? cur.toScreen(x, y) : null; },
      pick: function (id) { if (!cur) return false; var b = document.querySelector('.w-menu [data-w="opt"][data-id="' + id + '"]'); if (b) { b.click(); return true; } return false; }
    }
  };
})();
