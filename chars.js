/* Echoria — chars.js : générateur de personnages SVG (héros, PNJ, Pico, ennemis) et décors illustrés.
   Un seul style cartoon rond. Exposé via window.Chars. Aucune dépendance (sauf window.GAME pour l'équipement). */
(function () {
  'use strict';

  var SKIN = { light: '#FFD9B8', tan: '#EDB98A', brown: '#B97A4E', dark: '#7A4B2E', green: '#9BD67A', blue: '#9CCBF0', gray: '#C9C5CF', white: '#F4F4F8' };
  var HAIR = { black: '#2B2530', brown: '#7A4A22', blond: '#F2C84B', red: '#D9542B', gray: '#9A9AA6', white: '#F1EEE6', blue: '#3F8BE0', green: '#3DAA5C', pink: '#F27BB1', purple: '#8B5BD6' };
  var INK = '#2B2530';
  var uidN = 0;
  function uid(p) { return (p || 'c') + (++uidN); }

  function shade(hex, pct) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return hex || '#888888';
    var n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    var f = function (c) { c = Math.round(c + (pct < 0 ? c * pct : (255 - c) * pct)); return Math.max(0, Math.min(255, c)); };
    return '#' + [f(r), f(g), f(b)].map(function (c) { return (c < 16 ? '0' : '') + c.toString(16); }).join('');
  }
  function validHex(h, def) { return /^#[0-9a-f]{6}$/i.test(h || '') ? h : def; }
  function r1(n) { return Math.round(n * 10) / 10; }
  function itemById(id) {
    var items = (window.GAME && window.GAME.catalog && window.GAME.catalog.items) || [];
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
    return null;
  }

  // ---------------------------------------------------------------- visage (commun à toutes les espèces)
  // f = { x, y (centre du visage), s (échelle), brow (couleur), cheek (bool) }
  function face(f, mood, extra) {
    extra = extra || {};
    var k = f.s || 1, x = f.x + (extra.turn || 0) * 9 * k, y = f.y, ex = 14 * k, ey = y + 4 * k, s = '';
    var brow = f.brow || INK;
    var erx = 8 * k, ery = 9 * k, pr = 4.8 * k, pdx = 0, pdy = 0;
    if (mood === 'surprised') { erx = 9.5 * k; ery = 11 * k; pr = 4 * k; }
    if (mood === 'sad') pdy = 2 * k;
    if (mood === 'angry') pdy = 1 * k;
    if (f.cheek !== false) s += '<circle cx="' + r1(x - 25 * k) + '" cy="' + r1(y + 15 * k) + '" r="' + r1(6.5 * k) + '" fill="#FF7B7B" opacity="' + (mood === 'happy' ? '.5' : '.3') + '"/><circle cx="' + r1(x + 25 * k) + '" cy="' + r1(y + 15 * k) + '" r="' + r1(6.5 * k) + '" fill="#FF7B7B" opacity="' + (mood === 'happy' ? '.5' : '.3') + '"/>';
    // yeux
    if (mood === 'happy' && !extra.openEyes) {
      s += '<path d="M' + r1(x - ex - 8 * k) + ' ' + r1(ey + 2 * k) + 'q' + r1(8 * k) + ' ' + r1(-11 * k) + ' ' + r1(16 * k) + ' 0M' + r1(x + ex - 8 * k) + ' ' + r1(ey + 2 * k) + 'q' + r1(8 * k) + ' ' + r1(-11 * k) + ' ' + r1(16 * k) + ' 0" stroke="' + INK + '" stroke-width="' + r1(4 * k) + '" stroke-linecap="round" fill="none"/>';
    } else {
      [-1, 1].forEach(function (d) {
        if (extra.patch && d === 1) return;
        var cx = x + d * ex;
        s += '<ellipse cx="' + r1(cx) + '" cy="' + r1(ey) + '" rx="' + r1(erx) + '" ry="' + r1(ery) + '" fill="#fff"/>';
        s += '<circle cx="' + r1(cx + pdx) + '" cy="' + r1(ey + pdy + 1 * k) + '" r="' + r1(pr) + '" fill="' + INK + '"/><circle cx="' + r1(cx + pdx + 1.8 * k) + '" cy="' + r1(ey + pdy - 1.2 * k) + '" r="' + r1(1.8 * k) + '" fill="#fff"/>';
        if (mood === 'angry') s += '<path d="M' + r1(cx - d * 10 * k) + ' ' + r1(ey - 11 * k) + 'L' + r1(cx + d * 10 * k) + ' ' + r1(ey - 11 * k) + 'L' + r1(cx + d * 10 * k) + ' ' + r1(ey - 8 * k) + 'L' + r1(cx - d * 10 * k) + ' ' + r1(ey - 1 * k) + 'Z" fill="' + (f.lid || '#000') + '"' + (f.lid ? '' : ' opacity=".25"') + '/>';
      });
    }
    // sourcils
    var by = ey - 15 * k, bw = r1(3.6 * k);
    [-1, 1].forEach(function (d) {
      if (extra.patch && d === 1) return;
      var cx = x + d * ex, o, i; // o = extrémité extérieure, i = intérieure (dy)
      if (mood === 'sad') { o = 3; i = -4; } else if (mood === 'angry') { o = -4; i = 5; } else if (mood === 'surprised') { o = -5; i = -6; } else if (mood === 'happy') { o = -3; i = -4; } else { o = 0; i = -1; }
      s += '<path d="M' + r1(cx + d * 8 * k) + ' ' + r1(by + o * k) + 'Q' + r1(cx) + ' ' + r1(by + (o + i) / 2 * k - (mood === 'surprised' ? 3 * k : 1.5 * k)) + ' ' + r1(cx - d * 8 * k) + ' ' + r1(by + i * k) + '" stroke="' + brow + '" stroke-width="' + bw + '" stroke-linecap="round" fill="none"/>';
    });
    // nez
    if (!extra.noNose) s += '<path d="M' + r1(x - 2.5 * k) + ' ' + r1(y + 11 * k) + 'q' + r1(2.5 * k) + ' ' + r1(3 * k) + ' ' + r1(5 * k) + ' 0" stroke="#000" stroke-opacity=".28" stroke-width="' + r1(2.4 * k) + '" stroke-linecap="round" fill="none"/>';
    // bouche
    if (!extra.noMouth) s += mouth(x, y + 20 * k, k, mood);
    return s;
  }
  function mouth(x, y, k, mood) {
    if (mood === 'happy') return '<path d="M' + r1(x - 11 * k) + ' ' + r1(y - 3 * k) + 'Q' + r1(x) + ' ' + r1(y + 1 * k) + ' ' + r1(x + 11 * k) + ' ' + r1(y - 3 * k) + 'Q' + r1(x + 9 * k) + ' ' + r1(y + 10 * k) + ' ' + r1(x) + ' ' + r1(y + 10 * k) + 'Q' + r1(x - 9 * k) + ' ' + r1(y + 10 * k) + ' ' + r1(x - 11 * k) + ' ' + r1(y - 3 * k) + 'Z" fill="#7A2430"/><ellipse cx="' + r1(x) + '" cy="' + r1(y + 7 * k) + '" rx="' + r1(5 * k) + '" ry="' + r1(2.6 * k) + '" fill="#F2788A"/>';
    if (mood === 'sad') return '<path d="M' + r1(x - 8 * k) + ' ' + r1(y + 4 * k) + 'Q' + r1(x) + ' ' + r1(y - 4 * k) + ' ' + r1(x + 8 * k) + ' ' + r1(y + 4 * k) + '" stroke="' + INK + '" stroke-width="' + r1(3.2 * k) + '" stroke-linecap="round" fill="none"/>';
    if (mood === 'surprised') return '<ellipse cx="' + r1(x) + '" cy="' + r1(y + 2 * k) + '" rx="' + r1(5 * k) + '" ry="' + r1(6.5 * k) + '" fill="#7A2430"/>';
    if (mood === 'angry') return '<path d="M' + r1(x - 9 * k) + ' ' + r1(y + 4 * k) + 'Q' + r1(x) + ' ' + r1(y - 3 * k) + ' ' + r1(x + 9 * k) + ' ' + r1(y + 4 * k) + 'L' + r1(x + 7 * k) + ' ' + r1(y + 6 * k) + 'Q' + r1(x) + ' ' + r1(y + 1 * k) + ' ' + r1(x - 7 * k) + ' ' + r1(y + 6 * k) + 'Z" fill="' + INK + '"/>';
    return '<path d="M' + r1(x - 8 * k) + ' ' + r1(y - 1 * k) + 'Q' + r1(x) + ' ' + r1(y + 6 * k) + ' ' + r1(x + 8 * k) + ' ' + r1(y - 1 * k) + '" stroke="' + INK + '" stroke-width="' + r1(3.2 * k) + '" stroke-linecap="round" fill="none"/>';
  }

  // ---------------------------------------------------------------- cheveux
  // h = { x, y, rx, ry } (ellipse de la tête)
  function hairBack(style, h, c) {
    var x = h.x, y = h.y, rx = h.rx, ry = h.ry, cd = shade(c, -0.18), s = '';
    if (style === 'long') s += '<path d="M' + (x - rx - 5) + ' ' + (y - 6) + 'C' + (x - rx - 14) + ' ' + (y + 28) + ' ' + (x - rx - 10) + ' ' + (y + ry + 30) + ' ' + (x - rx + 10) + ' ' + (y + ry + 30) + 'L' + (x + rx - 10) + ' ' + (y + ry + 30) + 'C' + (x + rx + 10) + ' ' + (y + ry + 30) + ' ' + (x + rx + 14) + ' ' + (y + 28) + ' ' + (x + rx + 5) + ' ' + (y - 6) + 'Z" fill="' + cd + '"/>';
    else if (style === 'ponytail') s += '<path d="M' + (x + rx - 10) + ' ' + (y - ry + 6) + 'q34 0 30 40q-2 18-14 26q6-22-8-36z" fill="' + cd + '"/><circle cx="' + (x + rx + 2) + '" cy="' + (y - ry + 12) + '" r="5" fill="#E5484D"/>';
    else if (style === 'bun') s += '<circle cx="' + x + '" cy="' + (y - ry - 7) + '" r="15" fill="' + cd + '"/><circle cx="' + (x - 4) + '" cy="' + (y - ry - 11) + '" r="5" fill="' + c + '" opacity=".6"/>';
    else if (style === 'braids') {
      [-1, 1].forEach(function (d) {
        var bx = x + d * (rx + 1);
        s += '<circle cx="' + bx + '" cy="' + (y + 14) + '" r="8.5" fill="' + cd + '"/><circle cx="' + (bx + d * 2) + '" cy="' + (y + 27) + '" r="7.5" fill="' + c + '"/><circle cx="' + (bx + d * 3) + '" cy="' + (y + 39) + '" r="6.5" fill="' + cd + '"/><rect x="' + (bx + d * 3 - 5) + '" y="' + (y + 43) + '" width="10" height="5" rx="2.5" fill="#E5484D"/><path d="M' + (bx + d * 3 - 4) + ' ' + (y + 48) + 'l4 9l4-9z" fill="' + c + '"/>';
      });
    } else if (style === 'curly') {
      for (var a = 170; a <= 370; a += 25) { var rad = a * Math.PI / 180; s += '<circle cx="' + r1(x + Math.cos(rad) * (rx + 3)) + '" cy="' + r1(y - 4 + Math.sin(rad) * (ry + 3)) + '" r="13" fill="' + cd + '"/>'; }
    }
    return s;
  }
  function hairFront(style, h, c, age) {
    var x = h.x, y = h.y, rx = h.rx, ry = h.ry, cd = shade(c, -0.18), s = '';
    var L = x - rx - 2, R = x + rx + 2;
    var cap = 'M' + L + ' ' + (y + 1) + 'A' + (rx + 2) + ' ' + (ry + 4) + ' 0 0 1 ' + R + ' ' + (y + 1);
    if (style === 'bald') {
      if (age === 'elder' || age === 'adult') s += '<path d="M' + (x - rx - 1) + ' ' + (y + 2) + 'q-5-12 2-20q4 8 3 20zM' + (x + rx + 1) + ' ' + (y + 2) + 'q5-12-2-20q-4 8-3 20z" fill="' + c + '"/>';
      s += '<path d="M' + (x - 12) + ' ' + (y - ry + 7) + 'q10-5 20-2" stroke="#fff" stroke-opacity=".5" stroke-width="3" stroke-linecap="round" fill="none"/>';
      return s;
    }
    if (style === 'spiky') {
      var pts = [], n = 0;
      for (var a = 185; a <= 355; a += 14.2) { var rad = a * Math.PI / 180, out = n % 2 === 0 ? 0 : 17; pts.push(r1(x + Math.cos(rad) * (rx + 1 + out)) + ' ' + r1(y + Math.sin(rad) * (ry + 2 + out))); n++; }
      s += '<path d="M' + pts.join('L') + 'Q' + (x + rx * 0.5) + ' ' + (y - ry * 0.55) + ' ' + (x + 2) + ' ' + (y - ry * 0.45) + 'Q' + (x - rx * 0.6) + ' ' + (y - ry * 0.5) + ' ' + pts[0] + 'Z" fill="' + c + '"/>';
      return s;
    }
    if (style === 'curly') {
      for (var b = 200; b <= 340; b += 23.3) { var rb = b * Math.PI / 180; s += '<circle cx="' + r1(x + Math.cos(rb) * (rx - 5)) + '" cy="' + r1(y - 3 + Math.sin(rb) * (ry - 5)) + '" r="12" fill="' + c + '"/>'; }
      s += '<circle cx="' + (x - 6) + '" cy="' + (y - ry + 2) + '" r="12" fill="' + c + '"/><circle cx="' + (x + 12) + '" cy="' + (y - ry + 3) + '" r="11" fill="' + c + '"/>';
      return s;
    }
    if (style === 'braids' || style === 'long') { // raie au milieu
      s += '<path d="' + cap + 'Q' + (x + rx * 0.72) + ' ' + (y - ry * 0.62) + ' ' + x + ' ' + (y - ry * 0.78) + 'Q' + (x - rx * 0.72) + ' ' + (y - ry * 0.62) + ' ' + L + ' ' + (y + 1) + 'Z" fill="' + c + '"/>';
      if (style === 'long') s += '<path d="M' + L + ' ' + (y - 2) + 'q-2 22 3 34l5-2q-4-16-2-32zM' + R + ' ' + (y - 2) + 'q2 22-3 34l-5-2q4-16 2-32z" fill="' + c + '"/>';
      return s;
    }
    // short, bun, ponytail : frange balayée
    s += '<path d="' + cap + 'Q' + (x + rx * 0.72) + ' ' + (y - ry * 0.7) + ' ' + (x + 6) + ' ' + (y - ry * 0.52) + 'Q' + (x - rx * 0.55) + ' ' + (y - ry * 0.3) + ' ' + L + ' ' + (y + 1) + 'Z" fill="' + c + '"/>';
    s += '<path d="M' + (x - rx * 0.5) + ' ' + (y - ry * 0.85) + 'q' + (rx * 0.5) + ' -8 ' + rx + ' 0" stroke="' + shade(c, 0.3) + '" stroke-opacity=".6" stroke-width="3" stroke-linecap="round" fill="none"/>';
    return s;
  }

  // ---------------------------------------------------------------- chapeaux
  function hatBack(hat, h, look) {
    var x = h.x, y = h.y, rx = h.rx, ry = h.ry;
    if (hat === 'hood') { var c = shade(validHex(look.outfit, '#555577'), -0.25); return '<ellipse cx="' + x + '" cy="' + (y + 2) + '" rx="' + (rx + 11) + '" ry="' + (ry + 12) + '" fill="' + c + '"/>'; }
    return '';
  }
  function hatFront(hat, h, look) {
    var x = h.x, y = h.y, rx = h.rx, ry = h.ry, ty = y - ry, o = validHex(look.outfit, '#2F8FE6'), s = '';
    switch (hat) {
      case 'straw':
        s += '<ellipse cx="' + x + '" cy="' + (ty + 13) + '" rx="' + (rx + 22) + '" ry="9" fill="#D9A93F"/><path d="M' + (x - rx * 0.78) + ' ' + (ty + 13) + 'Q' + (x - rx * 0.8) + ' ' + (ty - 16) + ' ' + x + ' ' + (ty - 16) + 'Q' + (x + rx * 0.8) + ' ' + (ty - 16) + ' ' + (x + rx * 0.78) + ' ' + (ty + 13) + 'Z" fill="#EFCB6B"/><path d="M' + (x - rx * 0.78) + ' ' + (ty + 5) + 'h' + (rx * 1.56) + 'v7h-' + (rx * 1.56) + 'z" fill="#E5484D"/><ellipse cx="' + x + '" cy="' + (ty + 13) + '" rx="' + (rx + 22) + '" ry="9" fill="none" stroke="#B98A2C" stroke-width="1.5" opacity=".6"/>';
        break;
      case 'chef':
        s += '<circle cx="' + (x - 20) + '" cy="' + (ty - 14) + '" r="17" fill="#fff"/><circle cx="' + (x + 20) + '" cy="' + (ty - 14) + '" r="17" fill="#fff"/><circle cx="' + x + '" cy="' + (ty - 22) + '" r="20" fill="#fff"/><rect x="' + (x - 28) + '" y="' + (ty - 12) + '" width="56" height="24" rx="5" fill="#F3F1EC"/><path d="M' + (x - 28) + ' ' + (ty + 6) + 'h56" stroke="#D9D4C8" stroke-width="3"/>';
        break;
      case 'wizard': {
        var w = shade(o, -0.12), wd = shade(o, -0.35);
        s += '<path d="M' + (x - rx - 2) + ' ' + (ty + 14) + 'L' + (x + 4) + ' ' + (ty - 56) + 'q10-4 16 6l-10-2L' + (x + rx + 2) + ' ' + (ty + 14) + 'Z" fill="' + w + '"/><ellipse cx="' + x + '" cy="' + (ty + 14) + '" rx="' + (rx + 17) + '" ry="8.5" fill="' + wd + '"/><path d="M' + (x - rx + 2) + ' ' + (ty + 6) + 'q' + (rx - 2) + ' 9 ' + (rx * 2 - 4) + ' 0l1 6q-' + (rx - 1) + ' 9-' + (rx * 2 - 2) + ' 0z" fill="#F5B833"/><path d="M' + (x + 2) + ' ' + (ty - 28) + 'l3 7 7 1-5 5 1 7-6-4-6 4 1-7-5-5 7-1z" fill="#FFE58A"/>';
        break;
      }
      case 'pirate':
        s += '<path d="M' + (x - rx - 16) + ' ' + (ty + 14) + 'Q' + (x - rx - 6) + ' ' + (ty - 6) + ' ' + (x - 14) + ' ' + (ty - 10) + 'Q' + x + ' ' + (ty - 34) + ' ' + (x + 14) + ' ' + (ty - 10) + 'Q' + (x + rx + 6) + ' ' + (ty - 6) + ' ' + (x + rx + 16) + ' ' + (ty + 14) + 'Q' + x + ' ' + (ty + 2) + ' ' + (x - rx - 16) + ' ' + (ty + 14) + 'Z" fill="#2B2530"/><path d="M' + (x - rx - 14) + ' ' + (ty + 12) + 'Q' + x + ' ' + (ty) + ' ' + (x + rx + 14) + ' ' + (ty + 12) + '" stroke="#F5B833" stroke-width="3" fill="none"/><circle cx="' + x + '" cy="' + (ty - 12) + '" r="6" fill="#fff"/><circle cx="' + (x - 2) + '" cy="' + (ty - 13) + '" r="1.5" fill="#2B2530"/><circle cx="' + (x + 2) + '" cy="' + (ty - 13) + '" r="1.5" fill="#2B2530"/><path d="M' + (x - 7) + ' ' + (ty - 4) + 'l14 5m0-5l-14 5" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>';
        break;
      case 'crown':
        s += '<path d="M' + (x - 27) + ' ' + (ty + 13) + 'L' + (x - 32) + ' ' + (ty - 14) + 'L' + (x - 15) + ' ' + (ty - 1) + 'L' + x + ' ' + (ty - 20) + 'L' + (x + 15) + ' ' + (ty - 1) + 'L' + (x + 32) + ' ' + (ty - 14) + 'L' + (x + 27) + ' ' + (ty + 13) + 'Z" fill="#F5B833" stroke="#C98A12" stroke-width="2.5" stroke-linejoin="round"/><circle cx="' + x + '" cy="' + (ty + 3) + '" r="4.5" fill="#E5484D"/><circle cx="' + (x - 17) + '" cy="' + (ty + 6) + '" r="3.5" fill="#2F8FE6"/><circle cx="' + (x + 17) + '" cy="' + (ty + 6) + '" r="3.5" fill="#3DBB6B"/><circle cx="' + (x - 32) + '" cy="' + (ty - 14) + '" r="3" fill="#FFE58A"/><circle cx="' + (x + 32) + '" cy="' + (ty - 14) + '" r="3" fill="#FFE58A"/><circle cx="' + x + '" cy="' + (ty - 20) + '" r="3.5" fill="#FFE58A"/>';
        break;
      case 'hood': {
        var hc = shade(o, -0.1), hd = shade(o, -0.3);
        s += '<path fill-rule="evenodd" d="M' + (x - rx - 12) + ' ' + (y + ry + 6) + 'C' + (x - rx - 16) + ' ' + (y - ry - 36) + ' ' + (x + rx + 16) + ' ' + (y - ry - 36) + ' ' + (x + rx + 12) + ' ' + (y + ry + 6) + 'L' + (x + rx - 6) + ' ' + (y + ry + 4) + 'C' + (x + rx + 4) + ' ' + (y - ry - 6) + ' ' + (x - rx - 4) + ' ' + (y - ry - 6) + ' ' + (x - rx + 6) + ' ' + (y + ry + 4) + 'Z" fill="' + hc + '"/><path d="M' + (x - rx + 6) + ' ' + (y + ry + 4) + 'C' + (x - rx - 4) + ' ' + (y - ry - 6) + ' ' + (x + rx + 4) + ' ' + (y - ry - 6) + ' ' + (x + rx - 6) + ' ' + (y + ry + 4) + '" stroke="' + hd + '" stroke-width="4" fill="none" stroke-linecap="round"/>';
        break;
      }
      case 'beanie': {
        var bc = shade(o, 0.12), bd = shade(o, -0.22);
        s += '<path d="M' + (x - rx - 2) + ' ' + (ty + 20) + 'A' + (rx + 2) + ' ' + (ry * 0.78) + ' 0 0 1 ' + (x + rx + 2) + ' ' + (ty + 20) + 'Z" fill="' + bc + '"/><rect x="' + (x - rx - 4) + '" y="' + (ty + 12) + '" width="' + (rx * 2 + 8) + '" height="13" rx="6.5" fill="' + bd + '"/><circle cx="' + x + '" cy="' + (ty - 10) + '" r="9" fill="#fff"/>';
        break;
      }
      case 'helmet':
        s += '<path d="M' + (x - rx - 3) + ' ' + (ty + 24) + 'A' + (rx + 3) + ' ' + (ry * 0.9) + ' 0 0 1 ' + (x + rx + 3) + ' ' + (ty + 24) + 'Z" fill="#AEB8C4"/><path d="M' + (x - rx - 3) + ' ' + (ty + 24) + 'A' + (rx + 3) + ' ' + (ry * 0.9) + ' 0 0 1 ' + (x - 4) + ' ' + (ty - 7) + 'L' + (x - 4) + ' ' + (ty + 24) + 'Z" fill="#fff" opacity=".25"/><rect x="' + (x - rx - 6) + '" y="' + (ty + 19) + '" width="' + (rx * 2 + 12) + '" height="9" rx="4.5" fill="#7F8A98"/><rect x="' + (x - 4) + '" y="' + (ty + 22) + '" width="8" height="20" rx="3" fill="#7F8A98"/><circle cx="' + x + '" cy="' + (ty - 8) + '" r="5" fill="#F5B833"/>';
        break;
      case 'bandana': {
        var bn = /^#(d|e|f)/i.test(o) ? '#2F8FE6' : '#E5484D';
        s += '<path d="M' + (x - rx - 2) + ' ' + (y - 4) + 'A' + (rx + 2) + ' ' + (ry + 3) + ' 0 0 1 ' + (x + rx + 2) + ' ' + (y - 4) + 'Q' + x + ' ' + (y - ry * 0.75) + ' ' + (x - rx - 2) + ' ' + (y - 4) + 'Z" fill="' + bn + '"/><path d="M' + (x + rx - 2) + ' ' + (y - 8) + 'l18 4-6 8zM' + (x + rx - 2) + ' ' + (y - 6) + 'l12 16-10 2z" fill="' + shade(bn, -0.2) + '"/><circle cx="' + (x + rx) + '" cy="' + (y - 6) + '" r="5" fill="' + bn + '"/><circle cx="' + (x - 14) + '" cy="' + (ty + 9) + '" r="2.5" fill="#fff" opacity=".8"/><circle cx="' + (x + 8) + '" cy="' + (ty + 5) + '" r="2.5" fill="#fff" opacity=".8"/>';
        break;
      }
      case 'flower': {
        var fx = x + rx - 10, fy = ty + 12;
        for (var i = 0; i < 5; i++) { var a = (i * 72 - 90) * Math.PI / 180; s += '<circle cx="' + r1(fx + Math.cos(a) * 8) + '" cy="' + r1(fy + Math.sin(a) * 8) + '" r="6.5" fill="#FF8FC0"/>'; }
        s += '<circle cx="' + fx + '" cy="' + fy + '" r="5" fill="#FFD23F"/><path d="M' + (fx - 12) + ' ' + (fy + 10) + 'q-8 0-10 8q8 2 10-8z" fill="#3DBB6B"/>';
        break;
      }
    }
    return s;
  }

  // ---------------------------------------------------------------- accessoires
  function accessoryFront(acc, h, look, hc) {
    var x = h.x, y = h.y, rx = h.rx, k = h.s || 1, s = '';
    var ey = y + 4 * k, ex = 14 * k;
    switch (acc) {
      case 'glasses':
        s += '<circle cx="' + r1(x - ex) + '" cy="' + r1(ey) + '" r="' + r1(12 * k) + '" fill="#fff" fill-opacity=".22" stroke="#4A3524" stroke-width="2.8"/><circle cx="' + r1(x + ex) + '" cy="' + r1(ey) + '" r="' + r1(12 * k) + '" fill="#fff" fill-opacity=".22" stroke="#4A3524" stroke-width="2.8"/><path d="M' + r1(x - ex + 12 * k) + ' ' + r1(ey - 1) + 'q' + r1(ex - 12 * k) + ' -4 ' + r1(2 * ex - 24 * k) + ' 0M' + r1(x - ex - 12 * k) + ' ' + r1(ey - 2) + 'L' + (x - rx) + ' ' + r1(ey - 5) + 'M' + r1(x + ex + 12 * k) + ' ' + r1(ey - 2) + 'L' + (x + rx) + ' ' + r1(ey - 5) + '" stroke="#4A3524" stroke-width="2.8" fill="none" stroke-linecap="round"/>';
        break;
      case 'mustache':
        s += '<path d="M' + x + ' ' + r1(y + 15 * k) + 'q-7-6-16 0q-4 3-8 0q4 9 13 8q8-1 11-8zM' + x + ' ' + r1(y + 15 * k) + 'q7-6 16 0q4 3 8 0q-4 9-13 8q-8-1-11-8z" fill="' + hc + '"/>';
        break;
      case 'eyepatch':
        s += '<path d="M' + (x - rx + 2) + ' ' + r1(y - 14 * k) + 'L' + (x + rx - 2) + ' ' + r1(y + 2 * k) + '" stroke="#2B2530" stroke-width="3"/><ellipse cx="' + r1(x + ex) + '" cy="' + r1(ey + 1) + '" rx="' + r1(10.5 * k) + '" ry="' + r1(11.5 * k) + '" fill="#2B2530"/>';
        break;
      case 'earrings':
        s += '<circle cx="' + (x - rx - 1) + '" cy="' + r1(y + 16 * k) + '" r="4.2" fill="#F5B833" stroke="#C98A12" stroke-width="1.5"/><circle cx="' + (x + rx + 1) + '" cy="' + r1(y + 16 * k) + '" r="4.2" fill="#F5B833" stroke="#C98A12" stroke-width="1.5"/>';
        break;
      case 'pipe':
        s += '<path d="M' + r1(x + 6 * k) + ' ' + r1(y + 22 * k) + 'q14 4 22 0" stroke="#5E3A1A" stroke-width="4" fill="none" stroke-linecap="round"/><rect x="' + r1(x + 26 * k) + '" y="' + r1(y + 12 * k) + '" width="11" height="13" rx="3" fill="#7A4A22"/><circle cx="' + r1(x + 36 * k) + '" cy="' + r1(y + 2 * k) + '" r="4" fill="#fff" opacity=".7"/><circle cx="' + r1(x + 42 * k) + '" cy="' + r1(y - 9 * k) + '" r="5.5" fill="#fff" opacity=".5"/>';
        break;
    }
    return s;
  }
  function beard(h, hc, long) {
    var x = h.x, y = h.y, rx = h.rx, ry = h.ry, b = y + ry + (long ? 30 : 14);
    return '<path d="M' + (x - rx + 1) + ' ' + (y + 4) + 'Q' + (x - rx - 3) + ' ' + (y + ry) + ' ' + (x - rx * 0.5) + ' ' + (b - 6) + 'Q' + x + ' ' + (b + 8) + ' ' + (x + rx * 0.5) + ' ' + (b - 6) + 'Q' + (x + rx + 3) + ' ' + (y + ry) + ' ' + (x + rx - 1) + ' ' + (y + 4) + 'Q' + (x + rx * 0.55) + ' ' + (y + ry * 0.42) + ' ' + x + ' ' + (y + ry * 0.36) + 'Q' + (x - rx * 0.55) + ' ' + (y + ry * 0.42) + ' ' + (x - rx + 1) + ' ' + (y + 4) + 'Z" fill="' + hc + '"/>';
  }
  function scarf(x, y, w) {
    return '<rect x="' + (x - w / 2) + '" y="' + (y - 6) + '" width="' + w + '" height="14" rx="7" fill="#E5484D"/><path d="M' + (x + w / 2 - 16) + ' ' + (y + 4) + 'h12l3 26h-12z" fill="#C7353B"/><path d="M' + (x + w / 2 - 13) + ' ' + (y + 30) + 'v6m5-6v6m5-6v6" stroke="#C7353B" stroke-width="2.4" stroke-linecap="round"/>';
  }

  // ---------------------------------------------------------------- armes & armures (héros)
  var WEAPON_TINT = { stick: '#9C6B3C', wooden_sword: '#D2A163', iron_sword: '#C9D2DC', ranger_blade: '#BFE3B4', silver_dagger: '#E3E9F0', cutlass: '#D7DEE6', harpoon: '#C9D2DC', frost_blade: '#A8E6FF', star_staff: '#FFE58A', crystal_blade: '#E7B8FF' };
  function weaponSvg(id, hx, hy) {
    var it = itemById(id); if (!it) return '';
    var kind = it.wkind || 'sword', c = WEAPON_TINT[id] || '#C9D2DC', cd = shade(c, -0.25), s = '<g transform="translate(' + hx + ' ' + hy + ') rotate(18)">';
    if (kind === 'sword') {
      var wood = id === 'wooden_sword';
      s += '<path d="M-5-8L-5-58L0-68L5-58L5-8Z" fill="' + c + '" stroke="' + cd + '" stroke-width="2" stroke-linejoin="round"/><path d="M0-66V-10" stroke="#fff" stroke-opacity="' + (wood ? '.25' : '.6') + '" stroke-width="2"/><rect x="-13" y="-11" width="26" height="6" rx="3" fill="' + (wood ? '#8B5A2B' : '#F5B833') + '"/><rect x="-3.500" y="-6" width="7" height="16" rx="3" fill="#5E3A1A"/><circle cx="0" cy="11" r="4" fill="' + (wood ? '#8B5A2B' : '#F5B833') + '"/>';
      if (id === 'crystal_blade' || id === 'frost_blade') s += '<circle cx="0" cy="-40" r="16" fill="' + c + '" opacity=".25"/>';
    } else if (kind === 'dagger') {
      s += '<path d="M-4-6L-4-30L0-38L4-30L4-6Z" fill="' + c + '" stroke="' + cd + '" stroke-width="2" stroke-linejoin="round"/><rect x="-9" y="-8" width="18" height="5" rx="2.5" fill="#F5B833"/><rect x="-3" y="-4" width="6" height="13" rx="3" fill="#5E3A1A"/>';
    } else if (kind === 'spear') {
      s += '<rect x="-2.500" y="-74" width="5" height="104" rx="2.5" fill="#8B5A2B"/><path d="M0-96L7-74H-7Z" fill="' + c + '" stroke="' + cd + '" stroke-width="2" stroke-linejoin="round"/><path d="M-11-88q0 14 11 14q11 0 11-14" stroke="' + c + '" stroke-width="3.5" fill="none" stroke-linecap="round"/>';
    } else { // staff
      s += '<rect x="-3" y="-66" width="6" height="96" rx="3" fill="#8B5A2B"/>';
      if (id === 'star_staff') s += '<path d="M0-90l5 11 12 1.500-9 8 2.500 12L0-64l-10.500 6.500 2.500-12-9-8 12-1.500z" fill="#FFE58A" stroke="#F5B833" stroke-width="2" stroke-linejoin="round"/>';
      else s += '<circle cx="0" cy="-68" r="6" fill="#9C6B3C"/><path d="M2-60q8-4 6-12" stroke="#3DBB6B" stroke-width="3" fill="none" stroke-linecap="round"/>';
    }
    return s + '</g>';
  }
  function armorBack(id, g) {
    var x = 100, y0 = g.bodyTop, y1 = g.feetY - 4;
    if (id === 'leaf_cloak') return '<path d="M' + (x - g.tw / 2 - 2) + ' ' + (y0 + 4) + 'L' + (x - g.bw / 2 - 16) + ' ' + y1 + 'q8 6 16 0q8 6 16 0q8 6 16 0q8 6 16 0q8 6 16 0q8 6 16 0L' + (x + g.tw / 2 + 2) + ' ' + (y0 + 4) + 'Z" fill="#3E9B4F"/>';
    if (id === 'rebel_cloak') return '<path d="M' + (x - g.tw / 2 - 3) + ' ' + (y0 + 3) + 'L' + (x - g.bw / 2 - 18) + ' ' + y1 + 'h' + (g.bw + 36) + 'L' + (x + g.tw / 2 + 3) + ' ' + (y0 + 3) + 'Z" fill="#3A2A55"/>';
    return '';
  }
  function armorFront(id, g) {
    var x = 100, y0 = g.bodyTop, y1 = g.bodyTop + g.th, s = '';
    var side = function (c, len, gap) { var b = y1 + (len || 0); return '<path d="M' + (x - g.tw / 2 + 1) + ' ' + (y0 + 3) + 'h' + (g.tw / 2 - gap - 1) + 'L' + (x - gap) + ' ' + b + 'h-' + (g.bw / 2 - gap + 1) + 'Z" fill="' + c + '"/><path d="M' + (x + g.tw / 2 - 1) + ' ' + (y0 + 3) + 'h-' + (g.tw / 2 - gap - 1) + 'L' + (x + gap) + ' ' + b + 'h' + (g.bw / 2 - gap + 1) + 'Z" fill="' + c + '"/>'; };
    if (id === 'leather_vest') s += side('#9C6B3C', -8, 7) + '<path d="M' + (x - 7) + ' ' + (y0 + 10) + 'l14 8m-14 4l14 8" stroke="#5E3A1A" stroke-width="2" stroke-linecap="round"/>';
    else if (id === 'sailor_coat') s += side('#2C4A7C', 8, 5) + '<circle cx="' + (x - 12) + '" cy="' + (y0 + 18) + '" r="3" fill="#F5B833"/><circle cx="' + (x - 13) + '" cy="' + (y0 + 32) + '" r="3" fill="#F5B833"/><circle cx="' + (x + 12) + '" cy="' + (y0 + 18) + '" r="3" fill="#F5B833"/><circle cx="' + (x + 13) + '" cy="' + (y0 + 32) + '" r="3" fill="#F5B833"/>';
    else if (id === 'fur_coat') { s += side('#8A5A3C', 8, 5); for (var i = -3; i <= 3; i++) s += '<circle cx="' + (x + i * 9) + '" cy="' + (y0 + 5 - Math.abs(i)) + '" r="8" fill="#F6EFE2"/>'; }
    else if (id === 'leaf_cloak') s += '<path d="M' + (x - g.tw / 2 - 2) + ' ' + (y0 + 2) + 'q' + (g.tw / 2 + 2) + ' 18 ' + (g.tw + 4) + ' 0v8q-' + (g.tw / 2 + 2) + ' 18-' + (g.tw + 4) + ' 0z" fill="#3E9B4F"/><path d="M' + x + ' ' + (y0 + 12) + 'q8-8 0-14q-8 6 0 14z" fill="#8EE07A"/>';
    else if (id === 'rebel_cloak') s += '<path d="M' + (x - g.tw / 2 - 3) + ' ' + (y0 + 1) + 'q' + (g.tw / 2 + 3) + ' 20 ' + (g.tw + 6) + ' 0v9q-' + (g.tw / 2 + 3) + ' 20-' + (g.tw + 6) + ' 0z" fill="#4B3870"/><circle cx="' + x + '" cy="' + (y0 + 14) + '" r="4.500" fill="#C9D2DC"/>';
    return s;
  }

  // ---------------------------------------------------------------- humanoïdes (human, elf, dwarf)
  var PJ = '#9CC8F0', PJ_D = '#7FB2E0';
  var WEAR = { pyjamas: { pj: 1 }, undies: {}, dressed: { tshirt: 1, trousers: 1, socks: 1, shoes: 1 } };
  var BODY = {
    child: { hr: 42, hry: 40, hy: 80, tw: 50, bw: 58, th: 40, lh: 22 },
    adult: { hr: 36, hry: 35, hy: 60, tw: 56, bw: 62, th: 58, lh: 32 },
    elder: { hr: 36, hry: 35, hy: 68, tw: 56, bw: 64, th: 54, lh: 28 },
    dwarf: { hr: 40, hry: 37, hy: 86, tw: 72, bw: 78, th: 44, lh: 16 }
  };
  function humanoid(look, mood, opts) {
    var sp = look.species, age = look.age || 'adult';
    var g = Object.assign({}, sp === 'dwarf' ? BODY.dwarf : (BODY[age] || BODY.adult));
    if (sp === 'elf') { g.tw -= 6; g.bw -= 6; }
    if (sp === 'dwarf' && age === 'child') { g.hy += 4; g.th -= 6; }
    g.bodyTop = g.hy + g.hry - 7; g.feetY = g.bodyTop + g.th + g.lh;
    var skin = SKIN[look.skin] || SKIN.light, skinD = shade(skin, -0.14);
    var hc = HAIR[look.hairColor] || HAIR.brown;
    var out = validHex(look.outfit, '#2F8FE6'), outD = shade(out, -0.22), outL = shade(out, 0.25);
    var x = 100, y0 = g.bodyTop, y1 = y0 + g.th, hd = { x: x, y: g.hy, rx: g.hr, ry: g.hry, s: g.hr / 38 };
    var hat = look.hat || 'none', acc = look.accessory || 'none', hair = look.hair || 'short';
    var s = '';
    s += '<ellipse cx="100" cy="' + (g.feetY + 6) + '" rx="' + (g.bw / 2 + 12) + '" ry="6" fill="#000" opacity=".16"/>';
    s += armorBack(opts.armor, g);
    if (hat !== 'hood') s += hairBack(hair, hd, hc);
    s += hatBack(hat, hd, look);
    // jambes + chaussures
    var wear = opts.wear ? (typeof opts.wear === 'string' ? (WEAR[opts.wear] || {}) : opts.wear) : null, back = opts.facing === 'up', turn = opts.facing === 'left' ? -1 : opts.facing === 'right' ? 1 : 0;
    var legC = wear ? (wear.pj ? PJ : wear.trousers ? '#3F5FA8' : skin) : shade(out, -0.42), lw = Math.max(14, g.bw * 0.24);
    var footC = wear ? (wear.shoes ? '#E5484D' : wear.socks ? '#FFFFFF' : skin) : '#5E3A1A', la = opts.step === 1 ? 7 : 0, lb = opts.step === 2 ? 7 : 0;
    s += '<rect x="' + r1(x - 4 - lw) + '" y="' + (y1 - 8) + '" width="' + r1(lw) + '" height="' + (g.lh + 8 - la) + '" rx="6" fill="' + legC + '"/><rect x="' + (x + 4) + '" y="' + (y1 - 8) + '" width="' + r1(lw) + '" height="' + (g.lh + 8 - lb) + '" rx="6" fill="' + legC + '"/>';
    if (wear && wear.socks && !wear.shoes) s += '<rect x="' + r1(x - 4 - lw) + '" y="' + (g.feetY - 9 - la) + '" width="' + r1(lw) + '" height="9" fill="#fff"/><rect x="' + (x + 4) + '" y="' + (g.feetY - 9 - lb) + '" width="' + r1(lw) + '" height="9" fill="#fff"/><path d="M' + r1(x - 4 - lw) + ' ' + (g.feetY - 7 - la) + 'h' + r1(lw) + 'M' + (x + 4) + ' ' + (g.feetY - 7 - lb) + 'h' + r1(lw) + '" stroke="#E5484D" stroke-width="2.5"/>';
    s += '<ellipse cx="' + r1(x - 5 - lw / 2) + '" cy="' + (g.feetY + 1 - la) + '" rx="' + r1(lw / 2 + (wear && !wear.shoes ? 2 : 4)) + '" ry="' + (wear && !wear.shoes ? 5.5 : 6.5) + '" fill="' + footC + '"/><ellipse cx="' + r1(x + 5 + lw / 2) + '" cy="' + (g.feetY + 1 - lb) + '" rx="' + r1(lw / 2 + (wear && !wear.shoes ? 2 : 4)) + '" ry="' + (wear && !wear.shoes ? 5.5 : 6.5) + '" fill="' + footC + '"/>';
    if (wear && wear.shoes) s += '<path d="M' + r1(x - 9 - lw / 2) + ' ' + (g.feetY - 2 - la) + 'h8M' + r1(x + 1 + lw / 2) + ' ' + (g.feetY - 2 - lb) + 'h8" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>';
    // arme (derrière la main)
    var handR = { x: x + g.tw / 2 + (opts.weapon ? 15 : 9), y: y0 + g.th * (opts.weapon ? 0.5 : 0.66) };
    var handL = { x: x - g.tw / 2 - 9, y: y0 + g.th * 0.66 };
    if (mood === 'happy' && !opts.weapon && !opts.noWave) { handL.y = y0 + g.th * 0.2; handL.x -= 6; }
    if (opts.step === 1) { handL.y -= 5; handR.y += 3; } else if (opts.step === 2) { handL.y += 3; handR.y -= 5; }
    if (opts.hug) { handL.x = x - g.tw / 2 - 22; handL.y = y0 + 6; handR.x = x + g.tw / 2 + 22; handR.y = y0 + 6; }
    if (opts.carry) { handL.x = x - g.tw / 2 - 2; handL.y = y0 - 8; handR.x = x + g.tw / 2 + 2; handR.y = y0 - 8; }
    if (opts.weapon) s += weaponSvg(opts.weapon, handR.x, handR.y);
    // bras
    s += '<path d="M' + (x - g.tw / 2 + 5) + ' ' + (y0 + 11) + 'L' + handL.x + ' ' + r1(handL.y) + 'M' + (x + g.tw / 2 - 5) + ' ' + (y0 + 11) + 'L' + handR.x + ' ' + r1(handR.y) + '" stroke="' + (wear ? (wear.pj ? PJ_D : skinD) : outD) + '" stroke-width="15" stroke-linecap="round" fill="none"/>';
    if (wear && wear.tshirt && !wear.pj) s += '<path d="M' + (x - g.tw / 2 + 5) + ' ' + (y0 + 11) + 'L' + r1(x - g.tw / 2 + 5 + (handL.x - (x - g.tw / 2 + 5)) * 0.4) + ' ' + r1(y0 + 11 + (handL.y - y0 - 11) * 0.4) + 'M' + (x + g.tw / 2 - 5) + ' ' + (y0 + 11) + 'L' + r1(x + g.tw / 2 - 5 + (handR.x - (x + g.tw / 2 - 5)) * 0.4) + ' ' + r1(y0 + 11 + (handR.y - y0 - 11) * 0.4) + '" stroke="' + outD + '" stroke-width="16" stroke-linecap="round" fill="none"/>';
    // torse (tunique)
    var x1 = x - g.tw / 2, x2 = x + g.tw / 2, x3 = x + g.bw / 2, x4 = x - g.bw / 2, r = 12;
    s += '<path d="M' + x1 + ' ' + (y0 + r) + 'Q' + x1 + ' ' + y0 + ' ' + (x1 + r) + ' ' + y0 + 'L' + (x2 - r) + ' ' + y0 + 'Q' + x2 + ' ' + y0 + ' ' + x2 + ' ' + (y0 + r) + 'L' + x3 + ' ' + (y1 - 6) + 'Q' + x3 + ' ' + y1 + ' ' + (x3 - 6) + ' ' + y1 + 'L' + (x4 + 6) + ' ' + y1 + 'Q' + x4 + ' ' + y1 + ' ' + x4 + ' ' + (y1 - 6) + 'Z" fill="' + (wear ? (wear.pj ? PJ : wear.tshirt ? out : '#FFFFFF') : out) + '"/>';
    var beltY = y1 - Math.max(14, g.th * 0.3);
    if (wear) {
      if (wear.pj) { s += '<path d="M' + (x - 16) + ' ' + (y0 + 1) + 'v' + (g.th - 2) + 'M' + (x + 16) + ' ' + (y0 + 1) + 'v' + (g.th - 2) + 'M' + x + ' ' + (y0 + 12) + 'v' + (g.th - 13) + '" stroke="#fff" stroke-width="3" opacity=".7"/>'; if (!back) s += '<path d="M' + (x - 12) + ' ' + y0 + 'L' + x + ' ' + (y0 + 13) + 'L' + (x + 12) + ' ' + y0 + 'Z" fill="#fff"/><circle cx="' + x + '" cy="' + (y0 + 20) + '" r="2.6" fill="' + PJ_D + '"/><circle cx="' + x + '" cy="' + (y0 + 30) + '" r="2.6" fill="' + PJ_D + '"/>'; }
      else if (wear.tshirt) { if (!back) s += '<path d="M' + (x - 11) + ' ' + y0 + 'q11 12 22 0z" fill="' + skin + '"/><path d="M' + x + ' ' + (y0 + 17) + 'l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" fill="' + outL + '"/>'; }
      else { s += '<path d="M' + (x - 14) + ' ' + y0 + 'q14 16 28 0" stroke="' + skin + '" stroke-width="8" fill="none"/>'; }
      if (!wear.pj && !wear.trousers) s += '<rect x="' + r1(x4 + 2) + '" y="' + (y1 - 12) + '" width="' + (g.bw - 4) + '" height="15" rx="6" fill="#fff" stroke="#DCE3EE" stroke-width="2"/><circle cx="' + (x - 12) + '" cy="' + (y1 - 5) + '" r="2" fill="#F27BB1"/><circle cx="' + (x + 2) + '" cy="' + (y1 - 6) + '" r="2" fill="#2F8FE6"/><circle cx="' + (x + 14) + '" cy="' + (y1 - 4) + '" r="2" fill="#F5B833"/>';
      else if (wear.trousers && !wear.pj) s += '<rect x="' + r1(x4 + 1) + '" y="' + (y1 - 12) + '" width="' + (g.bw - 2) + '" height="14" rx="5" fill="#3F5FA8"/>';
    } else {
      if (!back) s += '<path d="M' + (x - 12) + ' ' + y0 + 'L' + x + ' ' + (y0 + 15) + 'L' + (x + 12) + ' ' + y0 + 'Z" fill="' + outL + '"/>';
      if (!opts.apron) s += '<rect x="' + r1(x4 + (g.bw - g.tw) * 0.1) + '" y="' + r1(beltY) + '" width="' + r1(g.bw - (g.bw - g.tw) * 0.2) + '" height="7" rx="3" fill="#5E3A1A"/>' + (back ? '' : '<rect x="' + (x - 6) + '" y="' + r1(beltY - 2) + '" width="12" height="11" rx="3" fill="#F5B833"/>');
    }
    if (opts.apron) s += back ? '<path d="M' + x1 + ' ' + (y0 + g.th * 0.55) + 'h' + g.tw + '" stroke="#FFF7E6" stroke-width="5"/><path d="M' + x + ' ' + (y0 + g.th * 0.55) + 'q-12-10-14 2q6 6 14-2q12-10 14 2q-6 6-14-2" fill="#FFF7E6"/>'
      : '<path d="M' + (x - 13) + ' ' + (y0 + 6) + 'h26l3 ' + r1(g.th * 0.42) + 'h' + r1(g.bw / 2 - 14) + 'v' + r1(g.th * 0.58 + 2) + 'q-' + r1(g.bw / 2 + 2) + ' 10-' + (g.bw + 4) + ' 0v-' + r1(g.th * 0.58 + 2) + 'h' + r1(g.bw / 2 - 14) + 'z" fill="#FFF7E6" stroke="#E9D9B4" stroke-width="2"/><path d="M' + (x - 13) + ' ' + (y0 + 6) + 'L' + (x - 9) + ' ' + y0 + 'M' + (x + 13) + ' ' + (y0 + 6) + 'L' + (x + 9) + ' ' + y0 + '" stroke="#FFF7E6" stroke-width="4"/><path d="M' + x + ' ' + r1(y0 + g.th * 0.72) + 'q-9-10-9-2q0 6 9 11q9-5 9-11q0-8-9 2z" fill="#F27BB1"/>';
    s += armorFront(opts.armor, g);
    // mains
    s += '<circle cx="' + handL.x + '" cy="' + r1(handL.y) + '" r="8.500" fill="' + skin + '"/><circle cx="' + handR.x + '" cy="' + r1(handR.y) + '" r="8.500" fill="' + skin + '"/>';
    if (acc === 'scarf') s += scarf(x, y0 + 4, g.tw + 2);
    // tête
    if (sp === 'elf') s += '<path d="M' + (x - g.hr + 5) + ' ' + (g.hy - 6) + 'L' + (x - g.hr - 20) + ' ' + (g.hy - 16) + 'L' + (x - g.hr + 3) + ' ' + (g.hy + 12) + 'ZM' + (x + g.hr - 5) + ' ' + (g.hy - 6) + 'L' + (x + g.hr + 20) + ' ' + (g.hy - 16) + 'L' + (x + g.hr - 3) + ' ' + (g.hy + 12) + 'Z" fill="' + skinD + '"/>';
    else s += '<circle cx="' + (x - g.hr + 1) + '" cy="' + (g.hy + 5) + '" r="8" fill="' + skinD + '"/><circle cx="' + (x + g.hr - 1) + '" cy="' + (g.hy + 5) + '" r="8" fill="' + skinD + '"/>';
    s += '<ellipse cx="' + x + '" cy="' + g.hy + '" rx="' + g.hr + '" ry="' + g.hry + '" fill="' + skin + '"/>';
    if (acc === 'beard') s += beard(hd, hc, sp === 'dwarf' || age === 'elder');
    var browC = (look.hairColor === 'white' || look.hairColor === 'gray' || look.hairColor === 'blond') ? shade(hc, -0.35) : shade(hc, -0.3);
    if (age === 'elder') s += '<path d="M' + (x - 30) + ' ' + (g.hy + 12) + 'q4 3 8 1M' + (x + 30) + ' ' + (g.hy + 12) + 'q-4 3-8 1M' + (x - 10) + ' ' + (g.hy - 22) + 'q10-3 20 0" stroke="#000" stroke-opacity=".2" stroke-width="2" fill="none" stroke-linecap="round"/>';
    if (back) { if (hair !== 'bald') s += '<ellipse cx="' + x + '" cy="' + (g.hy - 3) + '" rx="' + (g.hr + 1) + '" ry="' + (g.hry - 1) + '" fill="' + hc + '"/><path d="M' + (x - 14) + ' ' + (g.hy - g.hry + 9) + 'q14-7 28 0" stroke="' + shade(hc, 0.3) + '" stroke-opacity=".6" stroke-width="3" stroke-linecap="round" fill="none"/>'; }
    else s += face({ x: x, y: g.hy, s: hd.s, brow: browC, lid: skinD }, mood, { patch: acc === 'eyepatch', noNose: sp === 'dwarf', turn: turn });
    if (sp === 'dwarf') s += '<ellipse cx="' + x + '" cy="' + (g.hy + 12) + '" rx="7" ry="6" fill="' + skinD + '"/>';
    if (back) { /* cheveux déjà dessinés */ } else if (hat !== 'helmet') s += hairFront(hat === 'hood' && hair !== 'bald' ? 'short' : hair, hd, hc, age);
    else if (hair !== 'bald') s += '<path d="M' + (x - g.hr) + ' ' + (g.hy - 2) + 'q-3 10 1 18l5-2q-3-8-1-16zM' + (x + g.hr) + ' ' + (g.hy - 2) + 'q3 10-1 18l-5-2q3-8 1-16z" fill="' + hc + '"/>';
    s += hatFront(hat, hd, look);
    if (!back) s += accessoryFront(acc, hd, look, hc);
    return { inner: s, head: hd, bottom: g.feetY + 13 };
  }

  // ---------------------------------------------------------------- fantôme
  function ghost(look, mood) {
    var skin = SKIN[look.skin] || SKIN.white, sd = shade(skin, -0.14), hc = HAIR[look.hairColor] || HAIR.white;
    var out = validHex(look.outfit, '#9FD8E8');
    var hd = { x: 100, y: 92, rx: 44, ry: 40, s: 1.08 }, hat = look.hat || 'none', acc = look.accessory || 'none', hair = look.hair || 'bald', s = '';
    s += '<ellipse cx="100" cy="192" rx="34" ry="5" fill="#000" opacity=".12"/>';
    if (hat !== 'hood') s += hairBack(hair, hd, hc);
    s += hatBack(hat, hd, look);
    var body = 'M52 104C52 34 148 34 148 104L150 172q-12.500 14-25 0q-12.500 14-25 0q-12.500 14-25 0q-12.500 14-25 0Z';
    s += '<path d="' + body + '" fill="' + skin + '" opacity=".94"/>';
    s += '<path d="M51 150L150 150L150 172q-12.500 14-25 0q-12.500 14-25 0q-12.500 14-25 0q-12.500 14-25 0Z" fill="' + out + '" opacity=".4"/>';
    s += '<path d="M56 98q-16 6-18 24q10-2 18-12zM144 98q16 6 18 24q-10-2-18-12z" fill="' + skin + '" opacity=".94"/>';
    s += '<path d="M64 70q8-22 30-26" stroke="#fff" stroke-opacity=".7" stroke-width="5" stroke-linecap="round" fill="none"/>';
    if (acc === 'scarf') s += scarf(100, 136, 92);
    if (acc === 'beard') s += beard(hd, hc, false);
    s += face({ x: 100, y: 92, s: 1.08, brow: shade(sd, -0.4), lid: sd, cheek: false }, mood, { patch: acc === 'eyepatch', noNose: true });
    if (hat !== 'hood' && hat !== 'helmet' && hair !== 'bald') s += hairFront(hair, hd, hc, 'child');
    s += hatFront(hat, hd, look);
    s += accessoryFront(acc, hd, look, hc);
    return { inner: '<g class="ch-float">' + s + '</g>', head: hd, bottom: 196 };
  }

  // ---------------------------------------------------------------- yéti
  function yeti(look, mood) {
    var fur = SKIN[look.skin] || SKIN.white, fd = shade(fur, -0.12), faceC = look.skin === 'white' || !look.skin ? '#BFD4E8' : shade(fur, -0.25);
    var hc = HAIR[look.hairColor] || HAIR.white;
    var hd = { x: 100, y: 78, rx: 40, ry: 36, s: 1 }, hat = look.hat || 'none', acc = look.accessory || 'none', s = '';
    s += '<ellipse cx="100" cy="190" rx="60" ry="7" fill="#000" opacity=".16"/>';
    s += hatBack(hat, hd, look);
    s += '<ellipse cx="72" cy="182" rx="22" ry="10" fill="' + fd + '"/><ellipse cx="128" cy="182" rx="22" ry="10" fill="' + fd + '"/>';
    s += '<path d="M40 120q-22 26-10 52q14 6 20-8zM160 120q22 26 10 52q-14 6-20-8z" fill="' + fd + '"/>';
    s += '<ellipse cx="100" cy="132" rx="60" ry="54" fill="' + fur + '"/>';
    s += '<path d="M62 150l8 10 8-10 8 10 8-10 8 10 8-10 8 10 8-10 8 10 4-10" stroke="' + fd + '" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
    s += '<path d="M66 52l-14-22q16 2 24 14zM134 52l14-22q-16 2-24 14z" fill="#E9DDC4"/>';
    s += '<path d="M50 80q-10-8-4-22q8 2 10 10q2-12 14-18q2 10-2 16q10-12 24-12q-2 10-8 14q12-8 26-4q-6 8-12 10q14-2 22 8q-8 4-14 3q10 4 12 16z" fill="' + fur + '"/>';
    s += '<ellipse cx="100" cy="80" rx="48" ry="42" fill="' + fur + '"/>';
    s += '<ellipse cx="100" cy="84" rx="34" ry="29" fill="' + faceC + '"/>';
    if (acc === 'scarf') s += scarf(100, 120, 84);
    if (acc === 'beard') s += beard({ x: 100, y: 84, rx: 32, ry: 27 }, hc, true);
    s += face({ x: 100, y: 80, s: 0.95, brow: shade(faceC, -0.5), lid: shade(faceC, -0.15), cheek: false }, mood, { patch: acc === 'eyepatch' });
    s += hatFront(hat, { x: 100, y: 78, rx: 44, ry: 40 }, look);
    s += accessoryFront(acc, { x: 100, y: 80, rx: 44, ry: 40, s: 0.95 }, look, hc);
    return { inner: s, head: { x: 100, y: 78, rx: 46, ry: 42 }, bottom: 198 };
  }

  // ---------------------------------------------------------------- Mumblin (monstre d'encre)
  function mumblin(look, mood, opts) {
    var c = validHex(look.outfit, '#4B4B6A'), cd = shade(c, -0.3), cl = shade(c, 0.25), s = '';
    var eyes = (opts && opts.eyes) || 2;
    s += '<ellipse cx="100" cy="188" rx="52" ry="7" fill="#000" opacity=".18"/>';
    s += '<path d="M44 150q-18 4-22 20q14 2 26-8zM156 150q18 4 22 20q-14 2-26-8z" fill="' + cd + '"/>';
    s += '<ellipse cx="76" cy="182" rx="18" ry="8" fill="' + cd + '"/><ellipse cx="124" cy="182" rx="18" ry="8" fill="' + cd + '"/>';
    s += '<path d="M100 38C150 38 166 88 162 130C160 166 136 182 100 182C64 182 40 166 38 130C34 88 50 38 100 38Z" fill="' + c + '"/>';
    s += '<path d="M78 42q-6-20 4-30q8 12 6 28zM112 40q2-16 14-20q2 14-4 24z" fill="' + c + '"/>';
    s += '<path d="M56 86q6-28 30-36" stroke="' + cl + '" stroke-width="7" stroke-linecap="round" fill="none" opacity=".7"/>';
    s += '<circle cx="46" cy="160" r="5" fill="' + c + '"/><circle cx="158" cy="150" r="4" fill="' + c + '"/><circle cx="150" cy="170" r="3" fill="' + c + '"/>';
    var m = mood === 'neutral' || !mood ? 'angry' : mood; // un Mumblin est grognon par défaut
    if (eyes === 3) s += '<ellipse cx="100" cy="66" rx="10" ry="11" fill="#fff"/><circle cx="100" cy="68" r="5" fill="' + INK + '"/>';
    s += face({ x: 100, y: 100, s: 1.25, brow: cd, lid: cd, cheek: false }, m, { noNose: true, noMouth: true, openEyes: true });
    if (m === 'happy') s += '<path d="M78 134q22 18 44 0q-4 16-22 16q-18 0-22-16z" fill="#1B1626"/>';
    else if (m === 'sad') s += '<path d="M82 144q18-12 36 0" stroke="#1B1626" stroke-width="5" stroke-linecap="round" fill="none"/>';
    else if (m === 'surprised') s += '<ellipse cx="100" cy="140" rx="9" ry="11" fill="#1B1626"/>';
    else s += '<path d="M76 132h48l-4 14h-40z" fill="#1B1626"/><path d="M80 132l5 8 5-8 5 8 5-8 5 8 5-8 5 8 5-8" fill="#fff"/>';
    if (look.hat && look.hat !== 'none') s += hatFront(look.hat, { x: 100, y: 84, rx: 46, ry: 44 }, look);
    return { inner: s, head: { x: 100, y: 100, rx: 62, ry: 62 }, bottom: 198, top: 8 };
  }

  // ---------------------------------------------------------------- oiseau (Pico le perroquet) — repris de Parlo et adapté
  function bird(look, mood) {
    var g = validHex(look.outfit, '#58CC02'), gd = shade(g, -0.22), gl = shade(g, 0.4), beak = '#FF9600', beakD = '#E58600', s = '';
    s += '<g transform="translate(9 12) scale(.91)">';
    s += '<g transform="translate(60 150) rotate(25)"><ellipse cx="0" cy="22" rx="9" ry="30" fill="#FF4B4B"/><ellipse cx="-12" cy="18" rx="8" ry="26" fill="#1CB0F6"/><ellipse cx="10" cy="18" rx="8" ry="26" fill="#FFC800"/></g>';
    s += '<ellipse cx="100" cy="128" rx="56" ry="60" fill="' + g + '"/><ellipse cx="102" cy="142" rx="36" ry="42" fill="' + gl + '"/>';
    var up = mood === 'happy';
    s += '<g class="p-wing-l"><path d="' + (up ? 'M50 118c-22-6-34-26-30-46 12 6 30 22 42 36z' : 'M50 108c-16 10-16 36 0 50 8-8 14-22 18-42z') + '" fill="' + gd + '"/></g><g class="p-wing-r"><path d="' + (up ? 'M150 118c22-6 34-26 30-46-12 6-30 22-42 36z' : 'M150 108c16 10 16 36 0 50-8-8-14-22-18-42z') + '" fill="' + gd + '"/></g>';
    s += '<path d="M82 182l-6 12M82 182l0 13M82 182l6 12M118 182l-6 12M118 182l0 13M118 182l6 12" stroke="' + beak + '" stroke-width="5" stroke-linecap="round" fill="none"/>';
    if (look.accessory === 'scarf') s += '<path d="M60 108c20 14 60 14 80 0v16c-20 12-60 12-80 0z" fill="#FF4B4B"/><path d="M68 120l-4 34 14-2 2-30z" fill="#EA2B2B"/>';
    s += '<circle cx="100" cy="72" r="46" fill="' + g + '"/>';
    s += '<path d="M92 28c-2-10 4-18 10-20-1 6 1 10 4 12 2-8 8-12 14-12-4 6-4 12-2 16-10-2-18 0-26 4z" fill="' + gd + '"/>';
    s += '<circle cx="68" cy="88" r="8" fill="#FFB3B3" opacity=".6"/><circle cx="132" cy="88" r="8" fill="#FFB3B3" opacity=".6"/>';
    if (mood === 'happy') s += '<path d="M70 68q12-14 24 0M106 68q12-14 24 0" stroke="#2b2b2b" stroke-width="5" stroke-linecap="round" fill="none"/>';
    else {
      var dy = mood === 'sad' ? 3 : 0, pr = mood === 'sad' ? 6 : mood === 'surprised' ? 6 : 8, er = mood === 'surprised' ? 18 : 16;
      s += '<g class="p-eyes"><circle cx="82" cy="66" r="' + er + '" fill="#fff"/><circle cx="118" cy="66" r="' + er + '" fill="#fff"/><circle cx="84" cy="' + (67 + dy) + '" r="' + pr + '" fill="#2b2b2b"/><circle cx="120" cy="' + (67 + dy) + '" r="' + pr + '" fill="#2b2b2b"/><circle cx="87" cy="' + (63 + dy) + '" r="3" fill="#fff"/><circle cx="123" cy="' + (63 + dy) + '" r="3" fill="#fff"/></g>';
      if (mood === 'sad') s += '<path d="M68 50l20 6M132 50l-20 6" stroke="' + gd + '" stroke-width="5" stroke-linecap="round"/><path d="M76 84c0 6-4 8-4 13a4 4 0 0 0 8 0c0-5-4-7-4-13z" fill="#1CB0F6"/>';
      if (mood === 'angry') s += '<path d="M66 46l24 10M134 46l-24 10" stroke="' + gd + '" stroke-width="6" stroke-linecap="round"/>';
      if (mood === 'surprised') s += '<path d="M68 42q12-8 22-2M132 42q-12-8-22-2" stroke="' + gd + '" stroke-width="5" stroke-linecap="round" fill="none"/>';
    }
    if (mood === 'happy' || mood === 'surprised') s += '<path d="M86 84q14-6 28 0-2 14-14 18-12-4-14-18z" fill="#7a2e00"/><path d="M86 84q14-6 28 0-1 6-14 7-13-1-14-7z" fill="' + beak + '"/>';
    else if (mood === 'sad') s += '<path d="M86 88q14-6 28 0-4 10-14 12-10-2-14-12z" fill="' + beak + '"/><path d="M90 98q10-4 20 0-3 6-10 7-7-1-10-7z" fill="' + beakD + '"/>';
    else s += '<path d="M86 84q14-6 28 0-4 14-14 18-10-4-14-18z" fill="' + beak + '"/><path d="M90 97q10 4 20 0-3 6-10 8-7-2-10-8z" fill="' + beakD + '"/>';
    if (look.hat && look.hat !== 'none') s += hatFront(look.hat, { x: 100, y: 70, rx: 44, ry: 44 }, look);
    if (look.accessory === 'glasses') s += accessoryFront('glasses', { x: 100, y: 62, rx: 46, s: 1.3 }, look, '#333');
    s += '</g>';
    return { inner: s, head: { x: 100, y: 74, rx: 46, ry: 46 }, bottom: 198, top: 14, noFit: true };
  }

  // ---------------------------------------------------------------- API : Chars.svg(look, opts)
  var HAT_TOP = { wizard: 60, chef: 46, pirate: 36, crown: 24, straw: 20, beanie: 22, helmet: 12, hood: 22, bandana: 8, flower: 8, none: 6 };
  var HAIR_TOP = { bun: 26, spiky: 22, curly: 18 };
  var MOODS = { neutral: 1, happy: 1, sad: 1, surprised: 1, angry: 1 };
  // opts : { size, mood, bust, weapon, armor, cls, flip, label }
  function svg(look, opts) {
    look = look || {}; opts = opts || {};
    var mood = MOODS[opts.mood] ? opts.mood : 'neutral', sp = look.species || 'human', d;
    if (sp === 'bird') d = bird(look, mood);
    else if (sp === 'mumblin') d = mumblin(look, mood, opts);
    else if (sp === 'ghost') d = ghost(look, mood);
    else if (sp === 'yeti') d = yeti(look, mood);
    else d = humanoid(look, mood, opts);
    var hd = d.head, hat = look.hat || 'none';
    var top = d.top !== undefined ? d.top : hd.y - hd.ry - Math.max(HAT_TOP[hat] || 6, sp === 'bird' || sp === 'mumblin' ? 0 : (HAIR_TOP[look.hair] || 0));
    if (sp === 'yeti') top = Math.min(top, 26);
    var size = opts.size || 120, vb, inner = d.inner;
    if (opts.bust) {
      var bTop = top - 3, side = Math.max(2 * (hd.rx + 30), hd.y + hd.ry + 26 - bTop);
      if (sp === 'mumblin' || sp === 'bird') { bTop = 4; side = 192; }
      vb = r1(100 - side / 2) + ' ' + r1(bTop) + ' ' + r1(side) + ' ' + r1(side);
    } else {
      vb = '0 0 200 200';
      if (!d.noFit) {
        var bottom = d.bottom || 196;
        var k = Math.min(1.14, 190 / (bottom - top)), tx = 100 - 100 * k, ty = 197 - bottom * k;
        inner = '<g transform="translate(' + r1(tx) + ' ' + r1(ty) + ') scale(' + r1(k * 100) / 100 + ')">' + inner + '</g>';
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" class="ch ch-' + sp + ' mood-' + mood + (opts.cls ? ' ' + opts.cls : '') + '" width="' + size + '" height="' + size + '" viewBox="' + vb + '"' + (opts.flip ? ' style="transform:scaleX(-1)"' : '') + (opts.label ? ' role="img" aria-label="' + String(opts.label).replace(/"/g, '&quot;') + '"' : ' aria-hidden="true"') + '>' + inner + '</svg>';
  }

  var PICO_LOOK = { species: 'bird', age: 'adult', skin: 'green', hair: 'spiky', hairColor: 'green', hat: 'none', outfit: '#58CC02', accessory: 'none', emoji: '🦜' };
  // Pico pour le lecteur de leçon (API de Parlo) : { mood: happy|sad|party|think, size, cls }
  function pico(opts) {
    opts = opts || {};
    var map = { happy: 'neutral', party: 'happy', sad: 'sad', think: 'surprised', neutral: 'neutral', surprised: 'surprised', angry: 'angry' };
    var mood = map[opts.mood] || 'neutral';
    return '<span class="pico ' + (opts.cls || '') + (opts.mood === 'party' ? ' party' : '') + ' mood-' + mood + '" aria-hidden="true">' + svg(PICO_LOOK, { size: opts.size || 100, mood: mood }) + '</span>';
  }
  function heroLook(state) {
    var h = (state && state.hero) || {};
    return { species: 'human', age: 'child', skin: h.skin || 'light', hair: h.hair || 'short', hairColor: h.hairColor || 'brown', hat: 'none', outfit: validHex(h.outfit, '#2F8FE6'), accessory: 'none', emoji: h.gender === 'm' ? '👦' : '👧' };
  }
  // Chaîne SVG carrée du héros (vue de face, équipement visible) — passée à Combat.start (hero.svg).
  // opts.wear (tenue de la maison : 'pyjamas', 'undies', 'dressed' ou { tshirt, trousers, socks, shoes }) remplace l'équipement.
  function heroSvg(state, opts) {
    opts = Object.assign({ size: 200 }, opts || {});
    if (opts.wear) { opts.weapon = null; opts.armor = null; }
    var eq = (state && state.equip) || {};
    if (opts.weapon === undefined) opts.weapon = eq.weapon || null;
    if (opts.armor === undefined) opts.armor = eq.armor || null;
    return svg(heroLook(state), opts);
  }
  function picoSvg(opts) { return svg(PICO_LOOK, Object.assign({ size: 200 }, opts || {})); }
  function npc(id) {
    var G = window.GAME || {}, cat = G.catalog || {};
    if (id === 'pico') return cat.npcs && cat.npcs.pico || { name: 'Pico', look: PICO_LOOK };
    if (cat.npcs && cat.npcs[id]) return cat.npcs[id];
    var chs = G.chapters || [];
    for (var i = 0; i < chs.length; i++) if (chs[i].npcs && chs[i].npcs[id]) {
      var n = chs[i].npcs[id];
      if (id !== 'mum') return n;
      var h = (window.Store && window.Store.state && window.Store.state.hero) || {}, lk = Object.assign({}, n.look);
      if (SKIN[h.skin]) lk.skin = h.skin; if (HAIR[h.hairColor]) lk.hairColor = h.hairColor;
      if (h.hair === lk.hair) lk.hair = 'ponytail';
      return Object.assign({}, n, { look: lk });
    }
    return null;
  }


  // ---------------------------------------------------------------- créatures spéciales (boss et PNJ sans espèce adaptée)
  function troll(c, mood) { // Bramble, le troll de ronces
    var cd = shade(c, -0.3), cl = shade(c, 0.25), m = mood === 'neutral' || !mood ? 'sad' : mood, s = '';
    s += '<ellipse cx="100" cy="190" rx="66" ry="8" fill="#000" opacity=".18"/>';
    s += '<path d="M40 90l-22-14M48 70l-14-22M160 90l22-14M152 70l14-22M80 54l-6-24M120 54l6-24M30 130l-18 4M170 130l18 4" stroke="' + cd + '" stroke-width="8" stroke-linecap="round"/>';
    s += '<path d="M36 186q-14-80 20-112q20-22 44-22q24 0 44 22q34 32 20 112z" fill="' + c + '"/>';
    s += '<path d="M52 176q-6-50 14-78" stroke="' + cl + '" stroke-width="8" stroke-linecap="round" fill="none" opacity=".5"/>';
    s += '<path d="M44 150q20-12 36 4t40-6 36 6" stroke="' + cd + '" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M60 146l-4-10M92 158l2-11M124 150l-3-10M148 152l5-9" stroke="' + cd + '" stroke-width="4" stroke-linecap="round"/>';
    s += '<circle cx="60" cy="166" r="7" fill="#E5484D"/><circle cx="142" cy="170" r="7" fill="#E5484D"/><circle cx="122" cy="62" r="7" fill="#FF8FC0"/><circle cx="122" cy="62" r="2.500" fill="#FFE066"/><path d="M70 60q-10-2-12 8q10 2 12-8z" fill="#7BD66A"/>';
    s += face({ x: 100, y: 108, s: 1.25, brow: cd, lid: cd, cheek: m === 'happy' }, m, { openEyes: true, noMouth: true });
    s += mouth(100, 136, 1.3, m) + (m === 'happy' ? '' : '<path d="M86 ' + (m === 'sad' ? 139 : 136) + 'v7M114 ' + (m === 'sad' ? 139 : 136) + 'v7" stroke="#fff" stroke-width="6" stroke-linecap="round"/>');
    return s;
  }
  function wyvern(c, mood) { // Glacia, la wyverne de givre
    var cd = shade(c, -0.28), dk = shade(c, -0.55), s = '';
    s += '<ellipse cx="100" cy="190" rx="70" ry="8" fill="#000" opacity=".15"/>';
    s += '<path d="M100 100L14 36q-4 62 40 92zM100 100L186 36q4 62-40 92z" fill="' + cd + '"/><path d="M100 100L34 58M100 100L50 96M100 100L166 58M100 100L150 96" stroke="' + c + '" stroke-width="4" stroke-linecap="round" opacity=".7"/>';
    s += '<path d="M132 170q40 6 46-18q-10 12-26 4z" fill="' + cd + '"/>';
    s += '<path d="M60 186q-8-50 40-80q48 30 40 80z" fill="' + c + '"/><path d="M78 186q-2-30 22-48q24 18 22 48z" fill="#fff" opacity=".6"/><path d="M84 160h32M82 172h36" stroke="' + cd + '" stroke-width="2.500" opacity=".5"/>';
    s += '<path d="M62 100q-4-50 38-62q42 12 38 62q-10 22-38 22q-28 0-38-22z" fill="' + c + '"/>';
    s += '<path d="M72 46l-12-28 26 16zM128 46l12-28-26 16z" fill="#fff"/><path d="M96 38l4-12 4 12z" fill="#fff"/>';
    s += '<ellipse cx="100" cy="104" rx="26" ry="15" fill="' + shade(c, 0.3) + '"/>';
    s += face({ x: 100, y: 74, s: 1.05, brow: dk, lid: cd, cheek: false }, mood, { noMouth: true, noNose: true, openEyes: true });
    s += '<circle cx="92" cy="98" r="2.500" fill="' + dk + '"/><circle cx="108" cy="98" r="2.500" fill="' + dk + '"/>';
    if (mood === 'happy') s += '<path d="M82 106q18 14 36 0q-4 12-18 12q-14 0-18-12z" fill="#7A2430"/><path d="M88 108l4 6 4-6M104 108l4 6 4-6" fill="#fff"/>';
    else if (mood === 'surprised') s += '<ellipse cx="100" cy="110" rx="7" ry="6" fill="#7A2430"/>';
    else s += '<path d="M84 ' + (mood === 'sad' || mood === 'angry' ? 112 : 108) + 'q16 ' + (mood === 'sad' || mood === 'angry' ? -8 : 8) + ' 32 0" stroke="' + dk + '" stroke-width="4" fill="none" stroke-linecap="round"/>';
    return s;
  }
  function gateDoor(mood) { // The Dream Gate, la porte qui parle
    var s = '<ellipse cx="100" cy="192" rx="62" ry="6" fill="#000" opacity=".16"/>';
    s += '<path d="M34 190V84q0-66 66-66t66 66v106z" fill="#6E5A8C"/><path d="M34 84q0-66 66-66t66 66" stroke="#C9B8F0" stroke-width="5" fill="none"/>';
    s += '<path d="M48 190V86q0-52 52-52t52 52v104z" fill="#FF86D0"/><path d="M48 190V86q0-52 52-52v156z" fill="#FF9FDB"/><path d="M100 34v156" stroke="#D45FA8" stroke-width="3"/>';
    s += '<path d="M60 150h28v30H60zM112 150h28v30h-28z" fill="#E873BD" stroke="#D45FA8" stroke-width="2.500"/>';
    s += '<circle cx="90" cy="134" r="5" fill="#FFE58A" stroke="#C98A12" stroke-width="2"/><circle cx="110" cy="134" r="5" fill="#FFE58A" stroke="#C98A12" stroke-width="2"/>';
    s += '<path d="M100 6l5 10 11 1.500-8 7.500 2 11-10-5.500-10 5.500 2-11-8-7.500 11-1.500z" fill="#FFE58A" stroke="#F5B833" stroke-width="2" stroke-linejoin="round"/>';
    s += '<circle cx="58" cy="60" r="3" fill="#fff" opacity=".8"/><circle cx="146" cy="72" r="2.500" fill="#fff" opacity=".8"/><circle cx="140" cy="44" r="2" fill="#fff" opacity=".8"/>';
    s += face({ x: 100, y: 84, s: 1.1, brow: '#8E3A78', lid: '#E873BD', cheek: true }, mood, { noNose: true });
    return s;
  }
  var SPECIAL_NPC = {
    glacia_npc: function (look, mood) { return wyvern(validHex(look && look.outfit, '#8FD3FF'), mood); },
    bramble_npc: function (look, mood) { return troll(validHex(look && look.outfit, '#3E6B2F'), mood); },
    gate: function (look, mood) { return gateDoor(mood); }
  };
  var SPECIAL_BUST = { glacia_npc: '26 6 148 148', bramble_npc: '22 30 156 156', gate: '22 2 156 156' };
  // Personnage par id (PNJ global ou de chapitre) : gère les créatures dessinées à part.
  function npcSvg(id, opts) {
    opts = opts || {};
    var n = npc(id), mood = MOODS[opts.mood] ? opts.mood : 'neutral';
    if (SPECIAL_NPC[id]) {
      var size = opts.size || 120;
      return '<svg xmlns="http://www.w3.org/2000/svg" class="ch ch-special mood-' + mood + (opts.cls ? ' ' + opts.cls : '') + '" width="' + size + '" height="' + size + '" viewBox="' + (opts.bust ? SPECIAL_BUST[id] : '0 0 200 200') + '" aria-hidden="true">' + SPECIAL_NPC[id](n && n.look, mood) + '</svg>';
    }
    if (!n) return svg({ species: 'human' }, opts);
    if (id === 'hush' && mood === 'neutral') opts = Object.assign({}, opts, { mood: 'angry' });
    if (id === 'mum') opts = Object.assign({ apron: true }, opts);
    return svg(n.look, opts);
  }

  // ---------------------------------------------------------------- ennemis & boss (bestiaire, écrans de butin)
  function enemySvg(id, size) {
    var cat = (window.GAME && window.GAME.catalog) || {}, all = (cat.enemies || []).concat(cat.bosses || []), e = null;
    all.forEach(function (x) { if (x.id === id) e = x; });
    var c = validHex(e && e.color, '#4B4B6A'), cd = shade(c, -0.3), cl = shade(c, 0.3), s = '', look;
    size = size || 96;
    function wrap(inner) { return '<svg xmlns="http://www.w3.org/2000/svg" class="ch ch-enemy" width="' + size + '" height="' + size + '" viewBox="0 0 200 200" aria-hidden="true">' + inner + '</svg>'; }
    switch (id) {
      case 'mumblin': return svg({ species: 'mumblin', outfit: c }, { size: size });
      case 'grumble': return svg({ species: 'mumblin', outfit: c, hat: 'crown' }, { size: size, eyes: 3 });
      case 'blot':
        s = '<ellipse cx="100" cy="186" rx="70" ry="8" fill="#000" opacity=".18"/><path d="M30 150C20 100 60 70 100 70C140 70 180 100 170 150C166 178 140 186 100 186C60 186 34 178 30 150Z" fill="' + c + '"/><circle cx="34" cy="176" r="8" fill="' + c + '"/><circle cx="170" cy="178" r="6" fill="' + c + '"/><circle cx="150" cy="80" r="7" fill="' + c + '"/><path d="M50 120q8-26 34-34" stroke="' + cl + '" stroke-width="7" stroke-linecap="round" fill="none" opacity=".6"/>' + face({ x: 100, y: 122, s: 1.2, brow: cd, lid: cd, cheek: false }, 'sad', { noNose: true, openEyes: true });
        return wrap(s);
      case 'shushbat':
        s = '<path d="M100 110L20 60q4 40 30 50q-14 4-18 20q30 4 68-10zM100 110L180 60q-4 40-30 50q14 4 18 20q-30 4-68-10z" fill="' + cd + '"/><ellipse cx="100" cy="112" rx="40" ry="42" fill="' + c + '"/><path d="M70 78l-6-30 24 18zM130 78l6-30-24 18z" fill="' + c + '"/>' + face({ x: 100, y: 106, s: 0.95, brow: cd, lid: cd, cheek: false }, 'angry', { noNose: true, noMouth: true, openEyes: true }) + '<path d="M88 132l5 9 7-9 7 9 5-9z" fill="#fff"/>';
        return wrap(s);
      case 'spitter':
        s = '<ellipse cx="100" cy="188" rx="48" ry="7" fill="#000" opacity=".18"/><path d="M60 186q-10-70 40-110q50 40 40 110z" fill="' + c + '"/><path d="M74 100l-16-18M126 100l16-18M100 78V54" stroke="' + cd + '" stroke-width="7" stroke-linecap="round"/><circle cx="100" cy="150" r="16" fill="#1B1626"/><circle cx="100" cy="150" r="8" fill="' + cl + '"/>' + face({ x: 100, y: 106, s: 0.9, brow: cd, lid: cd, cheek: false }, 'angry', { noNose: true, noMouth: true, openEyes: true });
        return wrap(s);
      case 'hushguard':
        s = '<ellipse cx="100" cy="190" rx="52" ry="7" fill="#000" opacity=".18"/><rect x="56" y="84" width="88" height="96" rx="20" fill="' + c + '"/><rect x="56" y="120" width="88" height="10" fill="' + cd + '"/><path d="M52 60q48-44 96 0v34H52z" fill="' + cl + '"/><rect x="66" y="64" width="68" height="14" rx="5" fill="#1B1626"/><circle cx="86" cy="71" r="4" fill="#7FD6FF"/><circle cx="114" cy="71" r="4" fill="#7FD6FF"/><path d="M100 22v22" stroke="#E5484D" stroke-width="8" stroke-linecap="round"/><rect x="26" y="96" width="34" height="52" rx="12" fill="' + cd + '"/><rect x="140" y="96" width="34" height="52" rx="12" fill="' + cd + '"/><path d="M100 138l14 8v14q0 12-14 18q-14-6-14-18v-14z" fill="' + cl + '" stroke="' + cd + '" stroke-width="3"/>';
        return wrap(s);
      case 'whisper':
        s = '<circle cx="100" cy="104" r="62" fill="' + c + '" opacity=".25"/><path d="M100 30q40 34 40 74a40 40 0 0 1-80 0q0-24 18-42q2 14 10 18q-4-26 12-50z" fill="' + c + '"/><path d="M100 70q20 20 20 40a20 20 0 0 1-40 0q0-18 20-40z" fill="#fff" opacity=".6"/>' + face({ x: 100, y: 112, s: 0.8, brow: cd, cheek: false }, 'surprised', { noNose: true });
        return wrap(s);
      case 'frostling':
        s = '<ellipse cx="100" cy="188" rx="46" ry="7" fill="#000" opacity=".15"/><path d="M100 26l22 34 34 6-18 30 14 34-34 8-18 46-18-46-34-8 14-34-18-30 34-6z" fill="' + c + '" stroke="' + cd + '" stroke-width="4" stroke-linejoin="round"/><path d="M84 60l-6 26M116 60l12 20" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".7"/>' + face({ x: 100, y: 104, s: 0.9, brow: shade(c, -0.5), lid: cd, cheek: false }, 'angry', { noNose: true });
        return wrap(s);
      case 'silent_knight':
        s = '<ellipse cx="100" cy="190" rx="54" ry="7" fill="#000" opacity=".18"/><path d="M60 96h80l8 84H52z" fill="' + c + '"/><path d="M56 56q44-46 88 0v44H56z" fill="' + cl + '"/><path d="M70 66h60v8H104v22h-8V74H70z" fill="#1B1626"/><path d="M100 14q16 10 6 30h-12q-10-20 6-30z" fill="#9A63E0"/><rect x="150" y="50" width="8" height="120" rx="3" fill="#C9D2DC"/><path d="M154 30l10 24h-20z" fill="#C9D2DC"/><path d="M30 104q26-10 40 0v36q0 22-20 32q-20-10-20-32z" fill="' + cd + '" stroke="' + cl + '" stroke-width="4"/>';
        return wrap(s);
      case 'bramble': return wrap(troll(c, 'sad'));
      case 'captain_blank': look = { species: 'ghost', skin: 'blue', hair: 'bald', hat: 'pirate', accessory: 'beard', hairColor: 'white', outfit: c }; return svg(look, { size: size, mood: 'sad' });
      case 'glacia': return wrap(wyvern(c, 'angry'));
      case 'lord_hush': return svg(cat.npcs && cat.npcs.hush ? cat.npcs.hush.look : { species: 'human', skin: 'gray', hat: 'hood', outfit: c }, { size: size, mood: 'angry' });
    }
    return svg({ species: 'mumblin', outfit: c }, { size: size });
  }

  // ---------------------------------------------------------------- éléments de décor (réutilisés par la carte)
  var D = {
    cloud: function (x, y, k, o) { k = k || 1; return '<g opacity="' + (o || 0.9) + '" fill="#fff"><ellipse cx="' + x + '" cy="' + y + '" rx="' + 30 * k + '" ry="' + 12 * k + '"/><circle cx="' + (x - 12 * k) + '" cy="' + (y - 7 * k) + '" r="' + 12 * k + '"/><circle cx="' + (x + 8 * k) + '" cy="' + (y - 11 * k) + '" r="' + 15 * k + '"/></g>'; },
    tree: function (x, y, k, c) { k = k || 1; c = c || '#3E9B4F'; return '<rect x="' + (x - 4 * k) + '" y="' + (y - 22 * k) + '" width="' + 8 * k + '" height="' + 24 * k + '" rx="' + 3 * k + '" fill="#7A4A22"/><circle cx="' + x + '" cy="' + (y - 38 * k) + '" r="' + 22 * k + '" fill="' + c + '"/><circle cx="' + (x - 14 * k) + '" cy="' + (y - 28 * k) + '" r="' + 14 * k + '" fill="' + c + '"/><circle cx="' + (x + 14 * k) + '" cy="' + (y - 28 * k) + '" r="' + 14 * k + '" fill="' + c + '"/><circle cx="' + (x - 6 * k) + '" cy="' + (y - 44 * k) + '" r="' + 9 * k + '" fill="#fff" opacity=".14"/>'; },
    pine: function (x, y, k, c, snow) { k = k || 1; c = c || '#2E7D5B'; var s = '<rect x="' + (x - 3 * k) + '" y="' + (y - 10 * k) + '" width="' + 6 * k + '" height="' + 12 * k + '" fill="#5E3A1A"/>'; for (var i = 0; i < 3; i++) { var w = (20 - i * 5) * k, ty = y - (8 + i * 16) * k; s += '<path d="M' + (x - w) + ' ' + ty + 'L' + x + ' ' + (ty - 24 * k) + 'L' + (x + w) + ' ' + ty + 'Z" fill="' + c + '"/>'; if (snow) s += '<path d="M' + (x - w * 0.5) + ' ' + (ty - 12 * k) + 'L' + x + ' ' + (ty - 24 * k) + 'L' + (x + w * 0.5) + ' ' + (ty - 12 * k) + 'q-' + w * 0.25 + ' ' + 5 * k + '-' + w * 0.5 + ' 0q-' + w * 0.25 + ' ' + 5 * k + '-' + w * 0.5 + ' 0Z" fill="#fff"/>'; } return s; },
    mountain: function (x, y, w, h, c, snow) { return '<path d="M' + (x - w / 2) + ' ' + y + 'L' + x + ' ' + (y - h) + 'L' + (x + w / 2) + ' ' + y + 'Z" fill="' + c + '"/>' + (snow === false ? '' : '<path d="M' + (x - w * 0.14) + ' ' + (y - h * 0.72) + 'L' + x + ' ' + (y - h) + 'L' + (x + w * 0.14) + ' ' + (y - h * 0.72) + 'l-' + w * 0.07 + ' ' + h * 0.07 + 'l-' + w * 0.07 + ' -' + h * 0.05 + 'l-' + w * 0.07 + ' ' + h * 0.06 + 'Z" fill="#fff"/>'); },
    house: function (x, y, k, wall, roof) { k = k || 1; return '<rect x="' + (x - 22 * k) + '" y="' + (y - 30 * k) + '" width="' + 44 * k + '" height="' + 30 * k + '" rx="' + 3 * k + '" fill="' + (wall || '#FBEBC8') + '"/><path d="M' + (x - 28 * k) + ' ' + (y - 28 * k) + 'L' + x + ' ' + (y - 54 * k) + 'L' + (x + 28 * k) + ' ' + (y - 28 * k) + 'Z" fill="' + (roof || '#D9542B') + '"/><rect x="' + (x - 6 * k) + '" y="' + (y - 17 * k) + '" width="' + 12 * k + '" height="' + 17 * k + '" rx="' + 5 * k + '" fill="#7A4A22"/><rect x="' + (x + 9 * k) + '" y="' + (y - 22 * k) + '" width="' + 8 * k + '" height="' + 8 * k + '" rx="1.5" fill="#9CD6F5"/>'; },
    tower: function (x, y, k, c, top) { k = k || 1; c = c || '#8A8F9C'; return '<rect x="' + (x - 12 * k) + '" y="' + (y - 70 * k) + '" width="' + 24 * k + '" height="' + 70 * k + '" fill="' + c + '"/><path d="M' + (x - 16 * k) + ' ' + (y - 68 * k) + 'L' + x + ' ' + (y - 100 * k) + 'L' + (x + 16 * k) + ' ' + (y - 68 * k) + 'Z" fill="' + (top || '#5A5F72') + '"/><rect x="' + (x - 4 * k) + '" y="' + (y - 54 * k) + '" width="' + 8 * k + '" height="' + 12 * k + '" rx="' + 4 * k + '" fill="#2A1F3D" opacity=".6"/>'; },
    boat: function (x, y, k, sail) { k = k || 1; return '<path d="M' + (x - 24 * k) + ' ' + (y - 8 * k) + 'h' + 48 * k + 'l-' + 8 * k + ' ' + 12 * k + 'h-' + 32 * k + 'z" fill="#8B5A2B"/><rect x="' + (x - 1.5 * k) + '" y="' + (y - 46 * k) + '" width="' + 3 * k + '" height="' + 38 * k + '" fill="#5E3A1A"/><path d="M' + (x + 3 * k) + ' ' + (y - 44 * k) + 'q' + 22 * k + ' ' + 14 * k + ' ' + 2 * k + ' ' + 30 * k + 'z" fill="' + (sail || '#fff') + '"/><path d="M' + (x - 3 * k) + ' ' + (y - 40 * k) + 'q-' + 16 * k + ' ' + 12 * k + '-' + 2 * k + ' ' + 26 * k + 'z" fill="' + (sail || '#fff') + '" opacity=".85"/>'; },
    waves: function (y, c, n) { var s = '<path d="M0 ' + y; for (var i = 0; i < (n || 10); i++) s += 'q10-7 20 0t20 0'; return s + '" stroke="' + (c || '#fff') + '" stroke-width="2.5" fill="none" opacity=".6" stroke-linecap="round"/>'; },
    flowers: function (pts, c) { return pts.map(function (p, i) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3.2" fill="' + (c || ['#FFE066', '#FF8FC0', '#fff'][i % 3]) + '"/>'; }).join(''); },
    stars: function (pts) { return pts.map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + (p[2] || 1.6) + '" fill="#fff" opacity=".85"/>'; }).join(''); }
  };
  function grad(id, stops, horizontal) {
    return '<linearGradient id="' + id + '" x1="0" y1="0" x2="' + (horizontal ? 1 : 0) + '" y2="' + (horizontal ? 0 : 1) + '">' + stops.map(function (st, i) { return '<stop offset="' + (st[1] !== undefined ? st[1] : i / (stops.length - 1)) + '" stop-color="' + st[0] + '"/>'; }).join('') + '</linearGradient>';
  }
  function planks(y, h, c, cd) { var s = '<rect x="0" y="' + y + '" width="400" height="' + h + '" fill="' + c + '"/>'; for (var i = 1; i * 26 < h; i++) s += '<path d="M0 ' + (y + i * 26) + 'h400" stroke="' + cd + '" stroke-width="2.5"/>'; for (var j = 0; j < 7; j++) s += '<path d="M' + (30 + j * 62) + ' ' + (y + (j % 3) * 26) + 'v26" stroke="' + cd + '" stroke-width="2.5"/>'; return s; }

  // ---------------------------------------------------------------- décors (14 types de catalog.bgTypes)
  var BG = {
    bedroom: function (g) {
      var stars = ''; [[40, 60], [120, 36], [330, 70], [370, 190], [30, 200], [250, 40], [300, 250]].forEach(function (p, i) { stars += '<path d="M' + p[0] + ' ' + p[1] + 'l3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1z" fill="#fff" opacity="' + (i % 2 ? '.5' : '.75') + '"/>'; });
      return '<defs>' + grad(g, [['#A9D4F7'], ['#CFE8FB']]) + '</defs><rect width="400" height="600" fill="url(#' + g + ')"/>' + stars +
        '<rect x="0" y="330" width="400" height="14" fill="#F4F9FF"/>' + planks(344, 256, '#D9A66B', '#B98045') +
        '<rect x="128" y="70" width="144" height="150" rx="8" fill="#8B5A2B"/><rect x="138" y="80" width="124" height="130" rx="4" fill="#BFE8FF"/><circle cx="226" cy="118" r="20" fill="#FFE066"/><circle cx="226" cy="118" r="30" fill="#FFE066" opacity=".3"/><path d="M138 170q30-26 62-6t62-14v60H138z" fill="#8ED468"/><path d="M200 80v130M138 145h124" stroke="#8B5A2B" stroke-width="6"/>' +
        '<rect x="112" y="56" width="176" height="12" rx="6" fill="#5E3A1A"/><path d="M118 66h34q10 80-8 164h-26z" fill="#F27BB1"/><path d="M282 66h-34q-10 80 8 164h26z" fill="#F27BB1"/><path d="M130 66q6 80-6 164M270 66q-6 80 6 164" stroke="#D95C96" stroke-width="3" fill="none"/>' +
        '<rect x="300" y="150" width="88" height="10" rx="3" fill="#8B5A2B"/><rect x="308" y="118" width="14" height="32" rx="3" fill="#E5484D"/><rect x="324" y="110" width="12" height="40" rx="3" fill="#3DBB6B"/><rect x="338" y="122" width="16" height="28" rx="3" fill="#F5B833"/><rect x="356" y="114" width="12" height="36" rx="3" fill="#2F8FE6"/>' +
        '<rect x="-6" y="262" width="150" height="96" rx="12" fill="#8B5A2B"/><rect x="-6" y="296" width="158" height="70" rx="12" fill="#5FB0F2"/><rect x="-6" y="296" width="158" height="18" rx="9" fill="#EAF6FF"/><rect x="4" y="270" width="70" height="34" rx="14" fill="#fff"/><circle cx="110" cy="334" r="6" fill="#fff" opacity=".6"/><circle cx="60" cy="346" r="6" fill="#fff" opacity=".6"/>' +
        '<ellipse cx="250" cy="470" rx="120" ry="34" fill="#F5B833" opacity=".8"/><ellipse cx="250" cy="470" rx="90" ry="22" fill="#FFE58A" opacity=".8"/>' +
        '<rect x="318" y="300" width="64" height="48" rx="6" fill="#E5484D"/><rect x="314" y="292" width="72" height="14" rx="5" fill="#C0392B"/><circle cx="336" cy="290" r="12" fill="#B98045"/><circle cx="328" cy="280" r="5" fill="#B98045"/><circle cx="344" cy="280" r="5" fill="#B98045"/>';
    },
    bathroom: function (g) {
      var tiles = ''; for (var i = 1; i < 10; i++) tiles += '<path d="M' + i * 40 + ' 0v330"/>'; for (var j = 1; j < 9; j++) tiles += '<path d="M0 ' + j * 40 + 'h400"/>';
      var fl = ''; for (var r = 0; r < 6; r++) for (var c = 0; c < 9; c++) if ((r + c) % 2) fl += '<rect x="' + c * 46 + '" y="' + (340 + r * 46) + '" width="46" height="46"/>';
      return '<defs>' + grad(g, [['#BFEDE6'], ['#DDF7F2']]) + '</defs><rect width="400" height="600" fill="url(#' + g + ')"/><g stroke="#fff" stroke-width="3" opacity=".7">' + tiles + '</g><rect x="0" y="150" width="400" height="12" fill="#5CC8B8" opacity=".6"/>' +
        '<rect x="0" y="340" width="400" height="260" fill="#EAF6FF"/><g fill="#B9DDF5">' + fl + '</g><rect x="0" y="334" width="400" height="10" fill="#fff"/>' +
        '<ellipse cx="120" cy="120" rx="58" ry="70" fill="#8B5A2B"/><ellipse cx="120" cy="120" rx="48" ry="60" fill="#DFF3FF"/><path d="M92 90q10-20 30-26" stroke="#fff" stroke-width="7" stroke-linecap="round" fill="none"/>' +
        '<rect x="62" y="250" width="116" height="26" rx="12" fill="#fff"/><path d="M70 270h100l-12 60H82z" fill="#F4F9FF"/><rect x="112" y="226" width="16" height="26" rx="6" fill="#C9D2DC"/><path d="M120 228q20-4 22 12" stroke="#C9D2DC" stroke-width="8" fill="none" stroke-linecap="round"/><rect x="150" y="238" width="22" height="12" rx="5" fill="#F9B4D0"/>' +
        '<rect x="216" y="196" width="150" height="8" rx="4" fill="#C9D2DC"/><rect x="232" y="200" width="56" height="76" rx="5" fill="#FFB347"/><path d="M232 220h56M232 240h56" stroke="#fff" stroke-width="5" opacity=".7"/><rect x="302" y="200" width="46" height="60" rx="5" fill="#7FCBF5"/>' +
        '<path d="M200 330h200v60q0 40-40 40H240q-40 0-40-40z" fill="#fff"/><path d="M196 322h208v18H196z" fill="#F4F9FF"/><rect x="196" y="318" width="208" height="12" rx="6" fill="#fff"/><circle cx="250" cy="312" r="14" fill="#fff" opacity=".8"/><circle cx="276" cy="306" r="18" fill="#fff" opacity=".8"/><circle cx="306" cy="312" r="13" fill="#fff" opacity=".8"/><path d="M330 300q14-12 26 0q4 14-12 16q-16 0-14-16z" fill="#FFD23F"/><path d="M356 298l10 3-10 4z" fill="#FF9600"/><circle cx="348" cy="298" r="2.5" fill="#2B2530"/>';
    },
    kitchen: function (g) {
      var fl = ''; for (var r = 0; r < 6; r++) for (var c = 0; c < 9; c++) if ((r + c) % 2) fl += '<rect x="' + c * 46 + '" y="' + (340 + r * 46) + '" width="46" height="46"/>';
      return '<defs>' + grad(g, [['#FFE9B8'], ['#FFF3D6']]) + '</defs><rect width="400" height="600" fill="url(#' + g + ')"/>' +
        '<rect x="0" y="340" width="400" height="260" fill="#FFF7E6"/><g fill="#F2B880">' + fl + '</g>' +
        '<rect x="150" y="60" width="110" height="110" rx="8" fill="#8B5A2B"/><rect x="160" y="70" width="90" height="90" rx="4" fill="#BFE8FF"/><path d="M160 130q24-20 46-4t44-12v46h-90z" fill="#8ED468"/><path d="M205 70v90M160 115h90" stroke="#8B5A2B" stroke-width="5"/><path d="M150 60h110v22q-14 10-28 0q-14 10-27 0q-14 10-27 0q-14 10-28 0z" fill="#E5484D"/>' +
        '<rect x="14" y="50" width="110" height="84" rx="8" fill="#5FB0F2"/><path d="M69 50v84" stroke="#2F8FE6" stroke-width="4"/><circle cx="60" cy="96" r="4" fill="#fff"/><circle cx="78" cy="96" r="4" fill="#fff"/><rect x="284" y="50" width="104" height="84" rx="8" fill="#5FB0F2"/><path d="M336 50v84" stroke="#2F8FE6" stroke-width="4"/><circle cx="327" cy="96" r="4" fill="#fff"/><circle cx="345" cy="96" r="4" fill="#fff"/>' +
        '<rect x="0" y="244" width="290" height="104" fill="#5FB0F2"/><rect x="-4" y="232" width="298" height="18" rx="6" fill="#F4E3C3"/><path d="M96 250v98M192 250v98" stroke="#2F8FE6" stroke-width="4"/><circle cx="84" cy="296" r="4" fill="#fff"/><circle cx="108" cy="296" r="4" fill="#fff"/><circle cx="204" cy="296" r="4" fill="#fff"/>' +
        '<rect x="300" y="170" width="92" height="178" rx="10" fill="#F4F9FF"/><path d="M300 240h92" stroke="#C9D2DC" stroke-width="4"/><rect x="312" y="200" width="8" height="28" rx="4" fill="#C9D2DC"/><rect x="312" y="254" width="8" height="40" rx="4" fill="#C9D2DC"/>' +
        '<rect x="24" y="206" width="56" height="28" rx="8" fill="#C9D2DC"/><rect x="34" y="196" width="14" height="14" rx="3" fill="#E9B872"/><rect x="54" y="196" width="14" height="14" rx="3" fill="#E9B872"/><rect x="118" y="200" width="30" height="34" rx="6" fill="#E5484D"/><rect x="116" y="194" width="34" height="10" rx="4" fill="#fff"/><path d="M180 232q0-22 22-22t22 22z" fill="#E9B872"/><path d="M190 214l4 8M202 211v9M214 214l-4 8" stroke="#B98045" stroke-width="3" stroke-linecap="round"/>' +
        '<path d="M250 150v-30M270 150v-30" stroke="#8A8F9C" stroke-width="3"/>';
    },
    living_room: function (g) {
      return '<defs>' + grad(g, [['#FFD9A8'], ['#FFE9C9']]) + '</defs><rect width="400" height="600" fill="url(#' + g + ')"/><g stroke="#F6C68C" stroke-width="14" opacity=".5">' + [40, 120, 200, 280, 360].map(function (x) { return '<path d="M' + x + ' 0v330"/>'; }).join('') + '</g>' +
        '<rect x="0" y="322" width="400" height="20" fill="#fff" opacity=".8"/>' + planks(342, 258, '#C98F55', '#A9743C') +
        '<rect x="40" y="70" width="96" height="76" rx="6" fill="#8B5A2B"/><rect x="48" y="78" width="80" height="60" fill="#DFF3FF"/><circle cx="72" cy="104" r="12" fill="#EDB98A"/><circle cx="102" cy="100" r="15" fill="#EDB98A"/><path d="M56 138q16-22 32 0zM82 138q20-28 40 0z" fill="#E5484D"/><path d="M88 70l10-14 10 14" stroke="#8B5A2B" stroke-width="3" fill="none"/>' +
        '<circle cx="320" cy="96" r="34" fill="#fff" stroke="#8B5A2B" stroke-width="8"/><path d="M320 96V74M320 96l14 8" stroke="#3B2A1A" stroke-width="5" stroke-linecap="round"/>' +
        '<rect x="170" y="60" width="70" height="56" rx="6" fill="#8B5A2B"/><rect x="177" y="67" width="56" height="42" fill="#8ED4FF"/><path d="M177 100l16-18 14 12 12-16 14 22v9h-56z" fill="#63B63F"/>' +
        '<rect x="40" y="248" width="230" height="100" rx="26" fill="#E5484D"/><rect x="60" y="290" width="190" height="60" rx="14" fill="#F2777A"/><rect x="26" y="280" width="46" height="74" rx="20" fill="#C0392B"/><rect x="238" y="280" width="46" height="74" rx="20" fill="#C0392B"/><rect x="84" y="262" width="54" height="40" rx="12" fill="#FFE58A"/><rect x="170" y="262" width="54" height="40" rx="12" fill="#7FCBF5"/>' +
        '<rect x="330" y="200" width="8" height="150" fill="#5E3A1A"/><path d="M300 200q34-70 68 0z" fill="#FFE58A"/><ellipse cx="334" cy="350" rx="28" ry="8" fill="#5E3A1A"/><circle cx="334" cy="212" r="46" fill="#FFE58A" opacity=".22"/>' +
        '<ellipse cx="170" cy="480" rx="150" ry="40" fill="#3DBB6B" opacity=".75"/><ellipse cx="170" cy="480" rx="112" ry="26" fill="#8EE0A8" opacity=".7"/>';
    },
    hallway: function (g) {
      return '<defs>' + grad(g, [['#CDE7C8'], ['#E6F4E0']]) + '</defs><rect width="400" height="600" fill="url(#' + g + ')"/><rect x="0" y="230" width="400" height="110" fill="#B9DDB2"/><rect x="0" y="224" width="400" height="10" fill="#fff"/>' +
        '<rect x="0" y="340" width="400" height="260" fill="#E9D6A6"/><g stroke="#D6BF86" stroke-width="3">' + [386, 432, 478, 524, 570].map(function (y, i) { return '<path d="M0 ' + y + 'h400"/>' + [0, 1, 2, 3, 4, 5].map(function (j) { return '<path d="M' + (j * 80 + (i % 2) * 40) + ' ' + y + 'v46"/>'; }).join(''); }).join('') + '</g>' +
        '<rect x="130" y="60" width="140" height="284" rx="10" fill="#8B5A2B"/><rect x="142" y="72" width="116" height="272" rx="6" fill="#D9542B"/><rect x="156" y="88" width="88" height="80" rx="40" fill="#FFF3C4"/><path d="M200 88v80M156 128h88" stroke="#D9542B" stroke-width="6"/><rect x="156" y="190" width="38" height="60" rx="5" fill="#C0392B"/><rect x="206" y="190" width="38" height="60" rx="5" fill="#C0392B"/><rect x="156" y="262" width="88" height="66" rx="5" fill="#C0392B"/><circle cx="238" cy="222" r="9" fill="#F5B833"/><circle cx="238" cy="222" r="4" fill="#C98A12"/><path d="M150 344L110 600h180L250 344z" fill="#FFF3C4" opacity=".25"/>' +
        '<rect x="150" y="352" width="100" height="30" rx="8" fill="#3DBB6B"/><path d="M162 367h76" stroke="#DDF5E3" stroke-width="4" stroke-dasharray="8 6"/>' +
        '<rect x="20" y="120" width="86" height="10" rx="5" fill="#8B5A2B"/><path d="M34 130v10M62 130v10M92 130v10" stroke="#5E3A1A" stroke-width="5" stroke-linecap="round"/><path d="M22 140h26l6 80H16z" fill="#2F8FE6"/><path d="M52 140h22l8 60H46z" fill="#F5B833"/>' +
        '<rect x="300" y="286" width="84" height="60" rx="6" fill="#B98045"/><path d="M300 316h84" stroke="#8B5A2B" stroke-width="4"/><ellipse cx="322" cy="308" rx="14" ry="7" fill="#E5484D"/><ellipse cx="358" cy="308" rx="14" ry="7" fill="#E5484D"/><ellipse cx="322" cy="338" rx="14" ry="7" fill="#5E3A1A"/><ellipse cx="358" cy="338" rx="14" ry="7" fill="#5E3A1A"/>' +
        '<path d="M318 250q0-30 24-30t24 30v30h-48z" fill="#9A63E0"/><rect x="328" y="238" width="28" height="18" rx="5" fill="#7443B8"/><path d="M324 224q18-24 36 0" stroke="#7443B8" stroke-width="5" fill="none"/>';
    },
    garden: function (g) {
      return '<defs>' + grad(g, [['#8ED4FF'], ['#E3F5FF']]) + '</defs><rect width="400" height="600" fill="url(#' + g + ')"/><circle cx="330" cy="76" r="32" fill="#FFE066"/><circle cx="330" cy="76" r="46" fill="#FFE066" opacity=".3"/>' + D.cloud(90, 80, 1.2) + D.cloud(230, 130, 0.8, 0.8) +
        '<path d="M0 300q100-30 200-10t200-20v330H0z" fill="#8ED468"/>' + D.tree(330, 330, 2.6, '#3E9B4F') + '<circle cx="306" cy="232" r="8" fill="#E5484D"/><circle cx="356" cy="252" r="8" fill="#E5484D"/><circle cx="330" cy="212" r="8" fill="#E5484D"/>' +
        '<g fill="#fff" stroke="#DCE3EE" stroke-width="2">' + [0, 1, 2, 3, 4, 5, 6].map(function (i) { return '<path d="M' + (6 + i * 34) + ' 330v-64l11-12 11 12v64z"/>'; }).join('') + '</g><rect x="0" y="282" width="244" height="8" fill="#fff"/><rect x="0" y="308" width="244" height="8" fill="#fff"/>' +
        '<path d="M0 350q200-30 400 0v250H0z" fill="#7CCB52"/><path d="M140 600q10-90 50-130t0-110q40 50 0 110t-10 130z" fill="#F3DFA8"/>' +
        '<path d="M40 420v-70M110 420v-70" stroke="#8B5A2B" stroke-width="6"/><path d="M40 356h70" stroke="#C9D2DC" stroke-width="3"/><path d="M52 358h14v26q-7 8-14 0z" fill="#fff"/><path d="M52 362h14" stroke="#E5484D" stroke-width="3"/><rect x="78" y="358" width="24" height="26" rx="3" fill="#2F8FE6"/>' +
        D.flowers([[30, 470], [70, 510], [250, 440], [300, 500], [360, 450], [330, 550], [40, 560], [240, 540], [280, 400], [20, 400]]) +
        '<path d="M250 392q6-8 12 0q6 8 12 0" stroke="#F27BB1" stroke-width="4" fill="none" stroke-linecap="round"/>';
    },
    attic: function (g) {
      return '<defs>' + grad(g, [['#4A2F1C'], ['#6B4426']]) + '</defs><rect width="400" height="600" fill="url(#' + g + ')"/>' +
        '<path d="M0 150L200 20L400 150V0H0Z" fill="#2E1C10"/><path d="M0 150L200 20L400 150" stroke="#8B5A2B" stroke-width="12" fill="none"/><path d="M200 20V340M70 104V340M330 104V340" stroke="#3A2414" stroke-width="10"/>' +
        '<circle cx="200" cy="150" r="42" fill="#A9C7E8"/><path d="M158 150h84M200 108v84" stroke="#3A2414" stroke-width="6"/><circle cx="200" cy="150" r="42" fill="none" stroke="#3A2414" stroke-width="8"/><path d="M170 190L110 420h180L230 190Z" fill="#CFE3F7" opacity=".12"/>' +
        '<path d="M176 126l-6 14M190 120l-6 14M214 134l-6 14M224 160l-6 14" stroke="#fff" stroke-width="2" opacity=".6"/>' +
        planks(340, 260, '#7A4E2A', '#5A381C') +
        '<rect x="24" y="268" width="92" height="74" rx="6" fill="#9C6B3C"/><rect x="24" y="268" width="92" height="20" rx="6" fill="#B98045"/><rect x="62" y="282" width="16" height="16" rx="3" fill="#F5B833"/><rect x="300" y="250" width="76" height="92" rx="4" fill="#8A6A4A"/><path d="M300 280h76M338 250v92" stroke="#6B4E33" stroke-width="3"/><rect x="286" y="312" width="50" height="30" rx="3" fill="#A07A52"/>' +
        '<circle cx="200" cy="372" r="60" fill="#FFE58A" opacity=".22"/><circle cx="200" cy="372" r="34" fill="#FFE58A" opacity=".3"/><path d="M168 380q32-16 64 0v-22q-32-16-64 0z" fill="#C0392B"/><path d="M172 360q28-12 28 2q0-14 28-2v16q-28-12-28 2q0-14-28-2z" fill="#FFF7DC"/>' +
        '<path d="M330 40q-20 20 0 44M60 60q14 10 4 26" stroke="#fff" stroke-width="1.5" fill="none" opacity=".25"/>';
    },
    meadow: function (g) {
      return '<defs>' + grad(g, [['#8ED4FF'], ['#DDF3FF']]) + '</defs><rect width="400" height="600" fill="url(#' + g + ')"/><circle cx="318" cy="84" r="34" fill="#FFE066"/><circle cx="318" cy="84" r="48" fill="#FFE066" opacity=".3"/>' + D.cloud(90, 90, 1.3) + D.cloud(250, 150, 0.9, 0.8) +
        '<path d="M0 300q100-60 200-20t200-30v350H0z" fill="#9BDB6E"/>' + D.tree(60, 290, 1.1) + D.tree(350, 262, 0.9, '#55B35E') +
        '<path d="M0 350q120-50 240-10t160-20v280H0z" fill="#7CCB52"/><path d="M0 420q140-40 260 0t140-10v190H0z" fill="#63B63F"/>' +
        '<path d="M150 600q10-90 70-140t-10-110q30 60-40 110t-80 140z" fill="#F3DFA8"/>' +
        '<path d="M20 384h120M20 398h120M30 372v40M70 370v40M110 372v40" stroke="#B98045" stroke-width="5" stroke-linecap="round"/>' +
        D.flowers([[40, 460], [80, 500], [300, 450], [340, 500], [280, 540], [60, 550], [360, 420], [250, 400], [20, 520]]);
    },
    village: function (g) {
      return '<defs>' + grad(g, [['#8ED4FF'], ['#E6F6FF']]) + '</defs><rect width="400" height="600" fill="url(#' + g + ')"/>' + D.cloud(80, 70, 1.2) + D.cloud(300, 110, 1) +
        '<path d="M0 300q100-50 200-10t200-40v350H0z" fill="#8ED468"/>' + D.tree(22, 300, 1.2) + D.tree(384, 290, 1.1, '#55B35E') +
        D.house(88, 318, 2, '#FBEBC8', '#D9542B') + D.house(300, 310, 1.8, '#F6D9B0', '#2F8FE6') + D.house(196, 290, 1.3, '#FFF3D6', '#9A63E0') +
        '<path d="M0 330q200-24 400 0v270H0z" fill="#E9D6A6"/><g fill="#D6BF86"><ellipse cx="60" cy="380" rx="20" ry="7"/><ellipse cx="150" cy="420" rx="22" ry="8"/><ellipse cx="300" cy="390" rx="20" ry="7"/><ellipse cx="350" cy="460" rx="24" ry="8"/><ellipse cx="80" cy="490" rx="24" ry="8"/><ellipse cx="230" cy="520" rx="24" ry="8"/></g>' +
        '<ellipse cx="200" cy="392" rx="54" ry="14" fill="#B9BEC9"/><rect x="150" y="364" width="100" height="28" rx="8" fill="#C9CED8"/><ellipse cx="200" cy="364" rx="50" ry="11" fill="#7FCBF5"/><rect x="194" y="326" width="12" height="40" fill="#C9CED8"/><path d="M200 326q-22 8-24 34M200 326q22 8 24 34" stroke="#BFE8FF" stroke-width="4" fill="none" stroke-linecap="round"/>' +
        '<rect x="330" y="360" width="6" height="56" fill="#7A4A22"/><rect x="304" y="352" width="60" height="26" rx="4" fill="#B98045"/><path d="M312 362h44M312 370h30" stroke="#5E3A1A" stroke-width="3" stroke-linecap="round" opacity=".7"/>';
    },
    interior: function (g) {
      return '<defs>' + grad(g, [['#F6DDAE'], ['#EBC98C']]) + '</defs><rect width="400" height="600" fill="url(#' + g + ')"/><g stroke="#E3BF82" stroke-width="3">' + [50, 130, 210, 290, 370].map(function (x) { return '<path d="M' + x + ' 0v330"/>'; }).join('') + '</g>' +
        '<rect x="0" y="300" width="400" height="44" fill="#B98045"/><rect x="0" y="296" width="400" height="8" fill="#8B5A2B"/>' + planks(344, 256, '#9C6B3C', '#7A4E2A') +
        '<rect x="42" y="70" width="110" height="120" rx="10" fill="#8B5A2B"/><rect x="52" y="80" width="90" height="100" rx="5" fill="#9FDCFF"/><path d="M97 80v100M52 130h90" stroke="#8B5A2B" stroke-width="6"/><path d="M52 150q30-24 50 0t40-10v40H52z" fill="#8ED468"/><circle cx="120" cy="102" r="10" fill="#FFE066"/>' +
        '<rect x="236" y="96" width="132" height="10" rx="3" fill="#8B5A2B"/><rect x="236" y="166" width="132" height="10" rx="3" fill="#8B5A2B"/><rect x="250" y="66" width="20" height="30" rx="5" fill="#E5484D"/><rect x="278" y="72" width="18" height="24" rx="5" fill="#F5B833"/><rect x="304" y="60" width="22" height="36" rx="6" fill="#3DBB6B"/><rect x="336" y="74" width="18" height="22" rx="5" fill="#2F8FE6"/><rect x="246" y="136" width="30" height="30" rx="4" fill="#C9A56B"/><circle cx="304" cy="150" r="16" fill="#F3E4C0"/><rect x="330" y="128" width="26" height="38" rx="4" fill="#9A63E0"/>' +
        '<ellipse cx="200" cy="470" rx="150" ry="40" fill="#C0392B" opacity=".85"/><ellipse cx="200" cy="470" rx="120" ry="28" fill="#E5786A" opacity=".7"/>';
    },
    forest: function (g) {
      return '<defs>' + grad(g, [['#BFEFB0'], ['#7CCB7A']]) + '</defs><rect width="400" height="600" fill="url(#' + g + ')"/><path d="M260 0L140 380h60L330 0Z" fill="#FFF7C2" opacity=".28"/><path d="M120 0L40 300h40L170 0Z" fill="#FFF7C2" opacity=".2"/>' +
        '<g opacity=".55">' + D.tree(40, 300, 2.2, '#4FAE66') + D.tree(180, 280, 2, '#4FAE66') + D.tree(330, 300, 2.4, '#4FAE66') + '</g>' +
        '<rect x="-10" y="0" width="56" height="420" fill="#6B4426"/><rect x="330" y="0" width="64" height="430" fill="#5E3A1A"/><path d="M46 120q30-10 50-40M330 160q-30-6-46-36" stroke="#6B4426" stroke-width="12" stroke-linecap="round" fill="none"/>' +
        '<circle cx="20" cy="30" r="80" fill="#2E8B4A"/><circle cx="120" cy="10" r="60" fill="#37A055"/><circle cx="370" cy="40" r="90" fill="#2E8B4A"/><circle cx="270" cy="0" r="60" fill="#37A055"/>' +
        '<path d="M0 400q200-40 400 0v200H0z" fill="#5DB24F"/><path d="M130 600q30-100 70-130t10-70q40 40 10 80t-10 120z" fill="#D9C48A"/>' +
        '<circle cx="70" cy="420" r="34" fill="#2E8B4A"/><circle cx="110" cy="436" r="24" fill="#37A055"/><circle cx="330" cy="430" r="36" fill="#2E8B4A"/><circle cx="290" cy="446" r="22" fill="#37A055"/>' +
        '<path d="M300 520q0-16 14-16t14 16z" fill="#E5484D"/><rect x="310" y="518" width="8" height="12" fill="#FFF3D6"/><circle cx="308" cy="512" r="2" fill="#fff"/><circle cx="318" cy="510" r="2" fill="#fff"/>' + D.flowers([[60, 500], [100, 540], [260, 560], [360, 520], [30, 560]]);
    },
    night_forest: function (g) {
      return '<defs>' + grad(g, [['#141B3C'], ['#2B3A6B']]) + '</defs><rect width="400" height="600" fill="url(#' + g + ')"/><circle cx="300" cy="90" r="36" fill="#FFF3C4"/><circle cx="286" cy="82" r="32" fill="#141B3C" opacity=".25"/><circle cx="300" cy="90" r="56" fill="#FFF3C4" opacity=".12"/>' +
        D.stars([[40, 50], [90, 110, 2], [150, 40], [210, 90, 2.2], [360, 180], [60, 190], [240, 170, 2], [130, 150], [380, 40, 2]]) +
        '<g>' + D.pine(50, 400, 3, '#1D2B4F') + D.pine(180, 380, 2.4, '#22335C') + D.pine(340, 400, 3.2, '#1D2B4F') + D.pine(260, 390, 2, '#263A66') + '</g>' +
        '<path d="M0 390q200-30 400 0v210H0z" fill="#1F3A3F"/><path d="M0 450q200-30 400 0v150H0z" fill="#19302F"/>' +
        '<circle cx="200" cy="470" r="70" fill="#FF9B3D" opacity=".18"/><path d="M176 486l48-12M176 474l48 12" stroke="#5E3A1A" stroke-width="8" stroke-linecap="round"/><path d="M200 420q22 26 10 50q-10 12-20 0q-12-24 10-50z" fill="#FF9B3D"/><path d="M200 440q10 14 5 28q-5 6-10 0q-5-14 5-28z" fill="#FFE066"/>' +
        '<g fill="#D8FF7A">' + [[60, 330], [120, 420], [300, 340], [350, 440], [240, 300], [30, 470]].map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3"/><circle cx="' + p[0] + '" cy="' + p[1] + '" r="8" opacity=".25"/>'; }).join('') + '</g>';
    },
    harbor: function (g) {
      return '<defs>' + grad(g, [['#7CC8F5'], ['#DDF3FF']]) + '</defs><rect width="400" height="600" fill="url(#' + g + ')"/>' + D.cloud(110, 80, 1.3) + D.cloud(300, 140, 0.9) +
        '<path d="M70 70q8-8 16 0M100 100q8-8 16 0M240 60q8-8 16 0" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>' +
        '<rect x="0" y="250" width="400" height="140" fill="#2F8FE6"/>' + D.waves(270, '#fff', 10) + D.waves(310, '#BFE8FF', 10) + D.waves(350, '#fff', 10) +
        '<path d="M330 250V120h30v130z" fill="#fff"/><path d="M330 150h30v24h-30zM330 200h30v24h-30z" fill="#E5484D"/><path d="M324 120h42l-6-22h-30z" fill="#3A4A66"/><circle cx="345" cy="108" r="8" fill="#FFE066"/><path d="M345 108L250 70v40z" fill="#FFE066" opacity=".3"/><path d="M300 250h90l-10-14h-70z" fill="#8A8F9C"/>' +
        D.boat(110, 290, 1.9, '#fff') + D.boat(230, 270, 1.1, '#FFD9A0') +
        planks(390, 210, '#B98045', '#8B5A2B') + '<rect x="0" y="384" width="400" height="10" fill="#7A4E2A"/><rect x="30" y="350" width="14" height="60" rx="5" fill="#5E3A1A"/><rect x="356" y="350" width="14" height="60" rx="5" fill="#5E3A1A"/><path d="M37 362q160 30 326 0" stroke="#E9D6A6" stroke-width="4" fill="none"/>' +
        '<rect x="286" y="404" width="56" height="50" rx="4" fill="#C9A56B"/><path d="M286 404l56 50M342 404l-56 50" stroke="#8B5A2B" stroke-width="4"/><ellipse cx="74" cy="440" rx="26" ry="10" fill="#7A4A22"/><rect x="48" y="404" width="52" height="36" fill="#9C6B3C"/><ellipse cx="74" cy="404" rx="26" ry="10" fill="#B98045"/>';
    },
    ship: function (g) {
      return '<defs>' + grad(g, [['#6FC0F2'], ['#D6F0FF']]) + '</defs><rect width="400" height="600" fill="url(#' + g + ')"/>' + D.cloud(80, 120, 1.2) + D.cloud(330, 70, 1) +
        '<rect x="0" y="270" width="400" height="90" fill="#2F8FE6"/>' + D.waves(290, '#fff', 10) + D.waves(320, '#BFE8FF', 10) +
        '<rect x="188" y="0" width="24" height="380" fill="#7A4A22"/><path d="M60 40q140 30 280 0v150q-140 40-280 0z" fill="#FFF7E6"/><path d="M60 40q140 30 280 0v22q-140 30-280 0z" fill="#F0E3C4"/><rect x="50" y="34" width="300" height="10" rx="5" fill="#5E3A1A"/><path d="M130 110q70 16 140 0" stroke="#E5484D" stroke-width="10" fill="none" opacity=".8"/>' +
        '<path d="M60 44L10 340M340 44L390 340" stroke="#C9A56B" stroke-width="3"/><path d="M200 0l40 14-40 14z" fill="#E5484D"/>' +
        planks(360, 240, '#B98045', '#8B5A2B') + '<rect x="0" y="326" width="400" height="12" rx="4" fill="#7A4E2A"/>' + [20, 80, 140, 260, 320, 380].map(function (x) { return '<rect x="' + (x - 5) + '" y="336" width="10" height="34" fill="#8B5A2B"/>'; }).join('') +
        '<circle cx="330" cy="430" r="34" fill="none" stroke="#7A4A22" stroke-width="8"/><circle cx="330" cy="430" r="8" fill="#7A4A22"/><path d="M330 390v80M290 430h80M302 402l56 56M358 402l-56 56" stroke="#7A4A22" stroke-width="5" stroke-linecap="round"/>' +
        '<ellipse cx="70" cy="452" rx="28" ry="10" fill="#7A4A22"/><rect x="42" y="412" width="56" height="40" fill="#9C6B3C"/><ellipse cx="70" cy="412" rx="28" ry="10" fill="#B98045"/>';
    },
    beach: function (g) {
      return '<defs>' + grad(g, [['#6FC8F5'], ['#FFF1C9']]) + '</defs><rect width="400" height="600" fill="url(#' + g + ')"/><circle cx="90" cy="90" r="36" fill="#FFE066"/><circle cx="90" cy="90" r="52" fill="#FFE066" opacity=".28"/>' + D.cloud(280, 80, 1.2) +
        '<path d="M250 250q30-40 70-24q30-20 60 24z" fill="#6FAE8A" opacity=".8"/><rect x="0" y="250" width="400" height="120" fill="#2FB5D6"/>' + D.waves(272, '#fff', 10) + D.waves(304, '#C8F3FF', 10) +
        '<path d="M0 350q60-18 120 0t120 0 160-4v254H0z" fill="#F6E2A6"/><path d="M0 352q60-18 120 0t120 0 160-4" stroke="#fff" stroke-width="6" fill="none" opacity=".8"/>' +
        '<path d="M330 420q-14-90 6-150" stroke="#8B5A2B" stroke-width="14" fill="none" stroke-linecap="round"/><g fill="#3E9B4F"><path d="M336 270q-60-30-90 10q50-10 90-10z"/><path d="M336 270q60-30 80 16q-40-16-80-16z"/><path d="M336 270q-30-56-80-40q50 6 80 40z"/><path d="M336 270q20-60 64-44q-44 10-64 44z"/></g><circle cx="330" cy="280" r="7" fill="#7A4A22"/><circle cx="344" cy="284" r="7" fill="#7A4A22"/>' +
        '<path d="M60 470l10-16 10 16 16 4-12 10 4 16-18-8-18 8 4-16-12-10z" fill="#FF9B7A"/><path d="M250 520q10-18 26-8q-4 16-26 8z" fill="#FFD9E6"/><circle cx="140" cy="540" r="6" fill="#fff"/><ellipse cx="200" cy="450" rx="30" ry="6" fill="#E9CF8A"/>';
    },
    snow: function (g) {
      return '<defs>' + grad(g, [['#A9C9F2'], ['#EEF6FF']]) + '</defs><rect width="400" height="600" fill="url(#' + g + ')"/>' + D.mountain(110, 340, 300, 250, '#8FA6D6') + D.mountain(300, 340, 280, 300, '#7C8CF8') + D.mountain(200, 340, 200, 160, '#A9B8E8') +
        '<path d="M0 320q100-30 200-6t200-14v300H0z" fill="#F4F9FF"/><path d="M0 400q120-30 220-4t180-16v220H0z" fill="#fff"/>' +
        D.pine(50, 350, 1.8, '#2E7D5B', true) + D.pine(350, 340, 1.6, '#2E7D5B', true) + D.pine(110, 330, 1.1, '#3A8F6A', true) + D.pine(290, 330, 1, '#3A8F6A', true) +
        '<g fill="#fff">' + [[30, 60], [90, 140], [150, 40], [220, 120], [280, 50], [340, 160], [380, 90], [60, 230], [200, 220], [320, 250], [120, 280], [250, 300]].map(function (p, i) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + (2.5 + (i % 3)) + '" opacity=".9"/>'; }).join('') + '</g>' +
        '<ellipse cx="90" cy="470" rx="60" ry="12" fill="#DCE9FA"/><ellipse cx="310" cy="520" rx="70" ry="12" fill="#DCE9FA"/>';
    },
    cave: function (g) {
      return '<defs>' + grad(g, [['#2A2740'], ['#46405F']]) + '</defs><rect width="400" height="600" fill="url(#' + g + ')"/><ellipse cx="200" cy="230" rx="110" ry="130" fill="#6E86B8" opacity=".35"/><ellipse cx="200" cy="240" rx="70" ry="90" fill="#BFD8FF" opacity=".3"/>' +
        '<path d="M0 0h400v70l-30 60-20-50-30 90-26-80-34 40-30-70-30 100-30-90-34 50-26-70-30 60-20-40-30 50z" fill="#1E1B30"/>' +
        '<path d="M0 120q40 40 30 120t30 140H0zM400 120q-40 40-30 120t-30 140h60z" fill="#1E1B30"/>' +
        '<path d="M0 380q200-40 400 0v220H0z" fill="#352F4C"/><path d="M0 440q200-30 400 0v160H0z" fill="#2B2640"/>' +
        '<g><path d="M60 400l14-50 14 50z" fill="#7FD6FF"/><path d="M78 400l10-34 12 34z" fill="#BDEBFF"/><path d="M320 420l16-60 16 60z" fill="#B9A6FF"/><path d="M340 420l10-38 12 38z" fill="#DCCFFF"/><path d="M250 390l8-28 8 28z" fill="#7FD6FF"/><circle cx="74" cy="380" r="30" fill="#7FD6FF" opacity=".15"/><circle cx="336" cy="396" r="34" fill="#B9A6FF" opacity=".15"/></g>' +
        '<ellipse cx="140" cy="500" rx="40" ry="10" fill="#1E1B30" opacity=".6"/><ellipse cx="300" cy="540" rx="50" ry="10" fill="#1E1B30" opacity=".6"/>';
    },
    gray_city: function (g) {
      return '<defs>' + grad(g, [['#8B8F9E'], ['#C4C6CF']]) + '</defs><rect width="400" height="600" fill="url(#' + g + ')"/><circle cx="310" cy="90" r="30" fill="#E6E6EC" opacity=".6"/>' + D.cloud(100, 90, 1.5, 0.35) + D.cloud(280, 170, 1.2, 0.3) +
        '<g opacity=".6">' + D.tower(60, 360, 2.2, '#7A7F8C', '#5A5F72') + D.tower(200, 360, 3, '#6E7381', '#4E5364') + D.tower(340, 360, 2.4, '#7A7F8C', '#5A5F72') + '</g>' +
        '<rect x="0" y="210" width="110" height="170" fill="#676C7A"/><rect x="290" y="190" width="110" height="190" fill="#5F6472"/><rect x="120" y="250" width="80" height="130" fill="#737886"/>' +
        '<g fill="#2A1F3D" opacity=".55">' + [[20, 240], [60, 240], [20, 290], [60, 290], [310, 220], [350, 220], [310, 270], [350, 270], [140, 280], [170, 280]].map(function (p) { return '<rect x="' + p[0] + '" y="' + p[1] + '" width="18" height="26" rx="2"/>'; }).join('') + '</g><rect x="350" y="270" width="18" height="26" rx="2" fill="#FFE58A" opacity=".8"/>' +
        '<path d="M232 200h36v90l-18-14-18 14z" fill="#3A2A55"/><circle cx="250" cy="232" r="9" fill="none" stroke="#C4C6CF" stroke-width="3"/><path d="M243 239l14-14" stroke="#C4C6CF" stroke-width="3"/>' +
        '<path d="M0 370h400v230H0z" fill="#8E929F"/><g stroke="#7A7F8C" stroke-width="3">' + [410, 450, 490, 530, 570].map(function (y, i) { return '<path d="M0 ' + y + 'h400"/>' + [0, 1, 2, 3, 4, 5].map(function (j) { return '<path d="M' + (j * 80 + (i % 2) * 40) + ' ' + y + 'v40"/>'; }).join(''); }).join('') + '</g>';
    },
    library: function (g) {
      var books = '', cols = ['#E5484D', '#2F8FE6', '#3DBB6B', '#F5B833', '#9A63E0', '#FF9600', '#8B5A2B', '#F27BB1'];
      [0, 1, 2, 3].forEach(function (row) {
        var y = 40 + row * 78;
        [0, 1].forEach(function (side) {
          var x0 = side ? 268 : 12, x = x0;
          for (var i = 0; x < x0 + 112; i++) { var w = 9 + ((i * 7 + row * 3 + side) % 3) * 4, hgt = 46 + ((i * 5 + row) % 4) * 6; books += '<rect x="' + x + '" y="' + (y + 66 - hgt) + '" width="' + (w - 1.5) + '" height="' + hgt + '" rx="1.5" fill="' + cols[(i + row * 2 + side * 3) % cols.length] + '"/>'; x += w; }
          books += '<rect x="' + (x0 - 6) + '" y="' + (y + 66) + '" width="126" height="9" fill="#5E3A1A"/>';
        });
      });
      return '<defs>' + grad(g, [['#5B4636'], ['#7A5C44']]) + '</defs><rect width="400" height="600" fill="url(#' + g + ')"/><rect x="4" y="24" width="130" height="330" fill="#3F2C1E"/><rect x="262" y="24" width="134" height="330" fill="#3F2C1E"/>' + books +
        '<path d="M150 354V120q50-70 100 0v234z" fill="#FFE9A8"/><path d="M150 354V120q50-70 100 0v234z" fill="none" stroke="#3F2C1E" stroke-width="10"/><path d="M200 78v276M150 200h100M150 280h100" stroke="#3F2C1E" stroke-width="5"/><path d="M160 354L110 600h180L240 354z" fill="#FFE9A8" opacity=".14"/>' +
        '<rect x="0" y="354" width="400" height="246" fill="#8A6A4A"/><g fill="#7A5C3E">' + [0, 1, 2, 3, 4, 5].map(function (r) { return [0, 1, 2, 3, 4, 5].map(function (c) { return (r + c) % 2 ? '<rect x="' + c * 80 + '" y="' + (354 + r * 41) + '" width="80" height="41"/>' : ''; }).join(''); }).join('') + '</g>' +
        '<path d="M244 354L262 60M270 354L288 60" stroke="#B98045" stroke-width="6"/><g stroke="#B98045" stroke-width="5">' + [100, 150, 200, 250, 300].map(function (y) { return '<path d="M' + (259 - (y - 60) * 0.06 + 2) + ' ' + y + 'h24"/>'; }).join('') + '</g>';
    },
    throne: function (g) {
      return '<defs>' + grad(g, [['#1F1535'], ['#3A2A55']]) + '</defs><rect width="400" height="600" fill="url(#' + g + ')"/>' +
        '<path d="M170 60q30-50 60 0v150h-60z" fill="#7FD6FF" opacity=".55"/><path d="M200 34v176M170 110h60M170 160h60" stroke="#1F1535" stroke-width="5"/><path d="M170 210L90 600h220L230 210z" fill="#7FD6FF" opacity=".08"/>' +
        '<rect x="30" y="0" width="50" height="400" fill="#4B3870"/><rect x="320" y="0" width="50" height="400" fill="#4B3870"/><rect x="22" y="380" width="66" height="22" rx="4" fill="#5C4788"/><rect x="312" y="380" width="66" height="22" rx="4" fill="#5C4788"/><rect x="22" y="0" width="66" height="18" fill="#5C4788"/><rect x="312" y="0" width="66" height="18" fill="#5C4788"/>' +
        '<path d="M100 20h40v120l-20-16-20 16zM260 20h40v120l-20-16-20 16z" fill="#2A1F3D"/><circle cx="120" cy="66" r="10" fill="none" stroke="#9A63E0" stroke-width="3"/><circle cx="280" cy="66" r="10" fill="none" stroke="#9A63E0" stroke-width="3"/>' +
        '<rect x="0" y="390" width="400" height="210" fill="#2A1F3D"/><path d="M150 390h100l50 210H100z" fill="#8E2A3A"/><path d="M158 390h84l44 210H114z" fill="#B23A4C"/>' +
        '<rect x="110" y="356" width="180" height="20" rx="4" fill="#5C4788"/><rect x="130" y="372" width="140" height="20" rx="4" fill="#4B3870"/>' +
        '<path d="M160 360V230q40-50 80 0v130z" fill="#3A2A55" stroke="#9A63E0" stroke-width="5"/><rect x="164" y="300" width="72" height="60" rx="6" fill="#8E2A3A"/><rect x="150" y="296" width="18" height="64" rx="6" fill="#5C4788"/><rect x="232" y="296" width="18" height="64" rx="6" fill="#5C4788"/><circle cx="200" cy="212" r="10" fill="#FF86D0"/><circle cx="200" cy="212" r="20" fill="#FF86D0" opacity=".25"/>' +
        '<g fill="#FFB347"><circle cx="55" cy="250" r="7"/><circle cx="345" cy="250" r="7"/></g><g fill="#FFB347" opacity=".2"><circle cx="55" cy="250" r="26"/><circle cx="345" cy="250" r="26"/></g>';
    }
  };
  // Fond illustré pour un type de décor (catalog.bgTypes) ou un id de lieu (catalog.places).
  function backdrop(bgType, cls) {
    var cat = (window.GAME && window.GAME.catalog) || {};
    if (!BG[bgType] && cat.places && cat.places[bgType]) bgType = cat.places[bgType].bg;
    var fn = BG[bgType] || BG.meadow;
    return '<svg xmlns="http://www.w3.org/2000/svg" class="backdrop bg-' + bgType + (cls ? ' ' + cls : '') + '" viewBox="0 0 400 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' + fn(uid('bg')) + '</svg>';
  }

  window.Chars = {
    svg: svg, pico: pico, picoSvg: picoSvg, heroSvg: heroSvg, heroLook: heroLook, npc: npc, npcSvg: npcSvg, enemySvg: enemySvg, backdrop: backdrop,
    deco: D, shade: shade, SKIN: SKIN, HAIR: HAIR, PICO_LOOK: PICO_LOOK, BG: Object.keys(BG)
  };
})();
