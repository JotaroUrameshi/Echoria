/* Echoria — screens.js : écrans principaux rendus en chaînes HTML (titre, création du héros, en-tête,
   carte du monde, chapitre, cartes de récompense, bilans). Les actions passent par data-act (voir main.js).
   Exposé via window.Screens (complété par screens2.js). */
(function () {
  'use strict';
  var E = window.Engine, UI = window.UI, C = window.Chars, S = window.Store, esc = UI.esc, D = C.deco;
  var T = function (t) { return window.Story.T(t); };
  var STEP_ICON = { scene: '📖', lesson: '🎓', dialogue: '💬', combat: '⚔️' };

  // ---------------------------------------------------------------- petits composants
  function gem(color, on, size) {
    size = size || 34; var c = on ? color : '#B9B2A6', cd = UI.shade(c, -0.3), cl = UI.shade(c, 0.45);
    return '<svg class="gem' + (on ? ' on' : '') + '" width="' + size + '" height="' + Math.round(size * 1.15) + '" viewBox="0 0 40 46" aria-hidden="true"><path d="M20 2 36 14 30 40 20 45 10 40 4 14Z" fill="' + c + '" stroke="' + cd + '" stroke-width="2.500" stroke-linejoin="round"' + (on ? '' : ' opacity=".55"') + '/><path d="M20 2 28 15H12Z" fill="' + cl + '"' + (on ? '' : ' opacity=".4"') + '/><path d="M12 15h16l-8 30Z" fill="' + cd + '" opacity=".25"/><path d="M4 14l8 1 8 30M36 14l-8 1" stroke="' + cd + '" stroke-width="1.500" fill="none" opacity=".5"/>' + (on ? '<path d="M11 9l5-4" stroke="#fff" stroke-width="2.500" stroke-linecap="round" opacity=".8"/>' : '') + '</svg>';
  }
  function crystalsRow(size) {
    var st = S.state;
    return '<div class="crystals" aria-label="Cristaux retrouvés">' + S.REGIONS.map(function (r) { var on = st.crystals.indexOf(r.id) >= 0; return '<span class="crystal' + (on ? ' on' : '') + '" title="' + esc(r.crystal.fr) + '" style="--c:' + r.crystal.color + '">' + gem(r.crystal.color, on, size) + '</span>'; }).join('') + '</div>';
  }
  function itemStat(it) {
    if (!it) return '';
    if (it.kind === 'weapon') return '⚔️ Attaque +' + it.atk + (it.bonus && it.bonus.attackSpeed ? ' · coups rapides' : '') + (it.bonus && it.bonus.slowOnHit ? ' · ralentit' : '') + (it.bonus && it.bonus.spellCooldown ? ' · sorts plus rapides' : '') + (it.reach >= 70 ? ' · longue portée' : '');
    if (it.kind === 'armor') return '❤️ +' + it.hp + ' PV';
    return it.desc || '';
  }
  function head(title, sub, back) {
    return '<div class="page-head"><button class="back-btn" data-act="' + (back || 'close-overlay') + '" aria-label="Retour">' + UI.icon('back') + '</button><div class="grow"><h1>' + title + '</h1>' + (sub ? '<div class="ph-sub">' + sub + '</div>' : '') + '</div></div>';
  }

  // ---------------------------------------------------------------- titre
  function title() {
    var st = S.state, has = st.hero.created;
    var spark = ''; for (var i = 0; i < 14; i++) spark += '<i style="left:' + (5 + (i * 37) % 90) + '%;top:' + (8 + (i * 53) % 60) + '%;animation-delay:' + (i * 0.37).toFixed(2) + 's"></i>';
    return '<div class="title-screen"><div class="stage-bg">' + C.backdrop('meadow') + '</div><div class="sparkles" aria-hidden="true">' + spark + '</div>' +
      '<div class="title-inner"><div class="title-crystals">' + S.REGIONS.map(function (r, i) { return '<span style="--i:' + i + '">' + gem(r.crystal.color, true, 30) + '</span>'; }).join('') + '</div>' +
      '<h1 class="logo" aria-label="Echoria">' + 'ECHORIA'.split('').map(function (ch, i) { return '<span style="--i:' + i + '">' + ch + '</span>'; }).join('') + '</h1><p class="logo-sub">La Quête des Cinq Cristaux</p>' +
      '<div class="title-pico">' + C.pico({ size: 150, mood: 'happy', cls: 'bob' }) + (has ? '<div class="title-hero">' + C.heroSvg(st, { size: 150, mood: 'happy' }) + '</div>' : '') + '</div>' +
      '<div class="title-actions">' + (has ? '<button class="btn btn-gold btn-lg btn-block" data-act="title-continue">Continuer l\'aventure</button><button class="btn btn-wood btn-block" data-act="title-new">Nouvelle partie</button>' : '<button class="btn btn-gold btn-lg btn-block" data-act="title-new">Nouvelle partie</button>') + '</div>' +
      (S.loadError ? '<p class="title-note">Ta sauvegarde était illisible : une nouvelle partie toute propre t\'attend.</p>' : '<p class="title-note">Un jeu d\'aventure pour apprendre l\'anglais 🇬🇧</p>') + '</div></div>';
  }

  // ---------------------------------------------------------------- création du héros
  var SKINS = ['light', 'tan', 'brown', 'dark'];
  var HAIR_FR = { short: 'Court', long: 'Long', bun: 'Chignon', curly: 'Bouclé', braids: 'Tresses', bald: 'Rasé', spiky: 'En pics', ponytail: 'Queue' };
  function creatorPreview(d) { return C.heroSvg({ hero: d, equip: {} }, { size: 190, mood: 'happy', weapon: null, armor: null }); }
  function creator(d) {
    var en = S.CAT.lookEnums || {};
    var sw = function (key, val, color, label) { return '<button class="swatch' + (d[key] === val ? ' on' : '') + '" data-act="cr-set" data-k="' + key + '" data-v="' + esc(val) + '" style="--c:' + color + '" aria-label="' + esc(label) + '" aria-pressed="' + (d[key] === val) + '"></button>'; };
    return '<div class="page creator"><div class="creator-top"><div class="stage-bg">' + C.backdrop('attic') + '</div><div class="creator-preview" data-role="preview">' + creatorPreview(d) + '</div></div>' +
      '<div class="creator-form"><h1>Qui es-tu ?</h1>' +
      '<label class="field"><span>Ton prénom</span><input class="input" data-role="cr-name" maxlength="16" placeholder="Écris ton prénom" value="' + esc(d.name) + '" autocomplete="off" autocapitalize="words"></label>' +
      '<div class="field"><span>Je suis…</span><div class="seg wide"><button class="' + (d.gender === 'f' ? 'on' : '') + '" data-act="cr-set" data-k="gender" data-v="f">une fille</button><button class="' + (d.gender === 'm' ? 'on' : '') + '" data-act="cr-set" data-k="gender" data-v="m">un garçon</button></div></div>' +
      '<div class="field"><span>Peau</span><div class="swatches">' + SKINS.map(function (k) { return sw('skin', k, C.SKIN[k], 'Peau ' + k); }).join('') + '</div></div>' +
      '<div class="field"><span>Coiffure</span><div class="hair-grid">' + (en.hair || []).map(function (h) { return '<button class="hair-pick' + (d.hair === h ? ' on' : '') + '" data-act="cr-set" data-k="hair" data-v="' + h + '" aria-pressed="' + (d.hair === h) + '">' + C.svg({ species: 'human', age: 'child', skin: d.skin, hair: h, hairColor: d.hairColor, outfit: d.outfit }, { size: 54, bust: true }) + '<small>' + (HAIR_FR[h] || h) + '</small></button>'; }).join('') + '</div></div>' +
      '<div class="field"><span>Couleur des cheveux</span><div class="swatches">' + (en.hairColor || []).map(function (k) { return sw('hairColor', k, C.HAIR[k], 'Cheveux ' + k); }).join('') + '</div></div>' +
      '<div class="field"><span>Couleur de la tenue</span><div class="swatches">' + S.HERO_OUTFITS.map(function (c) { return sw('outfit', c, c, 'Tenue ' + c); }).join('') + '</div></div>' +
      '</div><div class="page-foot"><button class="btn btn-gold btn-lg btn-block" data-act="cr-done">C\'est parti !</button></div></div>';
  }

  // ---------------------------------------------------------------- en-tête & navigation
  function hud(tab) {
    var st = S.state, li = S.levelInfo();
    return '<div class="hud"><button class="hud-level" data-act="go" data-tab="hero" aria-label="Niveau ' + li.level + ', voir mon héros"><span class="lvl-badge">' + li.level + '</span><span class="hud-xp"><small>Niveau ' + li.level + '</small><span class="xpbar"><span style="width:' + Math.round(li.pct * 100) + '%"></span></span></span></button>' +
      '<span class="hud-stat gold" aria-label="Or"><span class="emoji">🪙</span><b data-role="gold">' + st.gold + '</b></span><span class="hud-stat streak' + (st.streak ? '' : ' off') + '" aria-label="Série de jours"><span class="emoji">🔥</span><b>' + st.streak + '</b></span>' +
      '<button class="hud-gear" data-act="settings" aria-label="Réglages"><span class="emoji">⚙️</span></button></div>' + (tab === 'map' ? crystalsRow(26) : '');
  }
  var TABS = [['map', '🗺️', 'Carte'], ['hero', '🛡️', 'Héros'], ['grimoire', '📕', 'Grimoire'], ['shop', '🛒', 'Boutique'], ['training', '🎯', 'Entraînement', 'Entraîner']];
  function nav(tab) {
    var pts = S.skillPoints();
    return TABS.map(function (t) { return '<button class="tab' + (t[0] === tab ? ' on' : '') + '" data-act="go" data-tab="' + t[0] + '"' + (t[0] === tab ? ' aria-current="page"' : '') + '><span class="tab-ico emoji">' + t[1] + (t[0] === 'hero' && pts > 0 ? '<i class="dot">' + pts + '</i>' : '') + '</span><span class="tab-lab"' + (t[3] ? ' data-short="' + t[3] + '"' : '') + '><span>' + t[2] + '</span></span></button>'; }).join('');
  }

  // ---------------------------------------------------------------- carte du monde
  var MAP = { W: 400, RH: 560, PADT: 40, PADB: 76, XS: [108, 262, 306, 176, 92], HOME: 230 };
  // La maison (niveau 1, région sans cristal) est le point de départ, tout en bas de la carte.
  function mapGeom() {
    var n = S.REGIONS.length, hh = S.HOME_CHAPTER ? MAP.HOME : 0, H = MAP.PADT + n * MAP.RH + MAP.PADB + hh, nodes = [];
    if (S.HOME_CHAPTER) nodes.push({ id: S.HOME_CHAPTER.id, region: -1, j: 0, x: 118, y: H - 112, home: true });
    S.REGIONS.forEach(function (r, i) {
      var rb = H - MAP.PADB - hh - i * MAP.RH;
      (r.chapters || []).forEach(function (id, j) { var x = MAP.XS[j % MAP.XS.length]; nodes.push({ id: id, region: i, j: j, x: i % 2 ? MAP.W - x : x, y: rb - 112 - j * 94 }); });
    });
    return { H: H, nodes: nodes, home: hh, rb: function (i) { return H - MAP.PADB - hh - i * MAP.RH; } };
  }
  function homeArt(top, H) {
    var s = '<rect x="0" y="' + top + '" width="400" height="' + (H - top) + '" fill="#9BD86F"/><path d="M0 ' + (top + 18) + 'q100-30 200 0t200 0V' + top + 'H0z" fill="#A6E07A"/>';
    s += '<path d="M200 ' + (H - 60) + 'q-40 50 0 80" stroke="#EDDBAA" stroke-width="26" fill="none" stroke-linecap="round"/>';
    s += '<g transform="translate(200 ' + (H - 150) + ')"><rect x="-74" y="-40" width="148" height="78" rx="6" fill="#FFF3D6" stroke="#D9BE86" stroke-width="3"/><path d="M-88-36L0-96L88-36z" fill="#D9542B" stroke="#A8402A" stroke-width="3" stroke-linejoin="round"/><rect x="44" y="-92" width="16" height="34" fill="#A8402A"/>' +
      '<rect x="-60" y="-24" width="34" height="28" rx="4" fill="#BFE8FF" stroke="#8B5A2B" stroke-width="3"/><rect x="26" y="-24" width="34" height="28" rx="4" fill="#BFE8FF" stroke="#8B5A2B" stroke-width="3"/><rect x="-14" y="-2" width="28" height="40" rx="4" fill="#D9542B" stroke="#8B5A2B" stroke-width="3"/><circle cx="8" cy="18" r="2.5" fill="#F5B833"/>' +
      '<rect x="-60" y="-56" width="30" height="22" rx="4" fill="#BFE8FF" stroke="#8B5A2B" stroke-width="3"/><path d="M-60-56h30v8h-30z" fill="#F27BB1"/></g>';
    s += D.tree(60, H - 120, 1.1, '#55B35E') + D.tree(340, H - 130, 1) + D.flowers([[110, H - 64], [300, H - 70], [150, H - 30], [260, H - 34], [40, H - 40], [360, H - 46]]);
    return s;
  }
  function regionArt(i, top, rb) {
    var s = '', W = MAP.W, y = function (v) { return top + v; };
    var wave = function (c, dy) { return '<path d="M0 ' + (top + (dy || 0)) + 'q50-26 100 0t100 0t100 0t100 0V' + (rb + 40) + 'H0Z" fill="' + c + '"/>'; };
    if (i === 0) {
      s += wave('#A6E07A') + '<ellipse cx="90" cy="' + y(170) + '" rx="120" ry="46" fill="#8ED468" opacity=".7"/><ellipse cx="320" cy="' + y(360) + '" rx="130" ry="50" fill="#8ED468" opacity=".7"/><ellipse cx="60" cy="' + y(470) + '" rx="90" ry="34" fill="#BDEB96" opacity=".8"/>';
      s += D.house(330, y(470), 1.1, '#FBEBC8', '#D9542B') + D.house(366, y(500), 0.9, '#F6D9B0', '#2F8FE6') + D.house(40, y(330), 1, '#FFF3D6', '#9A63E0');
      s += D.tree(30, y(120), 1) + D.tree(370, y(200), 1.1, '#55B35E') + D.tree(210, y(70), 0.8) + D.tree(26, y(420), 0.9, '#55B35E') + D.tree(380, y(330), 0.8) + D.tree(150, y(520), 0.8, '#55B35E');
      s += '<ellipse cx="330" cy="' + y(110) + '" rx="34" ry="16" fill="#7FCBF5"/><g transform="translate(250 ' + y(130) + ')"><rect x="-10" y="-34" width="20" height="34" fill="#E9D6A6"/><path d="M-14-32L0-48l14 16z" fill="#B98045"/><path d="M0-36l22-14M0-36l-22-14M0-36l14 22M0-36l-14 22" stroke="#7A4A22" stroke-width="4" stroke-linecap="round"/></g>';
      s += D.flowers([[70, y(230)], [120, y(300)], [300, y(260)], [240, y(420)], [180, y(180)], [350, y(60)], [90, y(60)], [200, y(330)], [300, y(520)]]);
    } else if (i === 1) {
      s += wave('#4FAE66') + '<ellipse cx="300" cy="' + y(150) + '" rx="130" ry="50" fill="#3F9B58" opacity=".7"/><ellipse cx="90" cy="' + y(380) + '" rx="130" ry="56" fill="#3F9B58" opacity=".7"/>';
      [[30, 90, 1.2], [80, 150, 0.9], [360, 240, 1.2], [330, 300, 0.9], [200, 60, 1], [40, 270, 1], [250, 400, 1.1], [370, 440, 1], [150, 500, 0.9], [30, 500, 1.1], [300, 60, 0.9], [210, 230, 0.8]].forEach(function (p, k) { s += k % 3 === 0 ? D.pine(p[0], y(p[1]), p[2] * 1.2, '#2E7D5B') : D.tree(p[0], y(p[1]), p[2], k % 2 ? '#2E8B4A' : '#37A055'); });
      s += '<g transform="translate(120 ' + y(250) + ')"><rect x="-5" y="-10" width="10" height="34" fill="#6B4426"/><circle cx="0" cy="-30" r="26" fill="#2E8B4A"/>' + D.house(0, -18, 0.6, '#F6D9B0', '#B98045') + '</g>';
      s += '<path d="M300 ' + y(196) + 'q0-12 11-12t11 12z" fill="#E5484D"/><rect x="308" y="' + y(195) + '" width="6" height="9" fill="#FFF3D6"/>' + D.flowers([[60, y(210)], [280, y(330)], [180, y(440)]], '#D8FF7A');
    } else if (i === 2) {
      s += wave('#3FA7E8') + '<path d="M0 ' + y(400) + 'q80-40 150-10t120-30 130 10V' + (rb + 40) + 'H0z" fill="#F2E0A6"/>';
      s += D.waves(y(80), '#fff', 10) + D.waves(y(150), '#BFE8FF', 10) + D.waves(y(230), '#fff', 10) + D.waves(y(310), '#BFE8FF', 10);
      s += '<ellipse cx="80" cy="' + y(200) + '" rx="56" ry="22" fill="#F2E0A6"/>' + D.tree(70, y(196), 0.7, '#3E9B4F') + '<ellipse cx="330" cy="' + y(120) + '" rx="50" ry="18" fill="#DCCB93"/>';
      s += D.boat(300, y(260), 1.1) + D.boat(120, y(110), 0.9, '#FFD9A0') + D.boat(210, y(60), 1.2, '#C9D2DC');
      s += '<g transform="translate(350 ' + y(470) + ')"><rect x="-9" y="-60" width="18" height="60" fill="#fff"/><rect x="-9" y="-44" width="18" height="12" fill="#E5484D"/><rect x="-9" y="-20" width="18" height="12" fill="#E5484D"/><path d="M-12-60h24l-4-12h-16z" fill="#3A4A66"/><circle cx="0" cy="-66" r="5" fill="#FFE066"/></g>' + D.house(60, y(500), 1, '#FBEBC8', '#2F8FE6') + D.house(110, y(520), 0.8, '#F6D9B0', '#D9542B');
    } else if (i === 3) {
      s += wave('#EAF3FF') + D.mountain(60, y(200), 180, 150, '#9FB3E0') + D.mountain(340, y(260), 200, 190, '#8C9CF0') + D.mountain(200, y(120), 160, 110, '#B5C3EC') + D.mountain(40, y(440), 150, 120, '#A9B8E8') + D.mountain(360, y(500), 140, 110, '#9FB3E0');
      s += '<ellipse cx="210" cy="' + y(330) + '" rx="70" ry="26" fill="#BFE3FA"/><ellipse cx="196" cy="' + y(324) + '" rx="30" ry="8" fill="#fff" opacity=".6"/>';
      [[130, 240], [270, 420], [300, 110], [100, 500], [230, 520], [330, 340], [150, 90]].forEach(function (p, k) { s += D.pine(p[0], y(p[1]), 1 + (k % 3) * 0.2, '#2E7D5B', true); });
      s += '<g transform="translate(110 ' + y(330) + ')"><rect x="-16" y="-20" width="32" height="20" fill="#C9CED8"/><path d="M-18-20a18 16 0 0 1 36 0z" fill="#8C9CF0"/><path d="M2-30l16-14" stroke="#5A5F72" stroke-width="5" stroke-linecap="round"/></g>' + D.house(280, y(240), 0.9, '#E6EEF8', '#7C8CF8');
    } else {
      s += wave('#8E8A9E') + '<ellipse cx="100" cy="' + y(330) + '" rx="140" ry="50" fill="#7E7A8F" opacity=".7"/><ellipse cx="310" cy="' + y(170) + '" rx="130" ry="50" fill="#7E7A8F" opacity=".7"/>';
      s += '<g transform="translate(200 ' + y(96) + ')"><rect x="-70" y="-40" width="140" height="50" fill="#5A5670"/><path d="M-70-40h20v-12h14v12h20v-12h12v12h20v-12h14v12h10v0z" fill="#5A5670"/>' + D.tower(-70, 10, 1.1, '#4B4760', '#2A1F3D') + D.tower(70, 10, 1.1, '#4B4760', '#2A1F3D') + D.tower(0, 10, 1.5, '#3F3B55', '#A560E8') + '<rect x="-12" y="-16" width="24" height="26" rx="12" fill="#2A1F3D"/></g>';
      [[40, 200, 0.8], [360, 300, 0.9], [60, 460, 0.8], [330, 480, 0.7], [250, 380, 0.6], [150, 250, 0.6]].forEach(function (p) { s += D.tower(p[0], y(p[1]), p[2], '#6E6A80', '#4B4760'); });
      s += D.cloud(80, y(60), 1.2, 0.35) + D.cloud(330, y(40), 1, 0.3) + '<g fill="#5A5670" opacity=".6">' + [[120, 420], [280, 260], [200, 500], [40, 330]].map(function (p) { return '<rect x="' + p[0] + '" y="' + y(p[1]) + '" width="34" height="18" rx="3"/>'; }).join('') + '</g>';
    }
    return s;
  }
  function trail(nodes) {
    if (!nodes.length) return '';
    var d = 'M' + nodes[0].x + ' ' + (nodes[0].y + 60) + 'L' + nodes[0].x + ' ' + nodes[0].y;
    for (var i = 1; i < nodes.length; i++) { var a = nodes[i - 1], b = nodes[i], my = (a.y + b.y) / 2; d += 'C' + a.x + ' ' + my + ' ' + b.x + ' ' + my + ' ' + b.x + ' ' + b.y; }
    return '<path d="' + d + '" stroke="#5E3A1A" stroke-opacity=".28" stroke-width="20" fill="none" stroke-linecap="round"/><path d="' + d + '" stroke="#FFF1CC" stroke-width="13" fill="none" stroke-linecap="round"/><path d="' + d + '" stroke="#D9B978" stroke-width="3" fill="none" stroke-linecap="round" stroke-dasharray="1 14"/>';
  }
  function map() {
    var st = S.state, g = mapGeom(), H = g.H, cur = S.currentChapterId(), art = '', html = '';
    for (var i = S.REGIONS.length - 1; i >= 0; i--) art += regionArt(i, g.rb(i) - MAP.RH, g.rb(i));
    art = '<rect width="400" height="' + H + '" fill="#6E6A80"/>' + art + '<rect x="0" y="' + (H - MAP.PADB - g.home + 30) + '" width="400" height="' + (MAP.PADB + g.home) + '" fill="#8ED468"/>' + (g.home ? homeArt(H - g.home - 10, H) : '');
    html += '<div class="map" style="aspect-ratio:' + MAP.W + '/' + H + '"><svg class="map-art" viewBox="0 0 ' + MAP.W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">' + art + trail(g.nodes) + '</svg>';
    var pct = function (v, tot) { return (v / tot * 100).toFixed(3) + '%'; };
    S.REGIONS.forEach(function (r, i) {
      var unlocked = S.isRegionUnlocked(i), present = (r.chapters || []).filter(function (id) { return !!S.chapter(id); }).length, done = (r.chapters || []).filter(function (id) { return S.isChapterDone(id); }).length;
      var prev = S.REGIONS[i - 1];
      if (!unlocked) html += '<div class="fog" style="top:' + pct(g.rb(i) - MAP.RH - 14, H) + ';height:' + pct(MAP.RH - 10, H) + '"><div class="fog-msg"><span class="emoji">🔒</span><b>' + esc(r.name) + '</b><span>Retrouve le ' + esc(prev ? prev.crystal.fr : 'cristal') + ' pour dissiper le brouillard.</span></div></div>';
      html += '<div class="region-banner' + (unlocked ? '' : ' locked') + '" style="top:' + pct(g.rb(i), H) + ';--c:' + r.color + '"><span class="emoji">' + r.emoji + '</span><span class="rb-text"><b>' + esc(r.name) + '</b><small>' + esc(r.fr) + ' · ' + esc(r.cefr) + (present ? (unlocked ? ' · ' + done + '/' + (r.chapters || []).length : '') : ' · bientôt') + '</small></span></div>';
    });
    if (g.home && S.HOME_REGION) { var hr = S.HOME_REGION; html += '<div class="region-banner home-banner" style="top:' + pct(H - 46, H) + ';--c:' + hr.color + '"><span class="emoji">' + hr.emoji + '</span><span class="rb-text"><b>' + esc(hr.name) + ' · ' + esc(hr.fr) + '</b><small>Niveau 1 · ' + esc(hr.cefr) + (S.isChapterDone(S.HOME_CHAPTER.id) ? ' · ✓' : '') + '</small></span></div>'; }
    g.nodes.forEach(function (n) {
      var ch = S.chapter(n.id), r = n.home ? S.HOME_REGION || { color: '#FF9E57' } : S.REGIONS[n.region], num = S.chapterNum(n.id), cls, inner, label, stars = '';
      if (!ch) { cls = 'soon'; inner = '<span class="mn-emoji emoji">⏳</span>'; label = 'Bientôt'; }
      else {
        var doneCh = S.isChapterDone(n.id), open = S.isChapterUnlocked(n.id);
        cls = doneCh ? 'done' : open ? 'open' : 'locked'; if (n.id === cur && open) cls += ' current'; if (n.home) cls += ' home';
        inner = '<span class="mn-emoji emoji">' + (open ? esc(ch.emoji || '⭐') : '🔒') + '</span>';
        label = esc(ch.title);
        if (doneCh) stars = UI.stars(S.chapterStars(n.id).avg, 'mini');
      }
      html += '<div class="map-node-wrap' + (n.x > MAP.W / 2 ? ' lab-left' : ' lab-right') + (n.id === cur ? ' is-current' : '') + (S.isRegionUnlocked(n.region) ? '' : ' in-fog') + '" style="left:' + pct(n.x, MAP.W) + ';top:' + pct(n.y, H) + ';--c:' + r.color + ';--nx:' + (n.x / MAP.W).toFixed(3) + '">' +
        (n.id === cur && ch && S.isChapterUnlocked(n.id) ? '<div class="map-hero' + (n.x > MAP.W / 2 ? ' right' : ' left') + '" aria-hidden="true">' + C.heroSvg(st, { size: 76 }) + '</div>' : '') +
        '<button class="map-node ' + cls + '" data-act="chapter" data-id="' + n.id + '" aria-label="' + (n.home ? 'Niveau 1, la maison' : 'Chapitre ' + num) + ' : ' + (ch ? esc(ch.title) : 'bientôt') + '"' + (ch ? '' : ' aria-disabled="true"') + '>' + inner + (n.home ? '' : '<span class="mn-num">' + num + '</span>') + '</button>' +
        '<div class="mn-label">' + stars + '<span>' + label + '</span></div></div>';
    });
    html += '</div>';
    return html;
  }

  // ---------------------------------------------------------------- chapitre
  function stepInfo(ch, step) {
    if (step.type === 'scene') return { title: 'Scène', sub: window.Story.placeOf(step.place).name || '' };
    if (step.type === 'lesson') { var l = (ch.lessons || []).filter(function (x) { return x.id === step.lesson; })[0] || {}; return { title: 'Leçon : ' + (l.title || ''), sub: ((l.vocab || []).length) + ' nouveaux mots' }; }
    if (step.type === 'dialogue') { var n = C.npc(step.npc); return { title: 'Dialogue avec ' + (n ? n.name : step.npc), sub: T(step.goal || '') }; }
    var boss = step.boss ? S.foe(step.boss) : null;
    return { title: boss ? 'Combat de boss : ' + boss.name : 'Combat', sub: T(step.intro || '') };
  }
  function chapter(chId) {
    var ch = S.chapter(chId); if (!ch) return '';
    var r = S.regionOfChapter(chId) || { color: '#3DBB6B', name: '' }, next = S.nextStepIndex(chId), done = S.isChapterDone(chId), open = S.isChapterUnlocked(chId);
    var firstPlace = (ch.steps[0] && ch.steps[0].place) || 'meadow_road';
    var h = '<div class="page chapter" style="--c:' + r.color + '"><div class="ch-banner"><div class="stage-bg">' + C.backdrop(window.Story.placeOf(firstPlace).bg) + '</div><button class="back-btn light" data-act="close-overlay" aria-label="Retour à la carte">' + UI.icon('back') + '</button><div class="ch-banner-text"><span class="ch-kicker">' + esc(r.name) + ' · Chapitre ' + ch.n + ' · ' + esc(ch.cefr || '') + '</span><h1><span class="emoji">' + esc(ch.emoji || '') + '</span> ' + esc(ch.title) + '</h1><span class="ch-en" lang="en">' + esc(ch.titleEn || '') + '</span></div></div>';
    h += '<div class="page-body"><p class="ch-summary">' + esc(T(ch.summary || '')) + '</p>';
    h += '<div class="card goals"><h3><span class="emoji">🎯</span> À la fin de ce chapitre</h3><ul>' + (ch.objectives || []).map(function (o) { return '<li class="' + (done ? 'ok' : '') + '"><span class="tick">' + (done ? '✓' : '') + '</span>' + esc(o) + '</li>'; }).join('') + '</ul>' + ((ch.grammar || []).length ? '<button class="btn btn-parch btn-sm" data-act="tips" data-id="' + chId + '"><span class="emoji">📜</span> Astuces de Pico (' + ch.grammar.length + ')</button>' : '') + '</div>';
    h += '<h2 class="section">Les étapes</h2><ol class="steps">';
    ch.steps.forEach(function (st, i) {
      var ss = S.stepState(chId, i), info = stepInfo(ch, st), unlocked = open && S.isStepUnlocked(chId, i), cls = ss.done ? 'done' : (unlocked && i === next ? 'current' : unlocked ? 'open' : 'locked');
      h += '<li><button class="step ' + cls + '" data-act="step" data-ch="' + chId + '" data-i="' + i + '"' + (unlocked ? '' : ' aria-disabled="true"') + '><span class="step-ico emoji">' + STEP_ICON[st.type] + '</span><span class="grow"><b>' + esc(info.title) + '</b>' + (info.sub ? '<small>' + esc(info.sub) + '</small>' : '') + '</span><span class="step-state">' + (ss.done ? (st.type === 'scene' ? '<span class="tick on">✓</span>' : UI.stars(ss.stars, 'mini')) + '<small class="replay">rejouer</small>' : unlocked ? '<span class="go">▶</span>' : '<span class="emoji">🔒</span>') + '</span></button></li>';
    });
    h += '</ol></div>';
    var cta = '';
    if (!open) cta = '<button class="btn btn-block btn-lg" disabled><span class="emoji">🔒</span> Termine d\'abord le chapitre précédent</button>';
    else if (next >= 0) { var ni = stepInfo(ch, ch.steps[next]); cta = '<button class="btn btn-gold btn-lg btn-block" data-act="step" data-ch="' + chId + '" data-i="' + next + '" data-role="continue"><span class="emoji">' + STEP_ICON[ch.steps[next].type] + '</span> ' + (next === 0 ? 'Commencer' : 'Continuer') + ' : ' + esc(ni.title.replace(/^Leçon : /, '')) + '</button>'; }
    else cta = '<button class="btn btn-green btn-lg btn-block" data-act="close-overlay"><span class="emoji">🗺️</span> Chapitre terminé · retour à la carte</button>';
    return h + '<div class="page-foot">' + cta + '</div></div>';
  }
  function tipsHtml(ch) {
    return (ch.grammar || []).map(function (t) {
      return '<div class="tip-card"><h3>' + esc(t.title) + '</h3><p>' + esc(t.body) + '</p>' + (t.examples || []).map(function (ex) { return '<div class="tip-ex"><span class="en" lang="en">' + esc(ex.en) + ' ' + UI.speakBtn(ex.en) + '</span><span class="fr">' + esc(ex.fr) + '</span></div>'; }).join('') + '</div>';
    }).join('');
  }

  // ---------------------------------------------------------------- aperçu des mots avant une leçon
  function lessonIntro(ch, lesson, replay) {
    return '<div class="page lesson-intro"><div class="page-head"><button class="back-btn" data-act="quit-step" aria-label="Retour">' + UI.icon('back') + '</button><div class="grow"><h1>' + esc(lesson.title) + '</h1><div class="ph-sub">Entraînement de Wordkeeper</div></div></div>' +
      '<div class="page-body"><div class="pico-says">' + C.pico({ size: 84, mood: 'happy' }) + '<div class="bubble">' + (replay ? 'On révise ! Voici les mots de la leçon.' : 'Voici tes nouveaux mots magiques. Touche-les pour les écouter, puis on s\'entraîne !') + '</div></div>' +
      '<div class="word-cards">' + (lesson.vocab || []).map(function (v) { return '<button class="word-card" data-action="speak" data-text="' + esc(v.en) + '"><span class="wc-emoji emoji">' + esc(v.emoji || '💬') + '</span><span class="wc-en" lang="en">' + esc(v.en) + '</span><span class="wc-fr">' + esc(v.fr) + '</span></button>'; }).join('') + '</div></div>' +
      '<div class="page-foot"><button class="btn btn-gold btn-lg btn-block" data-act="lesson-go">S\'entraîner <span class="emoji">🎓</span></button></div></div>';
  }

  // ---------------------------------------------------------------- cartes de récompense & bilans
  function rewardCard(c, i) {
    var st = 'style="--i:' + i + '"';
    if (c.kind === 'gold') return '<div class="loot gold" ' + st + '><span class="loot-ico emoji">🪙</span><div><b>+<span data-count="' + c.n + '">' + c.n + '</span> pièces d\'or</b>' + (c.bonus ? '<small>bonus de chance inclus</small>' : '') + '</div></div>';
    if (c.kind === 'xp') return '<div class="loot xp" ' + st + '><span class="loot-ico emoji">✨</span><div><b>+<span data-count="' + c.n + '">' + c.n + '</span> XP</b></div></div>';
    if (c.kind === 'potion') return '<div class="loot item" ' + st + '><span class="loot-ico emoji">🧪</span><div><b>' + c.n + ' potion' + (c.n > 1 ? 's' : '') + '</b><small>Rend 40 % de ta vie en combat.</small></div></div>';
    if (c.kind === 'item') return '<div class="loot item big" ' + st + '><span class="loot-ico emoji">' + esc(c.item.emoji) + '</span><div><span class="loot-kicker">Objet obtenu</span><b>' + esc(c.item.fr) + ' <i lang="en">' + esc(c.item.name) + '</i></b><small>' + esc(itemStat(c.item)) + (c.equipped ? ' · <u>équipé !</u>' : '') + '</small></div></div>';
    if (c.kind === 'spell') return '<div class="loot spell big" ' + st + '><span class="loot-ico emoji">' + esc(c.spell.emoji) + '</span><div><span class="loot-kicker">Nouveau sort</span><b lang="en">' + esc(c.spell.name) + ' <i>' + esc(c.spell.fr) + '</i></b><small>' + esc(c.spell.desc) + (c.equipped ? ' · <u>équipé !</u>' : ' · à équiper dans ta fiche Héros') + '</small></div></div>';
    if (c.kind === 'crystal') return '<div class="loot crystal big" style="--i:' + i + ';--c:' + c.region.crystal.color + '"><span class="loot-ico">' + gem(c.region.crystal.color, true, 36) + '</span><div><span class="loot-kicker">Cristal retrouvé</span><b>' + esc(c.region.crystal.fr) + '</b><small lang="en">' + esc(c.region.crystal.name) + '</small></div></div>';
    if (c.kind === 'level') return '<div class="loot level big" ' + st + '><span class="loot-ico emoji">🌟</span><div><span class="loot-kicker">Niveau supérieur</span><b>Niveau ' + c.level + ' !</b><small>+6 PV, +1,5 attaque · ' + c.points + ' point' + (c.points > 1 ? 's' : '') + ' de compétence à placer</small></div></div>';
    return '';
  }
  // opts : { kicker, title, sub, stars, cards, art, btn, replay, confetti }
  function result(opts) {
    return '<div class="page result' + (opts.cls ? ' ' + opts.cls : '') + '">' + (opts.confetti ? '<canvas class="confetti" aria-hidden="true"></canvas>' : '') + '<div class="result-body">' + (opts.art || '') + (opts.kicker ? '<div class="res-kicker">' + opts.kicker + '</div>' : '') + '<h1>' + opts.title + '</h1>' + (opts.stars ? UI.stars(opts.stars, 'big') : '') + (opts.sub ? '<p class="res-sub">' + opts.sub + '</p>' : '') +
      ((opts.cards || []).length ? '<div class="loots">' + opts.cards.map(rewardCard).join('') + '</div>' : '') + (opts.replay ? '<p class="res-note">Étape rejouée : récompenses réduites.</p>' : '') + (opts.extra || '') + '</div><div class="page-foot"><button class="btn btn-gold btn-lg btn-block" data-act="result-next">' + (opts.btn || 'Continuer') + '</button></div></div>';
  }
  function crystalScene(region, nextRegion) {
    return '<div class="page crystal-scene" style="--c:' + region.crystal.color + '"><canvas class="confetti" aria-hidden="true"></canvas><div class="result-body"><div class="cs-rays" aria-hidden="true"></div><div class="cs-gem">' + gem(region.crystal.color, true, 150) + '</div><div class="res-kicker" lang="en">' + esc(region.crystal.name) + '</div><h1>' + esc(region.crystal.fr) + ' retrouvé !</h1><p class="res-sub">Les mots reviennent à ' + esc(region.name) + '. Tu maîtrises maintenant : <b>' + esc(region.crystal.grammar) + '</b>.</p>' +
      (nextRegion ? '<div class="cs-next" style="--c:' + nextRegion.color + '"><span class="emoji">' + nextRegion.emoji + '</span><div><span class="loot-kicker">Nouvelle région</span><b>' + esc(nextRegion.name) + '</b><small>' + esc(nextRegion.fr) + ' · niveau ' + esc(nextRegion.cefr) + '</small></div></div>' : '<div class="cs-next"><span class="emoji">👑</span><div><b>Les cinq cristaux sont réunis !</b><small>Echoria a retrouvé sa voix.</small></div></div>') +
      '</div><div class="page-foot"><button class="btn btn-gold btn-lg btn-block" data-act="result-next">Continuer</button></div></div>';
  }
  function chapterDone(ch) {
    var stars = S.chapterStars(ch.id), words = 0; (ch.lessons || []).forEach(function (l) { words += (l.vocab || []).length; });
    var homeEnd = ch.kind === 'home' && ch.ui && ch.ui.ending;
    return '<div class="page result chapter-done' + (homeEnd ? ' home-done' : '') + '"><canvas class="confetti" aria-hidden="true"></canvas><div class="result-body"><div class="cd-art">' + C.pico({ size: 110, mood: 'party', cls: 'party' }) + C.heroSvg(S.state, { size: 120, mood: 'happy' }) + '</div><div class="res-kicker">' + (homeEnd ? esc(T(homeEnd.kicker)) : 'Chapitre ' + ch.n + ' terminé') + '</div><h1>' + esc(ch.title) + '</h1>' + UI.stars(stars.avg, 'big') +
      (homeEnd ? '<div class="card tbc"><h3><span class="emoji">⏳</span> ' + esc(T(homeEnd.title)) + '</h3><p>' + esc(T(S.state.hero.gender === 'f' && homeEnd.textF ? homeEnd.textF : homeEnd.text)) + '</p></div>' : '') +
      '<div class="cd-stats"><div><b>' + stars.got + '/' + stars.max + '</b><small>étoiles</small></div><div><b>' + words + '</b><small>mots appris</small></div><div><b>' + (ch.grammar || []).length + '</b><small>fiches</small></div></div>' +
      '<div class="card goals"><h3><span class="emoji">🏅</span> Je sais maintenant…</h3><ul>' + (ch.objectives || []).map(function (o) { return '<li class="ok"><span class="tick">✓</span>' + esc(o.replace(/^Je sais\s*/i, '')) + '</li>'; }).join('') + '</ul></div>' +
      ((ch.grammar || []).length ? '<div class="card goals"><h3><span class="emoji">📜</span> Fiches ajoutées à ton Grimoire</h3><ul>' + ch.grammar.map(function (g) { return '<li class="ok"><span class="tick">+</span>' + esc(g.title) + '</li>'; }).join('') + '</ul></div>' : '') +
      '</div><div class="page-foot"><button class="btn btn-gold btn-lg btn-block" data-act="result-next">Retour à la carte</button></div></div>';
  }
  // Fin du jeu : après la dernière scène du dernier chapitre (rejouable depuis la fiche Héros).
  function ending() {
    var st = S.state, words = S.learnedVocab().length, li = S.levelInfo(), girl = st.hero.gender === 'f', spark = '';
    for (var i = 0; i < 16; i++) spark += '<i style="left:' + (4 + (i * 37) % 92) + '%;top:' + (4 + (i * 53) % 70) + '%;animation-delay:' + (i * 0.31).toFixed(2) + 's"></i>';
    return '<div class="page result ending"><canvas class="confetti" aria-hidden="true"></canvas><div class="sparkles" aria-hidden="true">' + spark + '</div><div class="result-body">' +
      '<div class="end-gems">' + S.REGIONS.map(function (r, k) { return '<span style="--i:' + k + ';--c:' + r.crystal.color + '">' + gem(r.crystal.color, true, 42) + '</span>'; }).join('') + '</div>' +
      '<div class="res-kicker" lang="en">The End</div><h1>Echoria a retrouvé sa voix !</h1>' +
      '<div class="cd-art">' + C.pico({ size: 104, mood: 'party', cls: 'party' }) + C.heroSvg(st, { size: 128, mood: 'happy' }) + '</div>' +
      '<p class="res-sub">Bravo ' + esc(st.hero.name || 'Wordkeeper') + ' ! Tu as réuni les cinq cristaux et montré à Hugh qu\'on apprend en se trompant. Tu es ' + (girl ? 'une vraie' : 'un vrai') + ' <b lang="en">Wordkeeper</b>.</p>' +
      '<div class="cd-stats"><div><b>' + words + '</b><small>mots appris</small></div><div><b>' + st.unitsDone.length + '</b><small>chapitres</small></div><div><b>' + li.level + '</b><small>niveau</small></div></div>' +
      '<p class="end-next"><span class="emoji">⭐</span> L\'aventure continue : rejoue les chapitres pour gagner toutes les étoiles, et entraîne-toi chaque jour pour garder tes mots magiques.</p>' +
      '</div><div class="page-foot"><button class="btn btn-gold btn-lg btn-block" data-act="result-next">Retour à la carte</button></div></div>';
  }

  window.Screens = {
    gem: gem, crystalsRow: crystalsRow, itemStat: itemStat, head: head, title: title, creator: creator, creatorPreview: creatorPreview, hud: hud, nav: nav, TABS: TABS,
    map: map, mapGeom: mapGeom, chapter: chapter, stepInfo: stepInfo, tipsHtml: tipsHtml, lessonIntro: lessonIntro, rewardCard: rewardCard, result: result, crystalScene: crystalScene, chapterDone: chapterDone, ending: ending, STEP_ICON: STEP_ICON
  };
})();
