/* ==========================================================================
 * ECHORIA — combat.js · moteur de combat temps réel (window.Combat)
 * Contrat : SPEC.md §6. Script classique ES2020, aucune dépendance hormis
 * window.GAME.catalog (facultatif : valeurs par défaut intégrées).
 *
 *   var handle = Combat.start(container, opts);
 *   handle.destroy() · pause() · resume() · debugWin() · debugLose() · state
 *
 * SONS émis via opts.sound(name) (tous facultatifs, noms stables) :
 *   'countdown'  chaque chiffre du 3-2-1          'go'        départ
 *   'spawn'      un ennemi apparaît                'wave'      nouvelle vague
 *   'boss'       entrée du boss                    'swing'     coup dans le vide
 *   'hit'        coup qui touche                   'crit'      3e coup du combo
 *   'cling'      coup sur une armure               'dash'      roulade
 *   'hurt'       le héros est touché               'potion'    potion bue
 *   'pet'        coup de bec de Pico               'pouf'      ennemi vaincu
 *   'telegraph'  un boss prépare une attaque       'rune'      la Rune de Mot s'ouvre
 *   'correct'    bonne réponse                     'wrong'     mauvaise réponse / temps écoulé
 *   'spell'      sort à pleine puissance           'fizzle'    sort « pschitt »
 *   'shield'     bouclier de silence levé          'shield_break' bouclier brisé
 *   'win'        victoire                          'lose'      défaite
 *   'pause'      menu pause                        'click'     bouton de menu
 * Vibrations : opts.vibrate(ms). Voix : opts.speak(q.say) sur bonne réponse.
 *
 * TOLÉRANCES / PRÉCISIONS par rapport au contrat (tout champ manquant a un défaut) :
 *   - hero.atk = attaque TOTALE (arme comprise) ; si absent : weapon.atk + 4, sinon 10.
 *   - hero.baseAtk / hero.level (facultatifs, fournis par la coquille) : part de croissance due au niveau.
 *     PV ennemis × baseAtk/10, attaque ennemie × (1 + 6 % par niveau) : les bases du catalogue valent
 *     « pour un héros de 100 PV / attaque 10 », l'équipement et les compétences restent un avantage.
 *   - champs facultatifs acceptés : hero.attackSpeed (1), hero.regen (PV/s), hero.slowOnHit, weapon.bonus
 *     { attackSpeed, slowOnHit }, pet.rate (1), spells[i].effect (sinon catalogue), opts.skipIntro,
 *     opts.sandbox (tests : pas de vagues automatiques ni de victoire), opts.tutorial (mini-tutoriel illustré en
 *     3 cartes avant le compte à rebours ; opts.onTutorial() est appelé quand l'enfant l'a terminé ou passé).
 *   - Combat.tutorial(container, { onDone }) : le même mini-tutoriel, seul (bouton « revoir » des réglages).
 *   - quiz() peut renvoyer q.sub : petite ligne affichée sous q.prompt (ex. la traduction française d'une phrase à trou).
 *   - Indices clavier (« Espace », « Maj », « 1 », « E ») : masqués par défaut, affichés dès qu'une touche de jeu
 *     est utilisée (classe cb-kbd), masqués de nouveau au premier toucher tactile.
 *   - Mise en page : le terrain commence sous le HUD mesuré (zones sûres iOS comprises) plus une marge de décor,
 *     et s'arrête au-dessus des boutons (zone sûre du bas comprise) : aucun ennemi ne passe sous le HUD.
 *   - onEnd reçoit en plus : quit, tries, easy, difficulty. Il n'est appelé qu'UNE fois
 *     (victoire, ou « Quitter » depuis la pause / l'écran de défaite).
 *   - debugWin()/debugLose() appellent onEnd immédiatement (sans écran intermédiaire).
 *   - handle.state : { phase, paused, wave, waves, hp, maxHp, enemies, rune, boss, bossHp,
 *     bossShield, potions, kills, time, tries, difficulty, ended }.
 *     phase ∈ intro · countdown · fight · boss · victory · defeat · ended.
 *   - handle.debug : outils de test (spawn, killAll, hurtHero, bossHp, bot, simulate, perf…).
 *   - Combat.tuning : multiplicateurs globaux appliqués aux bases du catalogue (PV ×2 pour les ennemis,
 *     ×1,8 pour les boss ; attaque ×1,5 / ×1,3), réglés au bot (test « balance » + test/balance.js sur les 25 chapitres) ; modifiables par la coquille.
 *   - Dégâts des sorts = hero.atk × spell.power × coefficient de l'effet (feu ×4 perforant, foudre ×3 × 4 cibles,
 *     étoiles ×1,6 par impact, glace ×1,5, lumière et vent ×1,2) ; « pschitt » = 30 %.
 *   - Hushguard : tout sort réussi brise son armure (même un soin : c'est le mot qui compte), un sort
 *     raté la fêle 5 s. Sans aucun sort équipé, l'épée lui fait 25 % de dégâts (pas de blocage).
 *   - Bouclier de silence : toutes les 2 erreurs il « se fissure » (une bonne réponse de moins à enchaîner) ;
 *     en mode facile, une de moins dès le départ (minimum 2). Briser le dernier bouclier de Lord Hush le vainc.
 * ========================================================================== */
(function () {
  "use strict";

  var TAU = Math.PI * 2;
  var PI = Math.PI;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function num(v, d) { return typeof v === "number" && isFinite(v) ? v : d; }
  function angDiff(a, b) { var d = a - b; while (d > PI) d -= TAU; while (d < -PI) d += TAU; return d; }
  function easeOut(t) { return 1 - (1 - t) * (1 - t); }
  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  // ---------------------------------------------------------------- couleurs
  function hexRgb(h) {
    h = String(h || "#888888").replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) n = 0x888888;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function shade(hex, k) {
    var c = hexRgb(hex), t = k < 0 ? 0 : 255, p = Math.abs(k);
    return "rgb(" + Math.round(c[0] + (t - c[0]) * p) + "," + Math.round(c[1] + (t - c[1]) * p) + "," + Math.round(c[2] + (t - c[2]) * p) + ")";
  }
  function rgba(hex, a) { var c = hexRgb(hex); return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }

  // ---------------------------------------------------------------- catalogue (avec défauts)
  var DEF_ENEMIES = [
    { id: "mumblin", fr: "Mumblin", hp: 22, atk: 8, speed: 0.55, behavior: "chase", color: "#4B4B6A" },
    { id: "blot", fr: "Tache", hp: 34, atk: 10, speed: 0.35, behavior: "split", color: "#2B2B40" },
    { id: "shushbat", fr: "Chauve-chut", hp: 16, atk: 9, speed: 0.95, behavior: "swoop", color: "#6B4FA0" },
    { id: "spitter", fr: "Cracheur", hp: 26, atk: 11, speed: 0.4, behavior: "ranged", color: "#2E7D5B" },
    { id: "hushguard", fr: "Garde du Silence", hp: 60, atk: 14, speed: 0.4, behavior: "armored", color: "#7A7F8C" },
    { id: "whisper", fr: "Murmure", hp: 28, atk: 13, speed: 0.7, behavior: "teleport", color: "#7FD6FF" },
    { id: "frostling", fr: "Givrin", hp: 40, atk: 14, speed: 0.6, behavior: "slow_aura", color: "#A8E6FF" },
    { id: "silent_knight", fr: "Chevalier muet", hp: 85, atk: 18, speed: 0.5, behavior: "charge", color: "#5A5F72" }
  ];
  var DEF_BOSSES = [
    { id: "grumble", name: "Grumble", fr: "Grumble, le Mumblin géant", region: "r1", hp: 260, atk: 14, speed: 0.4, color: "#3B3B5C" },
    { id: "bramble", name: "Bramble", fr: "Bramble, le troll de ronces", region: "r2", hp: 420, atk: 16, speed: 0.35, color: "#3E6B2F" },
    { id: "captain_blank", name: "Captain Blank", fr: "Capitaine Blank, le pirate sans mémoire", region: "r3", hp: 620, atk: 18, speed: 0.6, color: "#9FD8E8" },
    { id: "glacia", name: "Glacia", fr: "Glacia, la wyverne de givre", region: "r4", hp: 850, atk: 20, speed: 0.5, color: "#8FD3FF" },
    { id: "lord_hush", name: "Lord Hush", fr: "Lord Hush, le Seigneur du Silence", region: "r5", hp: 1100, atk: 22, speed: 0.6, color: "#2A1F3D" }
  ];
  var DEF_SPELLS = [
    { id: "light", effect: "stun" }, { id: "heal", effect: "heal" }, { id: "fire", effect: "projectile" },
    { id: "wind", effect: "push" }, { id: "ice", effect: "freeze" }, { id: "shield", effect: "shield" },
    { id: "thunder", effect: "chain" }, { id: "slow", effect: "slow" }, { id: "starfall", effect: "area" }, { id: "echo", effect: "double" }
  ];
  // Seuils de bouclier de silence (fraction de PV) et nombre de bonnes réponses d'affilée.
  var BOSS_RULES = {
    grumble: { thr: [0.5], need: [2], r: 40 },
    bramble: { thr: [0.66, 0.33], need: [3, 3], r: 42 },
    captain_blank: { thr: [0.66, 0.33], need: [3, 3], r: 30 },
    glacia: { thr: [0.75, 0.5, 0.25], need: [3, 3, 3], r: 40 },
    lord_hush: { thr: [0.66, 0.33, 0.12], need: [3, 3, 4], r: 30 }
  };
  var ENEMY_R = { mumblin: 15, blot: 22, shushbat: 12, spitter: 15, hushguard: 18, whisper: 13, frostling: 14, silent_knight: 19 };
  var FALLBACK_QUIZ = [
    { prompt: "le chien", hint: "🐶", options: ["dog", "cat", "bird"], answer: 0, say: "dog" },
    { prompt: "le chat", hint: "🐱", options: ["fish", "cat", "cow"], answer: 1, say: "cat" },
    { prompt: "rouge", hint: "🔴", options: ["blue", "green", "red"], answer: 2, say: "red" },
    { prompt: "bonjour", hint: "👋", options: ["hello", "goodbye", "please"], answer: 0, say: "hello" },
    { prompt: "la pomme", hint: "🍎", options: ["egg", "apple", "milk"], answer: 1, say: "apple" }
  ];
  function catalog() { return (typeof window !== "undefined" && window.GAME && window.GAME.catalog) || null; }
  function findIn(list, def, id) {
    var i;
    if (list) for (i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    for (i = 0; i < def.length; i++) if (def[i].id === id) return def[i];
    return null;
  }

  // ---------------------------------------------------------------- petits outils de dessin
  function ell(g, x, y, rx, ry) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); }
  function circ(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); }
  function rrect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }
  var INK = "#1d1b2b";
  var glowCache = {};
  function glowSprite(color) {
    var c = glowCache[color];
    if (c) return c;
    c = document.createElement("canvas"); c.width = c.height = 64;
    var g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, rgba(color, 0.95)); gr.addColorStop(0.35, rgba(color, 0.45)); gr.addColorStop(1, rgba(color, 0));
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    glowCache[color] = c;
    return c;
  }
  function glow(g, color, x, y, r, a) {
    var pa = g.globalAlpha; g.globalAlpha = pa * a; g.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2); g.globalAlpha = pa;
  }

  // ========================================================================
  //  ARÈNES — fonds pré-rendus (un peintre par id de catalog.arenas)
  //  paint(g, W, H, R, pf) : W×H en unités monde, R = aléa déterministe,
  //  pf = zone de jeu {x0,y0,x1,y1}. Peut renseigner info.sea (points d'eau
  //  animés) et info.foamY (ligne d'écume).
  // ========================================================================
  function speckle(g, R, n, x0, y0, x1, y1, cols, r0, r1, a) {
    g.globalAlpha = a == null ? 1 : a;
    for (var i = 0; i < n; i++) {
      g.fillStyle = cols[(R() * cols.length) | 0];
      ell(g, x0 + R() * (x1 - x0), y0 + R() * (y1 - y0), r0 + R() * (r1 - r0), (r0 + R() * (r1 - r0)) * 0.7); g.fill();
    }
    g.globalAlpha = 1;
  }
  function vgrad(g, H, c0, c1) { var gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, c0); gr.addColorStop(1, c1); return gr; }
  function canopy(g, R, x, y, r, c0, c1, c2) {
    g.fillStyle = "rgba(0,0,0,.18)"; ell(g, x + r * 0.12, y + r * 0.18, r * 1.02, r * 0.98); g.fill();
    g.fillStyle = c0; circ(g, x, y, r); g.fill();
    for (var i = 0; i < 7; i++) {
      var a = R() * TAU, d = r * (0.25 + R() * 0.55), rr = r * (0.28 + R() * 0.25);
      g.fillStyle = i % 2 ? c1 : c2; circ(g, x + Math.cos(a) * d, y + Math.sin(a) * d, rr); g.fill();
    }
    g.fillStyle = c2; g.globalAlpha = 0.5; circ(g, x - r * 0.3, y - r * 0.32, r * 0.3); g.fill(); g.globalAlpha = 1;
  }
  function pine(g, x, y, r, snow) {
    g.fillStyle = "rgba(20,40,70,.18)"; ell(g, x + r * 0.2, y + r * 0.25, r, r * 0.9); g.fill();
    for (var k = 0; k < 4; k++) {
      var rr = r * (1 - k * 0.24), n = 8;
      g.fillStyle = k === 0 ? "#2f6b55" : k === 1 ? "#39795f" : k === 2 ? "#44896b" : "#519a79";
      g.beginPath();
      for (var i = 0; i < n * 2; i++) { var a = i / (n * 2) * TAU + k * 0.39, d = i % 2 ? rr * 0.7 : rr; g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d); }
      g.closePath(); g.fill();
      if (snow && k < 3) { g.fillStyle = "rgba(255,255,255,.9)"; for (i = 0; i < n; i++) { a = i / n * TAU + k * 0.39; circ(g, x + Math.cos(a) * rr * 0.9, y + Math.sin(a) * rr * 0.9, r * 0.085); g.fill(); } }
    }
    if (snow) { g.fillStyle = "rgba(255,255,255,.92)"; circ(g, x - r * 0.04, y - r * 0.06, r * 0.2); g.fill(); }
  }
  function rock(g, x, y, r, c0, c1) {
    g.fillStyle = "rgba(0,0,0,.2)"; ell(g, x + 2, y + r * 0.5, r * 1.05, r * 0.5); g.fill();
    g.fillStyle = c0; g.beginPath(); g.moveTo(x - r, y + r * 0.4); g.quadraticCurveTo(x - r * 0.9, y - r * 0.7, x - r * 0.1, y - r * 0.8);
    g.quadraticCurveTo(x + r, y - r * 0.7, x + r, y + r * 0.4); g.closePath(); g.fill();
    g.fillStyle = c1; g.beginPath(); g.moveTo(x - r * 0.6, y - r * 0.2); g.quadraticCurveTo(x - r * 0.4, y - r * 0.65, x + r * 0.1, y - r * 0.6); g.quadraticCurveTo(x - r * 0.2, y - r * 0.3, x - r * 0.6, y - r * 0.2); g.fill();
  }
  function crate(g, x, y, s, c) {
    g.fillStyle = "rgba(0,0,0,.22)"; g.fillRect(x - s / 2 + 3, y - s / 2 + 4, s, s);
    g.fillStyle = c || "#b98a4e"; g.fillRect(x - s / 2, y - s / 2, s, s);
    g.strokeStyle = "#7a5527"; g.lineWidth = 2; g.strokeRect(x - s / 2 + 1, y - s / 2 + 1, s - 2, s - 2);
    g.beginPath(); g.moveTo(x - s / 2 + 2, y - s / 2 + 2); g.lineTo(x + s / 2 - 2, y + s / 2 - 2); g.moveTo(x + s / 2 - 2, y - s / 2 + 2); g.lineTo(x - s / 2 + 2, y + s / 2 - 2); g.stroke();
  }
  function barrel(g, x, y, r) {
    g.fillStyle = "rgba(0,0,0,.22)"; ell(g, x + 2, y + 3, r, r); g.fill();
    g.fillStyle = "#a8743c"; circ(g, x, y, r); g.fill();
    g.strokeStyle = "#6e4a22"; g.lineWidth = 2; circ(g, x, y, r - 1); g.stroke(); circ(g, x, y, r * 0.55); g.stroke();
    g.fillStyle = "#c79356"; circ(g, x, y, r * 0.45); g.fill();
  }
  function planks(g, R, x0, y0, x1, y1, ph, vertical, cols, gap) {
    var a, b, i = 0;
    if (!vertical) {
      for (a = y0; a < y1; a += ph, i++) {
        var off = (i % 2) * 40 + R() * 30;
        for (b = x0 - off; b < x1; ) {
          var len = 60 + R() * 70;
          g.fillStyle = cols[(R() * cols.length) | 0];
          g.fillRect(Math.max(x0, b), a, Math.min(x1, b + len) - Math.max(x0, b), Math.min(ph, y1 - a));
          g.fillStyle = gap; g.fillRect(Math.max(x0, b + len - 1), a, 1.2, Math.min(ph, y1 - a));
          b += len;
        }
        g.fillStyle = gap; g.fillRect(x0, a, x1 - x0, 1.2);
      }
    } else {
      for (a = x0; a < x1; a += ph, i++) {
        var off2 = (i % 2) * 50 + R() * 30;
        for (b = y0 - off2; b < y1; ) {
          var len2 = 70 + R() * 80;
          g.fillStyle = cols[(R() * cols.length) | 0];
          g.fillRect(a, Math.max(y0, b), Math.min(ph, x1 - a), Math.min(y1, b + len2) - Math.max(y0, b));
          g.fillStyle = gap; g.fillRect(a, Math.max(y0, b + len2 - 1), Math.min(ph, x1 - a), 1.2);
          b += len2;
        }
        g.fillStyle = gap; g.fillRect(a, y0, 1.2, y1 - y0);
      }
    }
  }
  function waterFill(g, R, x0, y0, x1, y1, c0, c1) {
    var gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, c0); gr.addColorStop(1, c1);
    g.fillStyle = gr; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.strokeStyle = "rgba(255,255,255,.22)"; g.lineWidth = 1.5; g.lineCap = "round";
    var n = Math.max(4, ((x1 - x0) * (y1 - y0) / 900) | 0);
    for (var i = 0; i < n; i++) {
      var x = x0 + R() * (x1 - x0), y = y0 + 4 + R() * Math.max(1, y1 - y0 - 8), w = 6 + R() * 10;
      g.beginPath(); g.moveTo(x - w, y); g.quadraticCurveTo(x, y - 3, x + w, y); g.stroke();
    }
  }
  function clearing(g, pf, color, a) {
    var cx = (pf.x0 + pf.x1) / 2, cy = (pf.y0 + pf.y1) / 2, rx = (pf.x1 - pf.x0) * 0.75, ry = (pf.y1 - pf.y0) * 0.62;
    g.save(); g.translate(cx, cy); g.scale(1, ry / rx);
    var gr = g.createRadialGradient(0, 0, 0, 0, 0, rx); gr.addColorStop(0, rgba(color, a)); gr.addColorStop(0.6, rgba(color, a * 0.6)); gr.addColorStop(1, rgba(color, 0));
    g.fillStyle = gr; g.fillRect(-rx, -rx, rx * 2, rx * 2); g.restore();
  }
  function edgeShade(g, W, H, a) {
    var gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(10,10,30," + a + ")");
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  function bookshelf(g, R, x, y, w, h) {
    g.fillStyle = "#5b3a22"; g.fillRect(x, y, w, h);
    var cols = ["#c0392b", "#2e86c1", "#27ae60", "#d4ac0d", "#8e44ad", "#d35400", "#16a085", "#7f8c8d", "#f0e6d2"];
    var rows = Math.max(1, Math.round(h / 22)), rh = h / rows;
    for (var r = 0; r < rows; r++) {
      var yy = y + r * rh + 3;
      g.fillStyle = "#3d2616"; g.fillRect(x + 3, yy, w - 6, rh - 5);
      for (var bx = x + 4; bx < x + w - 8; ) {
        var bw = 3 + R() * 4, bh = (rh - 7) * (0.7 + R() * 0.3);
        g.fillStyle = cols[(R() * cols.length) | 0];
        if (R() < 0.9) g.fillRect(bx, yy + rh - 5 - bh, bw, bh);
        bx += bw + 0.8;
      }
    }
    g.strokeStyle = "#3a2414"; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }

  var ARENAS = {
    meadow: { base: "#7fc96b", amb: "pollen", paint: function (g, W, H, R, pf) {
      g.fillStyle = vgrad(g, H, "#93d678", "#6dbb5c"); g.fillRect(0, 0, W, H);
      speckle(g, R, 46, 0, 0, W, H, ["#86cf6f", "#77c463", "#9bdb82"], 14, 40, 0.5);
      // chemin de terre
      g.strokeStyle = "rgba(222,196,140,.75)"; g.lineWidth = 46; g.lineCap = "round";
      g.beginPath(); g.moveTo(-30, H * 0.78); g.bezierCurveTo(W * 0.35, H * 0.62, W * 0.55, H * 0.42, W + 30, H * 0.3); g.stroke();
      g.strokeStyle = "rgba(236,214,164,.6)"; g.lineWidth = 30; g.stroke();
      // touffes d'herbe
      g.lineWidth = 1.6;
      for (var i = 0; i < (W * H / 1500); i++) {
        var x = R() * W, y = R() * H; g.strokeStyle = R() < 0.5 ? "#5aa84e" : "#a6e08c";
        g.beginPath(); g.moveTo(x - 3, y); g.lineTo(x - 1, y - 5); g.moveTo(x, y); g.lineTo(x, y - 7); g.moveTo(x + 3, y); g.lineTo(x + 2, y - 5); g.stroke();
      }
      // fleurs
      var fc = ["#ffffff", "#ffe066", "#ff9ecb", "#c9b6ff"];
      for (i = 0; i < (W * H / 6500); i++) {
        var fx = R() * W, fy = R() * H; g.fillStyle = fc[(R() * 4) | 0];
        for (var p = 0; p < 5; p++) { circ(g, fx + Math.cos(p * 1.257) * 2.6, fy + Math.sin(p * 1.257) * 2.6, 1.9); g.fill(); }
        g.fillStyle = "#f5b301"; circ(g, fx, fy, 1.5); g.fill();
      }
      // buissons en bordure
      for (i = 0; i < 9; i++) canopy(g, R, i / 8 * W + (R() - 0.5) * 20, pf.y0 - 34 - R() * 16, 20 + R() * 12, "#4f9a47", "#5fae54", "#74c267");
      for (i = 0; i < 6; i++) { canopy(g, R, -6 + R() * 8, pf.y0 + R() * (pf.y1 - pf.y0), 16 + R() * 8, "#4f9a47", "#5fae54", "#74c267"); canopy(g, R, W + 6 - R() * 8, pf.y0 + R() * (pf.y1 - pf.y0), 16 + R() * 8, "#4f9a47", "#5fae54", "#74c267"); }
      for (i = 0; i < 7; i++) canopy(g, R, R() * W, pf.y1 + 50 + R() * (H - pf.y1 - 40), 18 + R() * 14, "#4f9a47", "#5fae54", "#74c267");
      rock(g, W * 0.12, pf.y1 + 30, 12, "#9aa0a6", "#c3c8cc"); rock(g, W * 0.86, pf.y0 - 8, 10, "#9aa0a6", "#c3c8cc");
      // clôture
      g.strokeStyle = "#a9793f"; g.lineWidth = 3; g.beginPath(); g.moveTo(0, pf.y0 - 12); g.lineTo(W * 0.3, pf.y0 - 12); g.moveTo(0, pf.y0 - 18); g.lineTo(W * 0.3, pf.y0 - 18); g.stroke();
      g.fillStyle = "#8a5f2c"; for (i = 0; i < 5; i++) g.fillRect(4 + i * W * 0.07, pf.y0 - 24, 4, 16);
      clearing(g, pf, "#d8ffb8", 0.2);
    } },

    village: { base: "#cdbb9b", amb: "leaves", paint: function (g, W, H, R, pf) {
      g.fillStyle = "#b9a684"; g.fillRect(0, 0, W, H);
      // pavés
      var cols = ["#d6c5a3", "#cdbb97", "#dccdae", "#c6b38d", "#d2c09c"], sz = 26, row = 0;
      for (var y = -4; y < H; y += sz * 0.8, row++) for (var x = -sz + (row % 2) * sz * 0.5; x < W; x += sz) {
        g.fillStyle = cols[(R() * cols.length) | 0]; rrect(g, x + 1.5, y + 1.5, sz - 3 + R() * 1.5, sz * 0.8 - 3, 5); g.fill();
      }
      // bandes d'herbe sur les côtés
      g.fillStyle = "#7cc46a"; g.fillRect(0, 0, 9, H); g.fillRect(W - 9, 0, 9, H);
      speckle(g, R, (H / 5) | 0, 0, 0, 12, H, ["#6ab45a", "#8fd47c"], 3, 6); speckle(g, R, (H / 5) | 0, W - 12, 0, W, H, ["#6ab45a", "#8fd47c"], 3, 6);
      // maisons en haut (toits vus de dessus)
      var n = Math.max(3, Math.round(W / 130)), hw = W / n, roofs = ["#c9553f", "#d98845", "#b5493a", "#c7703c"];
      for (var i = 0; i < n; i++) {
        var hx = i * hw + 4, hy = pf.y0 - 78 - (i % 2) * 8, hh = 52;
        g.fillStyle = "rgba(0,0,0,.2)"; g.fillRect(hx + 4, hy + 6, hw - 8, hh + 10);
        g.fillStyle = "#f1e4c6"; g.fillRect(hx, hy + hh - 6, hw - 8, 18);
        g.fillStyle = "#7a5230"; g.fillRect(hx + hw * 0.42, hy + hh, 12, 12);
        g.fillStyle = "#8fc7e8"; g.fillRect(hx + 8, hy + hh, 10, 8); g.fillRect(hx + hw - 28, hy + hh, 10, 8);
        g.fillStyle = roofs[i % roofs.length]; g.fillRect(hx - 2, hy, hw - 4, hh);
        g.fillStyle = "rgba(0,0,0,.14)"; for (var ty = hy + 7; ty < hy + hh; ty += 8) g.fillRect(hx - 2, ty, hw - 4, 1.5);
        g.fillStyle = "rgba(255,255,255,.2)"; g.fillRect(hx - 2, hy + hh / 2 - 2, hw - 4, 3);
        g.fillStyle = "#8d8d8d"; g.fillRect(hx + hw * 0.68, hy + 8, 9, 9);
      }
      // pancarte du village (à moitié effacée)
      var sx = W * 0.8, sy = pf.y0 - 8;
      g.fillStyle = "#8a5f2c"; g.fillRect(sx - 2, sy - 6, 4, 16);
      g.fillStyle = "#e7c98b"; rrect(g, sx - 22, sy - 22, 44, 18, 3); g.fill(); g.strokeStyle = "#8a5f2c"; g.lineWidth = 2; g.stroke();
      g.strokeStyle = "rgba(90,60,30,.55)"; g.lineWidth = 2; g.beginPath(); g.moveTo(sx - 16, sy - 13); g.lineTo(sx - 8, sy - 13); g.moveTo(sx + 2, sy - 13); g.lineTo(sx + 6, sy - 13); g.stroke();
      // puits et tonneaux en bas
      var wy = Math.min(H - 40, pf.y1 + 70);
      g.fillStyle = "rgba(0,0,0,.2)"; circ(g, W * 0.2 + 3, wy + 4, 24); g.fill();
      g.fillStyle = "#9c9c9c"; circ(g, W * 0.2, wy, 24); g.fill(); g.fillStyle = "#3d6f8f"; circ(g, W * 0.2, wy, 15); g.fill();
      g.strokeStyle = "#7d7d7d"; g.lineWidth = 2; circ(g, W * 0.2, wy, 24); g.stroke();
      barrel(g, W * 0.06, pf.y1 + 26, 11); barrel(g, W * 0.94, pf.y0 + 4, 10); crate(g, W * 0.93, pf.y1 + 30, 20);
      clearing(g, pf, "#fff6dc", 0.16);
    } },

    interior: { base: "#b88a5a", amb: "dust", paint: function (g, W, H, R, pf) {
      planks(g, R, 0, 0, W, H, 22, false, ["#c2935f", "#b88a57", "#c99b68", "#b08150"], "rgba(80,50,20,.45)");
      // tapis
      var rw = Math.min(W * 0.72, 420), rh = Math.min((pf.y1 - pf.y0) * 0.62, 360), rx = W / 2 - rw / 2, ry = (pf.y0 + pf.y1) / 2 - rh / 2;
      g.fillStyle = "#c98f7a"; rrect(g, rx, ry, rw, rh, 12); g.fill();
      g.strokeStyle = "#e9cf9a"; g.lineWidth = 5; rrect(g, rx + 8, ry + 8, rw - 16, rh - 16, 8); g.stroke();
      g.strokeStyle = "rgba(150,80,70,.6)"; g.lineWidth = 2; rrect(g, rx + 18, ry + 18, rw - 36, rh - 36, 6); g.stroke();
      g.fillStyle = "rgba(233,207,154,.55)"; g.save(); g.translate(W / 2, (pf.y0 + pf.y1) / 2); g.rotate(PI / 4); g.fillRect(-18, -18, 36, 36); g.restore();
      // mur du fond
      var wy = pf.y0 - 20;
      g.fillStyle = "#6e4a2f"; g.fillRect(0, 0, W, wy);
      g.fillStyle = "#8a6244"; g.fillRect(0, wy - 14, W, 14); g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(0, wy, W, 6);
      // fenêtre + lumière
      var wx = W * 0.5;
      g.fillStyle = "#ffe9a8"; rrect(g, wx - 26, wy - 52, 52, 32, 4); g.fill(); g.strokeStyle = "#4b2f1c"; g.lineWidth = 3; g.stroke();
      g.beginPath(); g.moveTo(wx, wy - 52); g.lineTo(wx, wy - 20); g.stroke();
      g.fillStyle = "rgba(255,240,190,.13)"; g.beginPath(); g.moveTo(wx - 26, wy); g.lineTo(wx + 26, wy); g.lineTo(wx + 90, wy + 240); g.lineTo(wx - 90, wy + 240); g.closePath(); g.fill();
      bookshelf(g, R, W * 0.06, wy - 58, W * 0.24, 44); bookshelf(g, R, W * 0.7, wy - 58, W * 0.24, 44);
      barrel(g, 14, pf.y0 + 6, 12); crate(g, W - 16, pf.y0 + 8, 22); crate(g, 16, pf.y1 + 34, 24); barrel(g, W - 18, pf.y1 + 30, 13); barrel(g, W - 46, pf.y1 + 44, 11);
      clearing(g, pf, "#fff1cf", 0.14);
    } },

    forest: { base: "#5f9d50", amb: "leaves", paint: function (g, W, H, R, pf) {
      g.fillStyle = vgrad(g, H, "#6aa858", "#558f49"); g.fillRect(0, 0, W, H);
      speckle(g, R, 60, 0, 0, W, H, ["#62a152", "#74b562", "#4f8a45"], 12, 36, 0.55);
      speckle(g, R, (W * H / 1400) | 0, 0, 0, W, H, ["#c58b3a", "#d9a441", "#a8672c", "#e2c15a"], 1.5, 3.5, 0.75);
      // taches de soleil
      for (var i = 0; i < 9; i++) { g.fillStyle = "rgba(255,246,170,.13)"; ell(g, R() * W, R() * H, 24 + R() * 30, 16 + R() * 20); g.fill(); }
      // champignons
      for (i = 0; i < 8; i++) {
        var mx = R() < 0.5 ? 10 + R() * 22 : W - 10 - R() * 22, my = pf.y0 + R() * (pf.y1 - pf.y0 + 100);
        g.fillStyle = "#f4ead8"; g.fillRect(mx - 1.5, my, 3, 5); g.fillStyle = "#e0523f"; g.beginPath(); g.arc(mx, my, 5.5, PI, 0); g.fill(); g.fillStyle = "#fff"; circ(g, mx - 2, my - 2.5, 1); g.fill(); circ(g, mx + 2, my - 3, 0.9); g.fill();
      }
      var c0 = "#2f6b3a", c1 = "#3b7f45", c2 = "#4c9655";
      for (i = 0; i < Math.ceil(W / 46) + 1; i++) canopy(g, R, i * 46 + (R() - 0.5) * 16, pf.y0 - 44 - R() * 26, 30 + R() * 14, c0, c1, c2);
      for (i = 0; i < Math.ceil((pf.y1 - pf.y0) / 70) + 1; i++) { canopy(g, R, -14 + R() * 8, pf.y0 + i * 70 + R() * 20, 26 + R() * 10, c0, c1, c2); canopy(g, R, W + 14 - R() * 8, pf.y0 + 20 + i * 70 + R() * 20, 26 + R() * 10, c0, c1, c2); }
      for (i = 0; i < Math.ceil(W / 60) + 1; i++) canopy(g, R, i * 60 + (R() - 0.5) * 20, pf.y1 + 64 + R() * (H - pf.y1 - 50), 30 + R() * 16, c0, c1, c2);
      clearing(g, pf, "#e9ffb5", 0.22);
    } },

    night_forest: { base: "#25434f", dark: true, amb: "fireflies", paint: function (g, W, H, R, pf) {
      g.fillStyle = vgrad(g, H, "#2c4f5c", "#22404b"); g.fillRect(0, 0, W, H);
      speckle(g, R, 60, 0, 0, W, H, ["#2a4a56", "#31566a", "#24414d"], 12, 36, 0.6);
      speckle(g, R, (W * H / 2200) | 0, 0, 0, W, H, ["#3d6a72", "#4a7a80"], 1.2, 3, 0.7);
      clearing(g, pf, "#9fd4e0", 0.3);
      // champignons lumineux
      for (var i = 0; i < 10; i++) {
        var mx = R() < 0.5 ? 8 + R() * 26 : W - 8 - R() * 26, my = pf.y0 + R() * (pf.y1 - pf.y0 + 120);
        glow(g, "#6ff2e0", mx, my - 2, 16, 0.5);
        g.fillStyle = "#d8fff7"; g.fillRect(mx - 1.2, my, 2.4, 4); g.fillStyle = "#59e6d0"; g.beginPath(); g.arc(mx, my, 4.5, PI, 0); g.fill();
      }
      var c0 = "#12262e", c1 = "#18323b", c2 = "#1f3f49";
      for (i = 0; i < Math.ceil(W / 46) + 1; i++) canopy(g, R, i * 46 + (R() - 0.5) * 16, pf.y0 - 44 - R() * 26, 30 + R() * 14, c0, c1, c2);
      for (i = 0; i < Math.ceil((pf.y1 - pf.y0) / 70) + 1; i++) { canopy(g, R, -14 + R() * 8, pf.y0 + i * 70 + R() * 20, 26 + R() * 10, c0, c1, c2); canopy(g, R, W + 14 - R() * 8, pf.y0 + 20 + i * 70 + R() * 20, 26 + R() * 10, c0, c1, c2); }
      for (i = 0; i < Math.ceil(W / 60) + 1; i++) canopy(g, R, i * 60 + (R() - 0.5) * 20, pf.y1 + 64 + R() * (H - pf.y1 - 50), 30 + R() * 16, c0, c1, c2);
      // rayon de lune
      g.fillStyle = "rgba(210,235,255,.07)"; g.beginPath(); g.moveTo(W * 0.55, 0); g.lineTo(W * 0.8, 0); g.lineTo(W * 0.62, H); g.lineTo(W * 0.2, H); g.closePath(); g.fill();
    } },

    harbor: { base: "#b9966b", amb: "sea", paint: function (g, W, H, R, pf, info) {
      planks(g, R, 0, 0, W, H, 20, false, ["#c2a077", "#b9966b", "#cbab83", "#b08d62"], "rgba(60,40,20,.5)");
      // eau en haut + quai de pierre
      var wy = pf.y0 - 34;
      waterFill(g, R, 0, 0, W, wy, "#2f86b8", "#49a6d4");
      for (var i = 0; i < 14; i++) info.sea.push(R() * W, 8 + R() * Math.max(4, wy - 16));
      g.fillStyle = "#9a9da3"; g.fillRect(0, wy, W, 16);
      g.fillStyle = "rgba(0,0,0,.18)"; for (i = 0; i < W; i += 34) g.fillRect(i, wy, 1.5, 16);
      g.fillStyle = "rgba(255,255,255,.25)"; g.fillRect(0, wy, W, 2); g.fillStyle = "rgba(0,0,0,.22)"; g.fillRect(0, wy + 16, W, 4);
      for (i = 0; i < 4; i++) { var bx = W * (0.12 + i * 0.25); g.fillStyle = "#3c3f46"; circ(g, bx, wy + 8, 6); g.fill(); g.fillStyle = "#5b606b"; circ(g, bx - 1, wy + 6, 3); g.fill(); }
      // bateau amarré (coque)
      g.fillStyle = "#7a4a2a"; g.beginPath(); g.moveTo(W * 0.56, wy - 6); g.quadraticCurveTo(W * 0.74, wy - 46, W * 0.96, wy - 12); g.lineTo(W * 0.96, wy - 6); g.closePath(); g.fill();
      g.fillStyle = "#e9dcc0"; g.fillRect(W * 0.6, wy - 9, W * 0.34, 3);
      // cordes, caisses, filet
      g.strokeStyle = "#d8c08a"; g.lineWidth = 3; for (i = 0; i < 3; i++) { circ(g, W * 0.1, pf.y1 + 40, 6 + i * 4); g.stroke(); }
      crate(g, 15, pf.y0 + 6, 22); crate(g, 38, pf.y0 - 2, 18, "#a87b45"); barrel(g, W - 16, pf.y0 + 4, 12); crate(g, W - 18, pf.y1 + 30, 24); crate(g, W - 44, pf.y1 + 46, 20, "#a87b45"); barrel(g, W * 0.3, pf.y1 + 60, 13);
      g.strokeStyle = "rgba(240,235,220,.5)"; g.lineWidth = 1; for (i = 0; i < 8; i++) { g.beginPath(); g.moveTo(W * 0.5 + i * 8, pf.y1 + 30); g.lineTo(W * 0.5 + i * 8 - 30, pf.y1 + 90); g.moveTo(W * 0.5 - 30 + i * 8, pf.y1 + 30); g.lineTo(W * 0.5 + i * 8, pf.y1 + 90); g.stroke(); }
      clearing(g, pf, "#fff3d6", 0.14);
    } },

    ship: { base: "#2f7fb5", amb: "sea", paint: function (g, W, H, R, pf, info) {
      waterFill(g, R, 0, 0, W, H, "#2a78ad", "#3c93c6");
      var x0 = 9, x1 = W - 9, bowY = pf.y0 - 26, tip = Math.max(6, bowY - 74), sternY = Math.min(H + 20, pf.y1 + 150);
      function hull() { g.beginPath(); g.moveTo(x0, sternY); g.lineTo(x0, bowY); g.quadraticCurveTo(x0 + 6, tip + 20, W / 2, tip); g.quadraticCurveTo(x1 - 6, tip + 20, x1, bowY); g.lineTo(x1, sternY); g.closePath(); }
      g.fillStyle = "rgba(0,20,40,.25)"; g.save(); g.translate(0, 5); hull(); g.fill(); g.restore();
      g.save(); hull(); g.clip();
      planks(g, R, x0, tip, x1, Math.min(H, sternY), 18, true, ["#c79a63", "#bd8f58", "#d0a56e", "#b58652"], "rgba(70,45,20,.5)");
      g.restore();
      g.strokeStyle = "#6e4623"; g.lineWidth = 7; hull(); g.stroke(); g.strokeStyle = "#9a6a3a"; g.lineWidth = 3; hull(); g.stroke();
      g.fillStyle = "#5a3a1e"; for (var y = bowY; y < Math.min(H, sternY); y += 46) { circ(g, x0, y, 3.5); g.fill(); circ(g, x1, y, 3.5); g.fill(); }
      // mât, écoutille, cordages
      var my = pf.y0 - 6;
      g.fillStyle = "rgba(0,0,0,.22)"; circ(g, W / 2 + 3, my + 4, 14); g.fill(); g.fillStyle = "#8a5a2c"; circ(g, W / 2, my, 14); g.fill(); g.fillStyle = "#a9753f"; circ(g, W / 2, my, 9); g.fill();
      g.strokeStyle = "rgba(60,40,20,.5)"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(W / 2, my); g.lineTo(x0 + 4, my + 60); g.moveTo(W / 2, my); g.lineTo(x1 - 4, my + 60); g.stroke();
      var hx = W / 2, hy = (pf.y0 + pf.y1) / 2;
      g.fillStyle = "#8f6436"; g.fillRect(hx - 34, hy - 34, 68, 68); g.strokeStyle = "#5e3d1c"; g.lineWidth = 3; g.strokeRect(hx - 34, hy - 34, 68, 68);
      g.lineWidth = 2; for (var i = 1; i < 5; i++) { g.beginPath(); g.moveTo(hx - 34 + i * 13.6, hy - 34); g.lineTo(hx - 34 + i * 13.6, hy + 34); g.moveTo(hx - 34, hy - 34 + i * 13.6); g.lineTo(hx + 34, hy - 34 + i * 13.6); g.stroke(); }
      barrel(g, x0 + 16, pf.y0 + 8, 11); barrel(g, x1 - 16, pf.y1 + 34, 12); crate(g, x0 + 18, pf.y1 + 40, 22); crate(g, x1 - 18, pf.y0 + 6, 18);
      for (i = 0; i < 22; i++) { var sx = R() * W, sy = R() * (bowY - 4); var k = (sy - tip) / Math.max(1, bowY - tip), half = k <= 0 ? 0 : (W / 2 - x0) * Math.sqrt(Math.min(1, k)); if (Math.abs(sx - W / 2) > half + 8) info.sea.push(sx, sy); }
      clearing(g, pf, "#fff1cf", 0.12);
    } },

    beach: { base: "#efd9a0", amb: "sea", paint: function (g, W, H, R, pf, info) {
      g.fillStyle = vgrad(g, H, "#f3dfa8", "#e6c888"); g.fillRect(0, 0, W, H);
      speckle(g, R, 50, 0, 0, W, H, ["#f6e5b4", "#ead092", "#f0d99c"], 14, 40, 0.5);
      speckle(g, R, (W * H / 700) | 0, 0, 0, W, H, ["#d9bb78", "#fff3cf", "#cfae6a"], 0.6, 1.4, 0.8);
      g.strokeStyle = "rgba(255,246,214,.6)"; g.lineWidth = 1.5;
      for (var i = 0; i < H / 26; i++) { var y = i * 26 + R() * 10; g.beginPath(); g.moveTo(-10, y); for (var x = 0; x <= W + 20; x += 40) g.quadraticCurveTo(x + 20, y + (R() - 0.5) * 12, x + 40, y + (R() - 0.5) * 4); g.stroke(); }
      var sy = pf.y0 - 30;
      g.fillStyle = "rgba(196,160,96,.5)"; g.fillRect(0, 0, W, sy + 22);
      waterFill(g, R, 0, 0, W, sy, "#3aa0cf", "#6cc7e6");
      g.fillStyle = "#6cc7e6"; g.beginPath(); g.moveTo(0, sy - 2); for (x = 0; x <= W; x += 30) g.quadraticCurveTo(x + 15, sy + 10, x + 30, sy - 1); g.lineTo(W, 0); g.lineTo(0, 0); g.fill();
      info.foamY = sy + 4;
      for (i = 0; i < 12; i++) info.sea.push(R() * W, 6 + R() * Math.max(4, sy - 14));
      // coquillages, étoile de mer, galets, bois flotté
      for (i = 0; i < 12; i++) { var cx = R() * W, cy = pf.y0 + R() * (H - pf.y0); if (cx > 36 && cx < W - 36 && cy < pf.y1) cx = R() < 0.5 ? R() * 30 : W - R() * 30; g.fillStyle = ["#fff", "#ffd3c4", "#f6e9ff"][i % 3]; g.beginPath(); g.arc(cx, cy, 4, PI, 0); g.fill(); g.strokeStyle = "rgba(180,120,100,.6)"; g.lineWidth = 0.8; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx - 2.5, cy - 3); g.moveTo(cx, cy); g.lineTo(cx, cy - 4); g.moveTo(cx, cy); g.lineTo(cx + 2.5, cy - 3); g.stroke(); }
      var stx = 18, sty = pf.y1 + 30; g.fillStyle = "#ff8a5c"; g.beginPath(); for (i = 0; i < 10; i++) { var a = i / 10 * TAU - PI / 2, d = i % 2 ? 4 : 10; g.lineTo(stx + Math.cos(a) * d, sty + Math.sin(a) * d); } g.fill();
      rock(g, W - 16, pf.y0 + 10, 11, "#b7a58a", "#d6c7ad"); rock(g, 12, pf.y0 + 60, 8, "#b7a58a", "#d6c7ad");
      g.strokeStyle = "#a07a4c"; g.lineWidth = 6; g.lineCap = "round"; g.beginPath(); g.moveTo(W * 0.6, pf.y1 + 52); g.lineTo(W * 0.86, pf.y1 + 40); g.stroke();
      // ombres de palmes
      g.fillStyle = "rgba(60,110,70,.3)";
      for (var s = 0; s < 2; s++) { var px = s ? W + 6 : -6, py = pf.y1 + 20; for (i = 0; i < 6; i++) { var pa = (s ? PI : 0) + (i - 2.5) * 0.4 - 0.5; g.save(); g.translate(px, py); g.rotate(pa); ell(g, 44, 0, 44, 8); g.fill(); g.restore(); } }
      clearing(g, pf, "#fffbe6", 0.18);
    } },

    snow: { base: "#e3eff9", amb: "snow", paint: function (g, W, H, R, pf) {
      g.fillStyle = vgrad(g, H, "#edf6fd", "#d6e6f3"); g.fillRect(0, 0, W, H);
      for (var i = 0; i < 26; i++) { var x = R() * W, y = R() * H, rx = 26 + R() * 40; g.fillStyle = "rgba(160,190,220,.22)"; ell(g, x + 3, y + 5, rx, rx * 0.4); g.fill(); g.fillStyle = "rgba(255,255,255,.85)"; ell(g, x, y, rx, rx * 0.38); g.fill(); }
      // plaques de glace
      for (i = 0; i < 4; i++) { var ix = pf.x0 + R() * (pf.x1 - pf.x0), iy = pf.y0 + R() * (pf.y1 - pf.y0), ir = 26 + R() * 26; g.fillStyle = "rgba(170,222,245,.55)"; g.beginPath(); for (var k = 0; k < 7; k++) { var a = k / 7 * TAU, d = ir * (0.7 + R() * 0.4); g.lineTo(ix + Math.cos(a) * d, iy + Math.sin(a) * d * 0.6); } g.closePath(); g.fill(); g.strokeStyle = "rgba(255,255,255,.8)"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(ix - ir * 0.4, iy - 3); g.lineTo(ix + ir * 0.1, iy - 6); g.moveTo(ix - ir * 0.1, iy + 4); g.lineTo(ix + ir * 0.4, iy + 1); g.stroke(); }
      // traces de pas
      g.fillStyle = "rgba(150,180,210,.4)"; for (i = 0; i < 14; i++) { ell(g, W * 0.2 + i * 12, H * 0.7 - i * 9 + (i % 2) * 6, 3, 2); g.fill(); }
      for (i = 0; i < Math.ceil(W / 50) + 1; i++) pine(g, i * 50 + (R() - 0.5) * 18, pf.y0 - 40 - R() * 26, 24 + R() * 10, true);
      for (i = 0; i < Math.ceil((pf.y1 - pf.y0) / 90) + 1; i++) { pine(g, -6 + R() * 8, pf.y0 + i * 90 + R() * 30, 20 + R() * 8, true); pine(g, W + 6 - R() * 8, pf.y0 + 40 + i * 90 + R() * 30, 20 + R() * 8, true); }
      for (i = 0; i < Math.ceil(W / 70) + 1; i++) pine(g, i * 70 + (R() - 0.5) * 30, pf.y1 + 60 + R() * (H - pf.y1 - 50), 24 + R() * 12, true);
      rock(g, W * 0.9, pf.y1 + 24, 12, "#8f9bab", "#ffffff"); rock(g, W * 0.08, pf.y0 + 4, 10, "#8f9bab", "#ffffff");
    } },

    cave: { base: "#4d475c", dark: true, amb: "dust", paint: function (g, W, H, R, pf) {
      g.fillStyle = vgrad(g, H, "#554f66", "#454052"); g.fillRect(0, 0, W, H);
      for (var i = 0; i < 46; i++) { var x = R() * W, y = R() * H, r = 18 + R() * 34; g.fillStyle = i % 2 ? "rgba(110,102,128,.35)" : "rgba(50,45,62,.3)"; g.beginPath(); for (var k = 0; k < 7; k++) { var a = k / 7 * TAU, d = r * (0.6 + R() * 0.5); g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7); } g.closePath(); g.fill(); }
      g.strokeStyle = "rgba(30,26,40,.45)"; g.lineWidth = 1.5; for (i = 0; i < 12; i++) { var cx = R() * W, cy = R() * H; g.beginPath(); g.moveTo(cx, cy); for (k = 0; k < 4; k++) { cx += (R() - 0.5) * 30; cy += R() * 16; g.lineTo(cx, cy); } g.stroke(); }
      clearing(g, pf, "#c9c0e8", 0.24);
      // flaques
      for (i = 0; i < 3; i++) { g.fillStyle = "rgba(120,170,210,.25)"; ell(g, pf.x0 + R() * (pf.x1 - pf.x0), pf.y0 + R() * (pf.y1 - pf.y0), 20 + R() * 14, 9 + R() * 5); g.fill(); }
      // stalagmites et cristaux en bordure
      function stal(x, y, r) { g.fillStyle = "rgba(0,0,0,.3)"; ell(g, x + 3, y + 3, r, r * 0.8); g.fill(); g.fillStyle = "#6c6580"; circ(g, x, y, r); g.fill(); g.fillStyle = "#857e9a"; circ(g, x - r * 0.2, y - r * 0.2, r * 0.6); g.fill(); g.fillStyle = "#a59fba"; circ(g, x - r * 0.3, y - r * 0.3, r * 0.25); g.fill(); }
      function crystal(x, y, s, c) { glow(g, c, x, y, s * 3, 0.55); g.fillStyle = c; g.beginPath(); g.moveTo(x, y - s * 1.5); g.lineTo(x + s * 0.7, y); g.lineTo(x, y + s * 0.7); g.lineTo(x - s * 0.7, y); g.closePath(); g.fill(); g.fillStyle = "rgba(255,255,255,.7)"; g.beginPath(); g.moveTo(x, y - s * 1.5); g.lineTo(x + s * 0.25, y - s * 0.2); g.lineTo(x - s * 0.3, y - s * 0.1); g.closePath(); g.fill(); }
      for (i = 0; i < Math.ceil(W / 40) + 1; i++) stal(i * 40 + (R() - 0.5) * 16, pf.y0 - 30 - R() * 30, 14 + R() * 12);
      for (i = 0; i < Math.ceil((pf.y1 - pf.y0) / 60) + 1; i++) { stal(-2 + R() * 8, pf.y0 + i * 60 + R() * 20, 10 + R() * 8); stal(W + 2 - R() * 8, pf.y0 + 30 + i * 60 + R() * 20, 10 + R() * 8); }
      for (i = 0; i < Math.ceil(W / 50) + 1; i++) stal(i * 50 + (R() - 0.5) * 20, pf.y1 + 50 + R() * (H - pf.y1 - 40), 14 + R() * 14);
      var cc = ["#7fe3ff", "#c79bff", "#8dffcf"];
      for (i = 0; i < 9; i++) crystal(R() < 0.5 ? 8 + R() * 14 : W - 8 - R() * 14, pf.y0 - 10 + R() * (pf.y1 - pf.y0 + 100), 5 + R() * 4, cc[i % 3]);
      crystal(W * 0.3, pf.y0 - 16, 7, cc[0]); crystal(W * 0.72, pf.y0 - 20, 8, cc[1]);
    } },

    gray_city: { base: "#a5a7af", amb: "ash", paint: function (g, W, H, R, pf) {
      g.fillStyle = "#8d9099"; g.fillRect(0, 0, W, H);
      var cols = ["#b3b5bd", "#aaacb4", "#bbbdc4", "#a2a4ad"], bw = 44, bh = 22, row = 0;
      for (var y = 0; y < H; y += bh, row++) for (var x = -bw + (row % 2) * bw / 2; x < W; x += bw) { g.fillStyle = cols[(R() * cols.length) | 0]; g.fillRect(x + 1, y + 1, bw - 2, bh - 2); }
      // caniveau
      g.fillStyle = "rgba(60,62,72,.35)"; g.fillRect(0, pf.y1 + 14, W, 5);
      // immeubles gris
      var n = Math.max(3, Math.round(W / 120)), hw = W / n, wy = pf.y0 - 20;
      for (var i = 0; i < n; i++) {
        var hx = i * hw, hh = 62 + (i % 2) * 10;
        g.fillStyle = ["#70737d", "#7b7e88", "#676a74"][i % 3]; g.fillRect(hx, wy - hh, hw - 3, hh);
        g.fillStyle = "#4a4d57"; for (var wx = hx + 10; wx < hx + hw - 18; wx += 22) { g.fillRect(wx, wy - hh + 12, 11, 14); g.fillRect(wx, wy - hh + 34, 11, 14); }
        g.fillStyle = "#3b3d46"; g.fillRect(hx + hw * 0.4, wy - 18, 14, 18);
        g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(hx, wy, hw - 3, 5);
      }
      // enseignes effacées
      function sign(x, y) { g.fillStyle = "#d9dade"; rrect(g, x - 24, y - 9, 48, 18, 3); g.fill(); g.strokeStyle = "#6a6c75"; g.lineWidth = 1.5; g.stroke(); g.strokeStyle = "rgba(120,122,132,.45)"; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 16, y); g.lineTo(x - 9, y); g.moveTo(x + 4, y); g.lineTo(x + 8, y); g.stroke(); }
      sign(W * 0.25, wy - 30); sign(W * 0.75, wy - 30);
      // affiche « silence » : bouche barrée
      var px = W * 0.5, py = wy - 34; g.fillStyle = "#e6e6ea"; g.fillRect(px - 12, py - 14, 24, 28); g.strokeStyle = "#5a5c66"; g.lineWidth = 2; circ(g, px, py, 8); g.stroke(); g.beginPath(); g.moveTo(px - 6, py + 6); g.lineTo(px + 6, py - 6); g.stroke();
      // lampadaires
      for (i = 0; i < 2; i++) { var lx = i ? W - 14 : 14, ly = pf.y0 + 10; glow(g, "#fff6d0", lx, ly, 46, 0.35); g.fillStyle = "#3c3e48"; circ(g, lx, ly, 6); g.fill(); g.fillStyle = "#f4efd8"; circ(g, lx, ly, 3); g.fill(); }
      crate(g, W - 18, pf.y1 + 40, 22, "#8b8d95"); barrel(g, 16, pf.y1 + 44, 12);
      clearing(g, pf, "#ffffff", 0.14);
    } },

    library: { base: "#d2c09a", amb: "letters", paint: function (g, W, H, R, pf) {
      g.fillStyle = "#cdb98f"; g.fillRect(0, 0, W, H);
      // parquet en losanges
      var s = 30, row = 0;
      for (var y = -s; y < H + s; y += s / 2, row++) for (var x = -s + (row % 2) * s / 2; x < W + s; x += s) {
        g.fillStyle = (row % 2) ? (R() < 0.5 ? "#dccaa2" : "#d6c399") : (R() < 0.5 ? "#c8b185" : "#cfb98e");
        g.beginPath(); g.moveTo(x, y - s / 2 + 1); g.lineTo(x + s / 2 - 1, y); g.lineTo(x, y + s / 2 - 1); g.lineTo(x - s / 2 + 1, y); g.closePath(); g.fill();
      }
      // tapis rond à motif d'étoile
      var cx = W / 2, cy = (pf.y0 + pf.y1) / 2, cr = Math.min(W * 0.36, (pf.y1 - pf.y0) * 0.36);
      g.fillStyle = "#a9c3d9"; circ(g, cx, cy, cr); g.fill(); g.strokeStyle = "#e8d49a"; g.lineWidth = 5; circ(g, cx, cy, cr - 6); g.stroke(); g.strokeStyle = "rgba(90,120,160,.55)"; g.lineWidth = 2; circ(g, cx, cy, cr - 14); g.stroke();
      g.fillStyle = "rgba(232,212,154,.75)"; g.beginPath(); for (var i = 0; i < 16; i++) { var a = i / 16 * TAU - PI / 2, d = i % 2 ? cr * 0.2 : cr * 0.55; g.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d); } g.closePath(); g.fill();
      // rayonnages
      var wy = pf.y0 - 18;
      g.fillStyle = "#4a2f1c"; g.fillRect(0, 0, W, wy - 66);
      bookshelf(g, R, 0, wy - 70, W, 70); g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(0, wy, W, 6);
      // piles de livres, pupitre, pages
      function stack(x, y) { var c = ["#c0392b", "#2e86c1", "#27ae60", "#d4ac0d"]; for (var k = 0; k < 3; k++) { g.fillStyle = "rgba(0,0,0,.2)"; g.fillRect(x - 11 + k * 2, y - k * 5 + 2, 24, 7); g.fillStyle = c[(k + ((x | 0) % 4)) % 4]; g.fillRect(x - 12 + k * 2, y - k * 5, 24, 6); g.fillStyle = "#f5eeda"; g.fillRect(x - 10 + k * 2, y - k * 5 + 1.5, 20, 1.5); } }
      stack(16, pf.y0 + 12); stack(W - 20, pf.y0 + 30); stack(20, pf.y1 + 40); stack(W - 24, pf.y1 + 34); stack(W * 0.4, pf.y1 + 70);
      g.fillStyle = "#f7f0dc"; for (i = 0; i < 7; i++) { g.save(); g.translate(R() < 0.5 ? 10 + R() * 20 : W - 10 - R() * 20, pf.y0 + R() * (pf.y1 - pf.y0 + 80)); g.rotate(R() * TAU); g.fillRect(-5, -7, 10, 14); g.restore(); }
      clearing(g, pf, "#fff8e0", 0.16);
    } },

    throne: { base: "#5d4f80", dark: true, amb: "embers", paint: function (g, W, H, R, pf) {
      g.fillStyle = "#4b3f6b"; g.fillRect(0, 0, W, H);
      var s = 40, row = 0;
      for (var y = 0; y < H; y += s, row++) for (var x = (row % 2) * 0; x < W; x += s) {
        g.fillStyle = ((x / s + row) % 2) ? (R() < 0.5 ? "#62548a" : "#5d4f84") : (R() < 0.5 ? "#6d5f96" : "#685a90");
        g.fillRect(x + 0.6, y + 0.6, s - 1.2, s - 1.2);
        if (R() < 0.3) { g.strokeStyle = "rgba(220,205,255,.14)"; g.lineWidth = 1; g.beginPath(); g.moveTo(x + R() * s, y + 2); g.lineTo(x + R() * s, y + s - 2); g.stroke(); }
      }
      // tapis
      var cw = Math.min(150, W * 0.38);
      g.fillStyle = "#8a4a86"; g.fillRect(W / 2 - cw / 2, 0, cw, H); g.fillStyle = "#e3c56e"; g.fillRect(W / 2 - cw / 2 + 5, 0, 3, H); g.fillRect(W / 2 + cw / 2 - 8, 0, 3, H);
      g.fillStyle = "rgba(60,20,70,.25)"; for (y = 10; y < H; y += 50) { g.save(); g.translate(W / 2, y); g.rotate(PI / 4); g.fillRect(-9, -9, 18, 18); g.restore(); }
      clearing(g, pf, "#e7dcff", 0.26);
      // estrade + trône
      var ty = pf.y0 - 26;
      g.fillStyle = "#3b3058"; g.fillRect(0, 0, W, ty - 40); g.fillStyle = "#7767a3"; g.fillRect(W / 2 - 86, ty - 44, 172, 44); g.fillStyle = "#8a7ab8"; g.fillRect(W / 2 - 86, ty - 44, 172, 5); g.fillStyle = "rgba(0,0,0,.3)"; g.fillRect(W / 2 - 86, ty, 172, 5);
      g.fillStyle = "#2a1f3d"; rrect(g, W / 2 - 24, ty - 92, 48, 70, 10); g.fill(); g.fillStyle = "#6d3d8f"; rrect(g, W / 2 - 17, ty - 84, 34, 46, 7); g.fill();
      g.fillStyle = "#e3c56e"; circ(g, W / 2 - 24, ty - 90, 5); g.fill(); circ(g, W / 2 + 24, ty - 90, 5); g.fill(); g.fillStyle = "#2a1f3d"; g.fillRect(W / 2 - 30, ty - 40, 60, 16);
      // bannières (bulle barrée)
      for (var i = 0; i < 2; i++) { var bx = W / 2 + (i ? 1 : -1) * Math.min(W * 0.36, 150); g.fillStyle = "#2a1f3d"; g.beginPath(); g.moveTo(bx - 14, ty - 96); g.lineTo(bx + 14, ty - 96); g.lineTo(bx + 14, ty - 44); g.lineTo(bx, ty - 54); g.lineTo(bx - 14, ty - 44); g.closePath(); g.fill(); g.strokeStyle = "#b79cff"; g.lineWidth = 2; circ(g, bx, ty - 76, 7); g.stroke(); g.beginPath(); g.moveTo(bx - 5, ty - 71); g.lineTo(bx + 5, ty - 81); g.stroke(); }
      // colonnes et braseros
      for (i = 0; i < Math.ceil((H - pf.y0) / 150) + 1; i++) for (var sd = 0; sd < 2; sd++) {
        var px = sd ? W - 6 : 6, py = pf.y0 + 30 + i * 150;
        g.fillStyle = "rgba(0,0,0,.3)"; ell(g, px + (sd ? -4 : 4), py + 6, 20, 16); g.fill(); g.fillStyle = "#9d90c4"; circ(g, px, py, 18); g.fill(); g.fillStyle = "#b8acd9"; circ(g, px, py, 12); g.fill(); g.fillStyle = "#d3c9ee"; circ(g, px - 2, py - 2, 6); g.fill();
        var fx = sd ? W - 12 : 12, fy = py + 75; glow(g, "#c08bff", fx, fy, 40, 0.5); g.fillStyle = "#33284d"; circ(g, fx, fy, 7); g.fill(); g.fillStyle = "#e6c8ff"; circ(g, fx, fy, 3.5); g.fill();
      }
    } }
  };

  // ========================================================================
  //  CRÉATURES — peintres canvas. Origine = point au sol (pieds), y vers le haut négatif.
  //  e : { t, r, moving, wp (0..1 préparation d'attaque), state, hitT, freezeT, c0, c1, c2, col, ly }
  // ========================================================================
  function tri(g, x1, y1, x2, y2, x3, y3) { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x3, y3); g.closePath(); }
  function inkBody(g, fill, dark, line) {
    if (dark) { g.strokeStyle = "rgba(238,236,255,.6)"; g.lineWidth = 5.5; g.stroke(); }
    g.fillStyle = fill; g.fill(); g.strokeStyle = line || INK; g.lineWidth = 2.2; g.stroke();
  }
  function eye(g, x, y, r, lx, ly, col) {
    g.fillStyle = col || "#fff"; circ(g, x, y, r); g.fill();
    var px = x + lx * r * 0.36, py = y + ly * r * 0.36;
    g.fillStyle = INK; circ(g, px, py, r * 0.52); g.fill();
    g.fillStyle = "#fff"; circ(g, px - r * 0.16, py - r * 0.2, r * 0.17); g.fill();
  }
  function brow(g, x, y, w, slant, col, lw) {
    g.strokeStyle = col || INK; g.lineWidth = lw || 2.4; g.lineCap = "round"; g.beginPath(); g.moveTo(x - w, y - slant); g.lineTo(x + w, y + slant); g.stroke();
  }
  function bodyCol(e) { return e.hitT > 0 ? "#ffffff" : e.freezeT > 0 ? "#c4e9ff" : e.c0; }

  var PAINT = {
    mumblin: function (g, e, dark) {
      var hop = e.moving ? Math.abs(Math.sin(e.t * 9)) * 4 : Math.sin(e.t * 3) * 0.8;
      var sq = 1 - e.wp * 0.22 + (e.state === "rec" ? 0.1 : 0), c = bodyCol(e);
      g.translate(0, -hop); g.scale(2 - sq, sq);
      g.fillStyle = e.c2; tri(g, -11, -26, -14, -37, -5, -30); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.6; g.stroke(); tri(g, 11, -26, 14, -37, 5, -30); g.fill(); g.stroke();
      g.beginPath(); g.arc(0, -16, 15, PI, 0); g.lineTo(15, -7);
      g.quadraticCurveTo(15, 0, 10.5, 0); g.quadraticCurveTo(7, 0, 6.5, -4); g.quadraticCurveTo(5, 3, 0, 3); g.quadraticCurveTo(-5, 3, -6.5, -4); g.quadraticCurveTo(-7, 0, -10.5, 0); g.quadraticCurveTo(-15, 0, -15, -7); g.closePath();
      inkBody(g, c, dark);
      g.fillStyle = "rgba(255,255,255,.16)"; ell(g, -6, -25, 5, 3); g.fill();
      eye(g, -5.5, -18, 4.9, 0.6, e.ly); eye(g, 5.5, -18, 4.9, 0.6, e.ly);
      brow(g, -5.5, -24.5, 4.2, 2.2); brow(g, 5.5, -24.5, 4.2, -2.2);
      g.strokeStyle = INK; g.lineWidth = 1.8; g.beginPath(); g.arc(0, -5.5, 5, PI * 1.15, PI * 1.85); g.stroke();
      g.fillStyle = "#fff"; tri(g, 2, -10.2, 5, -10, 3.5, -6.8); g.fill();
    },
    blot: function (g, e, dark) {
      var r = e.r, t = e.t, wob = e.freezeT > 0 ? 0 : 1, sq = 1 - e.wp * 0.25, c = bodyCol(e), i;
      g.scale(1 + (1 - sq) * 0.6, sq);
      g.beginPath();
      for (i = 0; i <= 14; i++) {
        var a = i / 14 * TAU, rr = 1 + wob * 0.07 * Math.sin(t * 4 + i * 1.7), x = Math.cos(a) * r * 1.12 * rr, y = -r * 0.6 + Math.sin(a) * r * 0.66 * rr;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.closePath(); inkBody(g, c, dark);
      g.fillStyle = "rgba(255,255,255,.14)"; ell(g, -r * 0.45, -r * 0.92, r * 0.3, r * 0.12); g.fill();
      g.fillStyle = e.c1; circ(g, r * 0.62, -r * 0.5, r * 0.1); g.fill(); circ(g, -r * 0.78, -r * 0.42, r * 0.07); g.fill();
      // yeux mi-clos
      var ex = r * 0.34, ey = -r * 0.74, er = r * 0.25;
      eye(g, -ex, ey, er, 0.5, 0.5); eye(g, ex, ey, er, 0.5, 0.5);
      g.fillStyle = c; g.beginPath(); g.arc(-ex, ey, er + 0.6, PI, 0); g.fill(); g.beginPath(); g.arc(ex, ey, er + 0.6, PI, 0); g.fill();
      g.strokeStyle = INK; g.lineWidth = 1.8; g.beginPath(); g.moveTo(-ex - er, ey); g.lineTo(-ex + er, ey + er * 0.25); g.moveTo(ex + er, ey); g.lineTo(ex - er, ey + er * 0.25); g.stroke();
      g.beginPath(); g.moveTo(-r * 0.2, -r * 0.3); g.quadraticCurveTo(-r * 0.1, -r * 0.4, 0, -r * 0.3); g.quadraticCurveTo(r * 0.1, -r * 0.2, r * 0.2, -r * 0.3); g.stroke();
    },
    shushbat: function (g, e, dark) {
      var by = -24 + Math.sin(e.t * 6) * 3, flap = e.freezeT > 0 ? 0.3 : Math.sin(e.t * (e.state === "swoop" ? 30 : 16));
      var sp = e.wp > 0 ? 1.25 : 1, c = bodyCol(e), s;
      g.translate(0, by);
      for (s = -1; s <= 1; s += 2) {
        g.beginPath(); g.moveTo(s * 6, -2); g.quadraticCurveTo(s * 16 * sp, -16 - flap * 8, s * 27 * sp, -4 - flap * 10);
        g.quadraticCurveTo(s * 21 * sp, -1 - flap * 5, s * 19 * sp, 5 - flap * 4); g.quadraticCurveTo(s * 14 * sp, 0, s * 12 * sp, 7 - flap * 2); g.quadraticCurveTo(s * 9, 2, s * 6, 5); g.closePath();
        inkBody(g, e.hitT > 0 ? "#fff" : e.c2, dark);
      }
      g.fillStyle = c; g.strokeStyle = INK; g.lineWidth = 1.8;
      tri(g, -9, -6, -11, -20, -2, -10); g.fill(); g.stroke(); tri(g, 9, -6, 11, -20, 2, -10); g.fill(); g.stroke();
      circ(g, 0, 0, 11); inkBody(g, c, dark);
      g.fillStyle = "#ffe45c"; ell(g, -4.3, -1.5, 3.3, 3.7); g.fill(); ell(g, 4.3, -1.5, 3.3, 3.7); g.fill();
      g.fillStyle = INK; ell(g, -3.6, -1.5, 1, 2.7); g.fill(); ell(g, 5, -1.5, 1, 2.7); g.fill();
      brow(g, -4.5, -6.2, 3.4, 1.8, INK, 2); brow(g, 4.5, -6.2, 3.4, -1.8, INK, 2);
      g.fillStyle = "#2a1838"; circ(g, 0, 5.2, 2); g.fill();
      g.fillStyle = "#fff"; tri(g, -2.6, 4, -1, 4, -1.8, 7); g.fill(); tri(g, 2.6, 4, 1, 4, 1.8, 7); g.fill();
    },
    spitter: function (g, e, dark) {
      var puff = e.wp, bob = Math.sin(e.t * 4), c = bodyCol(e);
      g.fillStyle = e.c2; ell(g, -7, -1, 5, 3); g.fill(); ell(g, 7, -1, 5, 3); g.fill();
      g.strokeStyle = e.c2; g.lineWidth = 3.4; g.beginPath(); g.moveTo(-5, -20 + bob); g.lineTo(-7, -28 + bob); g.moveTo(4, -20 + bob); g.lineTo(5, -28 + bob); g.stroke();
      g.beginPath(); g.ellipse(0, -12 + bob, 15 + puff * 4, 12 + puff * 2.5, 0, 0, TAU); inkBody(g, c, dark);
      g.fillStyle = e.c2; circ(g, -8, -16 + bob, 2.6); g.fill(); circ(g, -11, -9 + bob, 2); g.fill(); circ(g, -4, -8 + bob, 1.6); g.fill();
      g.fillStyle = "rgba(255,255,255,.18)"; ell(g, -3, -20 + bob, 6, 2.6); g.fill();
      eye(g, -7, -30 + bob, 4.7, 0.6, e.ly); eye(g, 5, -30 + bob, 4.7, 0.6, e.ly);
      g.strokeStyle = INK; g.lineWidth = 1.6; circ(g, -7, -30 + bob, 4.7); g.stroke(); circ(g, 5, -30 + bob, 4.7); g.stroke();
      var sx = 13 + puff * 3;
      g.fillStyle = e.c1; ell(g, sx, -11 + bob, 6, 7 - puff * 1.5); g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
      g.fillStyle = puff > 0.05 ? "#0c1a13" : "#16301f"; ell(g, sx + 1, -11 + bob, 3.2, 4 - puff * 1.6); g.fill();
      if (puff > 0.2) { g.fillStyle = "rgba(20,30,40," + (0.5 * puff) + ")"; circ(g, sx + 6, -11 + bob, 2 + puff * 3); g.fill(); }
    },
    hushguard: function (g, e, dark) {
      var t = e.t, hop = e.moving ? Math.abs(Math.sin(t * 6)) * 2 : 0, sq = 1 - e.wp * 0.15, c = bodyCol(e), hit = e.hitT > 0;
      g.translate(0, -hop); g.scale(2 - sq, sq);
      if (!e.armor && !(e.crackT > 0)) {
        g.beginPath(); g.arc(0, -18, 16, PI, 0); g.lineTo(16, -4); g.quadraticCurveTo(16, 2, 8, 1); g.quadraticCurveTo(0, 4, -8, 1); g.quadraticCurveTo(-16, 2, -16, -4); g.closePath();
        inkBody(g, hit ? "#fff" : e.freezeT > 0 ? "#c4e9ff" : "#4d5063", dark);
        eye(g, -6, -19, 5.2, 0.3, 0.2); eye(g, 6, -19, 5.2, 0.3, 0.2);
        brow(g, -6, -26.5, 4, -1.8); brow(g, 6, -26.5, 4, 1.8);
        g.fillStyle = INK; ell(g, 0, -8, 2.4, 3); g.fill();
        g.fillStyle = e.c0; g.strokeStyle = INK; g.lineWidth = 1.8;
        g.beginPath(); g.moveTo(-15, -27); g.lineTo(-4, -38); g.lineTo(6, -34); g.lineTo(-1, -29); g.lineTo(-8, -24); g.closePath(); g.fill(); g.stroke();
        tri(g, 11, -3, 19, -1, 14, 3); g.fill(); g.stroke();
        return;
      }
      g.fillStyle = "#3d4150"; g.fillRect(-10, -5, 8, 6); g.fillRect(2, -5, 8, 6);
      rrect(g, -15, -25, 30, 23, 7); inkBody(g, c, dark);
      g.fillStyle = e.c1; g.strokeStyle = INK; g.lineWidth = 1.8; circ(g, -15, -22, 6); g.fill(); g.stroke(); circ(g, 15, -22, 6); g.fill(); g.stroke();
      g.strokeStyle = e.c2; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-4, -12); g.lineTo(4, -6); g.moveTo(4, -12); g.lineTo(-4, -6); g.stroke();
      g.beginPath(); g.arc(0, -30, 13, PI, 0); g.lineTo(13, -23); g.lineTo(-13, -23); g.closePath();
      g.fillStyle = hit ? "#fff" : e.c1; g.fill(); g.strokeStyle = INK; g.lineWidth = 2.2; g.stroke();
      g.fillStyle = e.c2; g.fillRect(-1.5, -44, 3, 6);
      g.fillStyle = "#15151e"; rrect(g, -9, -33, 18, 6.5, 3); g.fill();
      g.fillStyle = e.wp > 0 ? "#ff5a4a" : "#ffb04a"; circ(g, -4, -29.8, 1.9); g.fill(); circ(g, 4, -29.8, 1.9); g.fill();
      g.fillStyle = e.c2; circ(g, 12, -11, 9); g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
      g.strokeStyle = "#e9ecf5"; g.lineWidth = 2.4; g.beginPath(); g.moveTo(7.5, -11); g.lineTo(16.5, -11); g.stroke(); circ(g, 12, -11, 5.4); g.lineWidth = 1.2; g.stroke();
      g.fillStyle = "rgba(255,255,255,.3)"; ell(g, -6, -37, 4, 2); g.fill();
      if (e.crackT > 0) {
        g.strokeStyle = "#ffe066"; g.lineWidth = 1.8; g.globalAlpha *= 0.6 + 0.4 * Math.sin(t * 14);
        g.beginPath(); g.moveTo(-8, -40); g.lineTo(-3, -32); g.lineTo(-7, -26); g.lineTo(-1, -18); g.lineTo(-5, -10); g.moveTo(6, -24); g.lineTo(10, -18); g.lineTo(5, -14); g.stroke();
      }
    },
    whisper: function (g, e, dark) {
      var by = -20 + Math.sin(e.t * 3.2) * 4, sway = Math.sin(e.t * 5) * 3, c = bodyCol(e);
      glow(g, e.col, 0, by, 32, 0.5);
      g.translate(0, by);
      g.beginPath(); g.moveTo(0, 12); g.bezierCurveTo(-15, 12, -16, -4, -7, -12); g.quadraticCurveTo(-2, -18, sway, -29); g.quadraticCurveTo(4, -18, 8, -11); g.bezierCurveTo(16, -3, 15, 12, 0, 12); g.closePath();
      g.fillStyle = c; g.fill(); g.strokeStyle = "#2a6f9c"; g.lineWidth = 2.2; g.stroke();
      g.fillStyle = "rgba(255,255,255,.65)"; ell(g, 0, 2, 7, 8); g.fill();
      g.fillStyle = "#123a55"; ell(g, -4, -1, 2.1, 3.3); g.fill(); ell(g, 4, -1, 2.1, 3.3); g.fill();
      brow(g, -4.2, -6.4, 3, 1.5, "#123a55", 1.8); brow(g, 4.2, -6.4, 3, -1.5, "#123a55", 1.8);
      circ(g, 0, 6, e.wp > 0 ? 3 : 1.8); g.fill();
    },
    frostling: function (g, e, dark) {
      var t = e.t, hop = e.moving ? Math.abs(Math.sin(t * 8)) * 3 : 0, sq = 1 - e.wp * 0.2, c = bodyCol(e), L = "#27506e";
      g.translate(0, -hop); g.scale(2 - sq, sq);
      g.fillStyle = "#eefbff"; g.strokeStyle = L; g.lineWidth = 1.6;
      tri(g, -9, -26, -12, -40, -3, -29); g.fill(); g.stroke(); tri(g, -3, -29, 0, -46, 4, -29); g.fill(); g.stroke(); tri(g, 4, -29, 11, -40, 9, -26); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(0, -31); g.lineTo(12, -25); g.lineTo(15, -11); g.lineTo(8, 0); g.lineTo(-8, 0); g.lineTo(-15, -11); g.lineTo(-12, -25); g.closePath();
      inkBody(g, c, dark, L);
      g.fillStyle = "rgba(255,255,255,.6)"; g.beginPath(); g.moveTo(0, -31); g.lineTo(12, -25); g.lineTo(2, -21); g.lineTo(-7, -25); g.closePath(); g.fill();
      g.fillStyle = "rgba(50,120,175,.28)"; g.beginPath(); g.moveTo(8, 0); g.lineTo(15, -11); g.lineTo(3, -8); g.lineTo(-2, 0); g.closePath(); g.fill();
      eye(g, -5, -16, 4.2, 0.6, e.ly); eye(g, 5, -16, 4.2, 0.6, e.ly);
      brow(g, -5, -21.6, 3.8, 2, L); brow(g, 5, -21.6, 3.8, -2, L);
      g.fillStyle = "rgba(255,150,190,.5)"; circ(g, -9.5, -11, 2); g.fill(); circ(g, 9.5, -11, 2); g.fill();
      g.strokeStyle = L; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-3, -7); g.lineTo(-1, -9); g.lineTo(1, -7); g.lineTo(3, -9); g.stroke();
    },
    silent_knight: function (g, e, dark) {
      var t = e.t, walk = e.moving ? Math.sin(t * 7) : 0, lean = e.state === "charge" ? 0.24 : e.wp > 0 ? -0.16 * e.wp : 0, c = bodyCol(e), hit = e.hitT > 0;
      g.rotate(lean);
      g.fillStyle = "#3a3e4d"; g.fillRect(-9, -8 + walk * 1.5, 7, 9); g.fillRect(2, -8 - walk * 1.5, 7, 9);
      g.fillStyle = e.c2; g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.moveTo(-20, -32); g.lineTo(-6, -32); g.lineTo(-6, -18); g.quadraticCurveTo(-13, -8, -13, -8); g.quadraticCurveTo(-20, -14, -20, -18); g.closePath(); g.fill(); g.stroke();
      rrect(g, -13, -32, 26, 26, 7); inkBody(g, c, dark);
      g.fillStyle = e.c1; g.fillRect(-12, -14, 24, 3); g.fillStyle = "#e3c56e"; g.fillRect(-2.5, -15, 5, 5);
      g.strokeStyle = "#eef2ff"; g.lineWidth = 1.6; circ(g, 0, -23, 4); g.stroke(); g.beginPath(); g.moveTo(-3, -20); g.lineTo(3, -26); g.stroke();
      g.fillStyle = "#8b5cf6"; g.strokeStyle = INK; g.lineWidth = 1.6; g.beginPath(); g.moveTo(0, -51); g.quadraticCurveTo(-13 + Math.sin(t * 5) * 2, -63, -19, -48); g.quadraticCurveTo(-8, -53, 0, -49); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); g.arc(0, -40, 12, PI, 0); g.lineTo(12, -30); g.lineTo(-12, -30); g.closePath(); g.fillStyle = hit ? "#fff" : e.c1; g.fill(); g.strokeStyle = INK; g.lineWidth = 2.2; g.stroke();
      g.fillStyle = "#12121b"; g.fillRect(-8, -43, 16, 4.5); g.fillRect(-1.6, -43, 3.2, 11);
      g.fillStyle = e.wp > 0 || e.state === "charge" ? "#ff5a5a" : "#cfe8ff"; g.fillRect(-6, -42, 12, 2.2);
      g.strokeStyle = INK; g.lineWidth = 5.5; g.lineCap = "round"; g.beginPath(); g.moveTo(4, -21); g.lineTo(40, -23); g.stroke();
      g.strokeStyle = "#c9ccd6"; g.lineWidth = 3; g.beginPath(); g.moveTo(4, -21); g.lineTo(40, -23); g.stroke();
      g.fillStyle = "#f3f5ff"; g.strokeStyle = INK; g.lineWidth = 1.6; tri(g, 39, -28, 53, -23.5, 39, -18.5); g.fill(); g.stroke();
      g.fillStyle = c; circ(g, 9, -21.5, 4.5); g.fill(); g.stroke();
    },

    // ------------------------------------------------------------ boss
    grumble: function (g, e, dark) {
      var t = e.t, hop = e.moving ? Math.abs(Math.sin(t * 5)) * 4 : Math.sin(t * 2) * 1.5, slam = e.state === "slam" ? e.wp : 0, roar = e.state === "summon" ? e.wp : 0;
      var sq = 1 - slam * 0.1 + (e.state === "rec" ? 0.08 : 0), c = bodyCol(e), s;
      g.translate(0, -hop); g.scale(2 - sq, sq);
      g.fillStyle = e.c2; g.strokeStyle = INK; g.lineWidth = 2;
      tri(g, -27, -68, -38, -97, -13, -78); g.fill(); g.stroke(); tri(g, 27, -68, 38, -97, 13, -78); g.fill(); g.stroke();
      g.beginPath(); g.arc(0, -42, 40, PI, 0); g.lineTo(40, -14);
      g.quadraticCurveTo(40, 2, 28, 2); g.quadraticCurveTo(22, 2, 20, -6); g.quadraticCurveTo(16, 8, 6, 7); g.quadraticCurveTo(0, 7, -2, -2); g.quadraticCurveTo(-6, 8, -16, 7); g.quadraticCurveTo(-22, 6, -24, -4); g.quadraticCurveTo(-28, 2, -32, 2); g.quadraticCurveTo(-40, 2, -40, -14); g.closePath();
      inkBody(g, c, dark);
      g.fillStyle = "rgba(255,255,255,.12)"; ell(g, -16, -68, 13, 6); g.fill();
      var fy = -20 - slam * 50 - roar * 30;
      for (s = -1; s <= 1; s += 2) {
        circ(g, s * 52, fy, 15); inkBody(g, e.hitT > 0 ? "#fff" : e.c1, dark);
        g.strokeStyle = INK; g.lineWidth = 1.6; g.beginPath(); g.moveTo(s * 46, fy + 4); g.lineTo(s * 46, fy + 10); g.moveTo(s * 52, fy + 5); g.lineTo(s * 52, fy + 12); g.moveTo(s * 58, fy + 4); g.lineTo(s * 58, fy + 10); g.stroke();
      }
      eye(g, -16, -48, 8.5, 0.5, e.ly); eye(g, 16, -48, 8.5, 0.5, e.ly); eye(g, 0, -62, 10, 0.4, e.ly, "#fff3c4");
      brow(g, -16, -59, 9, 4, INK, 4); brow(g, 16, -59, 9, -4, INK, 4);
      if (roar > 0.1 || slam > 0.6) {
        g.fillStyle = "#17121f"; ell(g, 0, -24, 15, 7 + roar * 7); g.fill(); g.fillStyle = "#d9597a"; ell(g, 0, -19 + roar * 4, 8, 3.5); g.fill();
      } else {
        g.strokeStyle = INK; g.lineWidth = 2.6; g.beginPath(); g.moveTo(-17, -24); g.quadraticCurveTo(0, -30, 17, -24); g.stroke();
      }
      g.fillStyle = "#fff"; g.strokeStyle = INK; g.lineWidth = 1.4; tri(g, -13, -24, -7, -26, -10, -35); g.fill(); g.stroke(); tri(g, 13, -24, 7, -26, 10, -35); g.fill(); g.stroke();
    },
    bramble: function (g, e, dark) {
      var t = e.t, cast = e.wp, c = bodyCol(e), i, s, a;
      g.translate(0, e.moving ? -Math.abs(Math.sin(t * 3)) * 3 : 0);
      g.fillStyle = "#2c4d22"; g.strokeStyle = INK; g.lineWidth = 1.6;
      for (i = 0; i < 14; i++) {
        a = i / 14 * TAU + Math.sin(t + i) * 0.04; var cx = Math.cos(a) * 39, cy = -42 + Math.sin(a) * 37, nx = Math.cos(a), ny = Math.sin(a);
        tri(g, cx - ny * 6, cy + nx * 6, cx + ny * 6, cy - nx * 6, cx + nx * 13, cy + ny * 13); g.fill(); g.stroke();
      }
      for (s = -1; s <= 1; s += 2) {
        var hx = s * (54 + cast * 4), hy = -30 - cast * 34 * (e.state === "fan" ? 1 : -0.5);
        g.strokeStyle = INK; g.lineWidth = 12; g.lineCap = "round"; g.beginPath(); g.moveTo(s * 34, -46); g.quadraticCurveTo(s * 50, -52, hx, hy); g.stroke();
        g.strokeStyle = "#4f7f3a"; g.lineWidth = 8; g.stroke();
        circ(g, hx, hy, 10); inkBody(g, "#4f7f3a", dark);
        g.fillStyle = "#2c4d22"; tri(g, hx - 4, hy - 9, hx + 4, hy - 9, hx, hy - 17); g.fill(); tri(g, hx + s * 8, hy - 4, hx + s * 8, hy + 4, hx + s * 16, hy); g.fill();
      }
      ell(g, 0, -42, 40, 38); inkBody(g, c, dark);
      g.strokeStyle = "#5f9a48"; g.lineWidth = 3; g.lineCap = "round";
      g.beginPath(); g.arc(-8, -30, 30, PI * 1.05, PI * 1.6); g.stroke(); g.beginPath(); g.arc(10, -52, 26, PI * 0.1, PI * 0.6); g.stroke(); g.beginPath(); g.arc(0, -20, 34, PI * 1.25, PI * 1.75); g.stroke();
      g.strokeStyle = "#2c4d22"; g.lineWidth = 2; g.beginPath(); g.arc(4, -36, 36, PI * 0.2, PI * 0.75); g.stroke();
      for (i = 0; i < 5; i++) { g.save(); g.translate(0, -78); g.rotate((i - 2) * 0.5 + Math.sin(t * 2 + i) * 0.06); g.fillStyle = i % 2 ? "#6dbb4f" : "#5aa844"; ell(g, 0, -10, 5, 12); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.4; g.stroke(); g.restore(); }
      g.fillStyle = "#ff9ecb"; for (i = 0; i < 5; i++) { circ(g, 14 + Math.cos(i * 1.257) * 4, -78 + Math.sin(i * 1.257) * 4, 3); g.fill(); } g.fillStyle = "#ffe066"; circ(g, 14, -78, 2.4); g.fill();
      eye(g, -14, -48, 9.5, 0.4, e.ly, "#fff6c9"); eye(g, 14, -48, 9.5, 0.4, e.ly, "#fff6c9");
      var sl = cast > 0 ? 3.5 : -3;
      brow(g, -14, -60.5, 8, sl, "#1e3516", 3.6); brow(g, 14, -60.5, 8, -sl, "#1e3516", 3.6);
      g.strokeStyle = INK; g.lineWidth = 2.4; g.beginPath();
      if (cast > 0) { g.moveTo(-10, -22); g.lineTo(-5, -26); g.lineTo(0, -22); g.lineTo(5, -26); g.lineTo(10, -22); } else { g.arc(0, -18, 9, PI * 1.2, PI * 1.8); }
      g.stroke();
    },
    captain_blank: function (g, e, dark) {
      var t = e.t, by = -10 + Math.sin(t * 2.4) * 4, cast = e.wp, w1 = Math.sin(t * 5) * 3, w2 = Math.cos(t * 5) * 3, c = bodyCol(e);
      g.translate(0, by);
      glow(g, "#9fd8e8", 0, -34, 62, 0.35);
      // sabre
      g.strokeStyle = "#274b5a"; g.lineWidth = 5; g.lineCap = "round"; g.beginPath(); g.moveTo(-24, -30); g.quadraticCurveTo(-44, -34, -48, -56); g.stroke();
      g.strokeStyle = "#f2fbff"; g.lineWidth = 2.6; g.stroke();
      g.beginPath(); g.arc(0, -44, 22, PI, 0);
      g.quadraticCurveTo(26, -14, 18, 2 + w1); g.quadraticCurveTo(12, -8, 6, 4 + w2); g.quadraticCurveTo(0, -8, -6, 4 + w1); g.quadraticCurveTo(-12, -8, -18, 2 + w2); g.quadraticCurveTo(-26, -14, -22, -44); g.closePath();
      inkBody(g, c, dark, "#2f6f86");
      g.fillStyle = "rgba(36,78,110,.38)"; g.beginPath(); g.moveTo(-22, -32); g.lineTo(22, -32); g.lineTo(19, -6); g.lineTo(-19, -6); g.closePath(); g.fill();
      g.fillStyle = "#e3c56e"; circ(g, 0, -26, 2); g.fill(); circ(g, 0, -18, 2); g.fill(); circ(g, 0, -10, 2); g.fill();
      // tricorne à emblème vide
      g.beginPath(); g.moveTo(-31, -57); g.quadraticCurveTo(0, -70, 31, -57); g.quadraticCurveTo(14, -65, 0, -86); g.quadraticCurveTo(-14, -65, -31, -57); g.closePath();
      g.fillStyle = "#1f2d4a"; g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
      g.strokeStyle = "#dfe9f5"; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-27, -58.5); g.quadraticCurveTo(0, -69, 27, -58.5); g.stroke();
      g.fillStyle = "#f5f8fb"; ell(g, 0, -71, 6, 5); g.fill(); g.strokeStyle = "rgba(31,45,74,.5)"; g.lineWidth = 1; g.stroke();
      // visage : bandeau + œil creux
      g.strokeStyle = "#1c2a3a"; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-21, -52); g.lineTo(-2, -44); g.stroke();
      g.fillStyle = "#1c2a3a"; circ(g, -8, -46, 5.6); g.fill();
      g.fillStyle = "#16303e"; ell(g, 8, -46, 5.4, 6.2); g.fill(); g.fillStyle = cast > 0 ? "#ff7a7a" : "#eaffff"; circ(g, 9, -45.5, 2.2); g.fill();
      brow(g, 8, -54, 5, -2, "#16303e", 2.2);
      g.strokeStyle = "#16303e"; g.lineWidth = 2; g.beginPath(); g.moveTo(-7, -34); g.quadraticCurveTo(-3, -37, 0, -34); g.quadraticCurveTo(3, -31, 7, -34); g.stroke();
      // pistolet
      var py = -30 - cast * 8;
      g.fillStyle = "#2b3a44"; g.strokeStyle = INK; g.lineWidth = 1.6; rrect(g, 22, py - 4, 22, 8, 3); g.fill(); g.stroke(); g.fillStyle = "#7a5230"; g.fillRect(22, py + 2, 6, 8);
      circ(g, 23, py, 5); g.fillStyle = c; g.fill(); g.strokeStyle = "#2f6f86"; g.stroke();
      if (cast > 0) glow(g, "#ffd27a", 46, py, 10 + cast * 10, 0.9);
    },
    glacia: function (g, e, dark) {
      var t = e.t, flap = Math.sin(t * (e.state === "slide" ? 10 : 3.2)), by = -14 + Math.sin(t * 2) * 3, cast = e.wp, c = bodyCol(e), L = "#2a6a94";
      g.translate(0, by);
      // queue
      g.lineCap = "round"; g.strokeStyle = L; g.lineWidth = 14; g.beginPath(); g.moveTo(-18, -22); g.quadraticCurveTo(-46, -32 + flap * 3, -60, -10); g.stroke();
      g.strokeStyle = e.c2; g.lineWidth = 10; g.stroke();
      g.fillStyle = "#eefbff"; g.strokeStyle = L; g.lineWidth = 1.6; tri(g, -60, -20, -74, -8, -57, -1); g.fill(); g.stroke();
      // ailes
      g.fillStyle = e.hitT > 0 ? "#fff" : "#c6ecff";
      g.beginPath(); g.moveTo(8, -44); g.quadraticCurveTo(30, -84 - flap * 9, 62, -68 - flap * 12); g.quadraticCurveTo(44, -60, 42, -48 - flap * 5); g.quadraticCurveTo(30, -55, 26, -42); g.quadraticCurveTo(16, -46, 8, -38); g.closePath(); g.fill(); g.strokeStyle = L; g.lineWidth = 2; g.stroke();
      g.beginPath(); g.moveTo(-6, -44); g.quadraticCurveTo(-30, -92 - flap * 11, -70, -74 - flap * 15); g.quadraticCurveTo(-50, -64, -47, -51 - flap * 6); g.quadraticCurveTo(-32, -58, -27, -43); g.quadraticCurveTo(-15, -47, -6, -39); g.closePath();
      if (dark) { g.strokeStyle = "rgba(238,236,255,.6)"; g.lineWidth = 5; g.stroke(); }
      g.fill(); g.strokeStyle = L; g.lineWidth = 2; g.stroke();
      g.strokeStyle = "rgba(42,106,148,.5)"; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-6, -44); g.lineTo(-47, -51 - flap * 6); g.moveTo(-6, -44); g.lineTo(-27, -43); g.stroke();
      // pattes, corps
      g.fillStyle = e.c2; circ(g, -11, -3 - by * 0.3, 6.5); g.fill(); g.strokeStyle = L; g.stroke(); circ(g, 13, -3 - by * 0.3, 6.5); g.fill(); g.stroke();
      ell(g, 0, -28, 30, 24); inkBody(g, c, dark, L);
      g.fillStyle = "#f1fcff"; ell(g, 5, -20, 18, 13); g.fill();
      g.strokeStyle = "rgba(42,106,148,.35)"; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-8, -18); g.lineTo(18, -18); g.moveTo(-6, -12); g.lineTo(16, -12); g.stroke();
      // cou + tête
      var hy = -62 - cast * 7, hx = 44 - cast * 6;
      g.strokeStyle = L; g.lineWidth = 17; g.beginPath(); g.moveTo(20, -40); g.quadraticCurveTo(30, -52, hx - 6, hy + 4); g.stroke(); g.strokeStyle = c; g.lineWidth = 13; g.stroke();
      g.fillStyle = "#eefbff"; g.strokeStyle = L; g.lineWidth = 1.6; tri(g, hx - 10, hy - 6, hx - 22, hy - 22, hx - 2, hy - 10); g.fill(); g.stroke(); tri(g, hx - 2, hy - 9, hx - 8, hy - 26, hx + 6, hy - 10); g.fill(); g.stroke();
      g.beginPath(); g.ellipse(hx, hy, 16, 11.5, 0.1, 0, TAU); inkBody(g, c, dark, L);
      g.fillStyle = "#f1fcff"; ell(g, hx + 9, hy + 3, 8, 6); g.fill();
      g.fillStyle = "#fff"; ell(g, hx + 2, hy - 3, 5, 4.4); g.fill(); g.fillStyle = "#123a55"; ell(g, hx + 3.4, hy - 3, 1.5, 3.6); g.fill();
      brow(g, hx + 2, hy - 8.6, 5.5, 2.4, "#123a55", 2.4);
      g.fillStyle = "#123a55"; circ(g, hx + 14, hy + 1, 1.1); g.fill();
      g.strokeStyle = "#123a55"; g.lineWidth = 1.6; g.beginPath(); g.moveTo(hx + 4, hy + 6.5); g.lineTo(hx + 15, hy + 5.5); g.stroke();
      if (cast > 0) { glow(g, "#dff6ff", hx + 18, hy + 5, 8 + cast * 14, 0.95); }
      else { g.fillStyle = "rgba(255,255,255," + (0.35 + 0.25 * Math.sin(t * 3)) + ")"; circ(g, hx + 20, hy + 1 - Math.sin(t * 3) * 2, 2.6); g.fill(); }
    },
    lord_hush: function (g, e, dark) {
      var t = e.t, ph = e.phase | 0, by = -6 + Math.sin(t * 2) * 3, cast = e.wp, flare = ph === 1 ? 1.4 : ph === 2 ? 1.12 : 1, i;
      var cloak = e.hitT > 0 ? "#ffffff" : e.freezeT > 0 ? "#c4e9ff" : ph === 2 ? "#54427c" : ph === 1 ? "#1c1230" : e.c0;
      var rim = ph === 1 ? "#ff7ad9" : ph === 2 ? "#ffd27a" : "#b79cff";
      g.translate(0, by); g.scale(1.22, 1.22);
      glow(g, rim, 0, -40, 72 + ph * 8, 0.34 + 0.1 * Math.sin(t * 4));
      if (ph >= 1) {
        g.font = "900 13px Nunito, system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = ph === 1 ? "#0d0915" : "rgba(255,226,160,.9)";
        for (i = 0; i < 6; i++) { var a = t * (ph === 1 ? 1.6 : 0.8) + i * 1.047, lx = Math.cos(a) * 42, ly = -40 + Math.sin(a) * 16; if (Math.sin(a) < 0) g.fillText("SILENT".charAt(i), lx, ly); }
      }
      var w = 24 * flare, hem = Math.sin(t * 3) * 2;
      if (cast > 0 || ph === 1) {
        var up = ph === 1 ? Math.max(cast, 0.45) : cast;
        for (i = -1; i <= 1; i += 2) { g.beginPath(); g.moveTo(i * 8, -56); g.quadraticCurveTo(i * 26, -58 - up * 10, i * (30 + up * 8), -44 - up * 30); g.lineTo(i * (20 + up * 6), -34 - up * 14); g.quadraticCurveTo(i * 14, -40, i * 8, -40); g.closePath(); g.fillStyle = cloak; g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke(); glow(g, rim, i * (30 + up * 8), -46 - up * 30, 8 + cast * 8, 0.9); }
      }
      g.beginPath(); g.moveTo(-10, -62); g.quadraticCurveTo(-w - 4, -30, -w, 2 + hem); g.quadraticCurveTo(-w * 0.6, -7, -w * 0.35, 3 - hem); g.quadraticCurveTo(0, -7, w * 0.35, 3 + hem); g.quadraticCurveTo(w * 0.6, -7, w, 2 - hem); g.quadraticCurveTo(w + 4, -30, 10, -62); g.closePath();
      g.strokeStyle = rgba(rim, 0.75); g.lineWidth = 6; g.stroke(); g.fillStyle = cloak; g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
      g.strokeStyle = "rgba(255,255,255,.12)"; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-4, -50); g.quadraticCurveTo(-10, -24, -w * 0.5, -4); g.moveTo(5, -50); g.quadraticCurveTo(10, -26, w * 0.45, -4); g.stroke();
      if (ph < 2) {
        g.beginPath(); g.moveTo(-15, -57); g.quadraticCurveTo(-19, -85, 0, -89); g.quadraticCurveTo(19, -85, 15, -57); g.quadraticCurveTo(0, -51, -15, -57); g.closePath();
        g.strokeStyle = rgba(rim, 0.75); g.lineWidth = 5; g.stroke(); g.fillStyle = cloak; g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
        g.fillStyle = "#0b0712"; ell(g, 0, -68, 10.5, 11.5); g.fill();
        g.fillStyle = ph === 1 ? "#ff7ad9" : "#e9deff"; var ew = 1.5 + (cast > 0 ? 1 : 0);
        g.beginPath(); g.ellipse(-4.4, -70, 2.8, ew, 0.25, 0, TAU); g.fill(); g.beginPath(); g.ellipse(4.4, -70, 2.8, ew, -0.25, 0, TAU); g.fill();
        if (!(cast > 0) && ph === 0) { g.fillStyle = "#cfc8dc"; g.strokeStyle = INK; g.lineWidth = 1.2; rrect(g, -1.6, -70, 3.2, 11, 1.6); g.fill(); g.stroke(); circ(g, 0, -57, 4); g.fill(); g.stroke(); }
      } else {
        g.fillStyle = "#3a2d5c"; ell(g, 0, -58, 17, 7); g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
        circ(g, 0, -72, 13); inkBody(g, e.hitT > 0 ? "#fff" : "#d6cfe3", dark);
        g.fillStyle = "#1a1426"; g.beginPath(); g.arc(0, -73, 13.4, PI * 1.02, PI * 1.98); g.quadraticCurveTo(8, -78, 3, -79); g.quadraticCurveTo(-2, -75, -6, -79); g.quadraticCurveTo(-10, -76, -13.4, -73); g.closePath(); g.fill();
        eye(g, -5, -70, 3.4, 0.3, 0.3); eye(g, 5, -70, 3.4, 0.3, 0.3);
        brow(g, -5, -75, 3.4, cast > 0 ? 1.6 : -1.4, "#1a1426", 2); brow(g, 5, -75, 3.4, cast > 0 ? -1.6 : 1.4, "#1a1426", 2);
        g.strokeStyle = "#5a4a6a"; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-3.5, -63.5 + Math.sin(t * 9) * 0.4); g.quadraticCurveTo(0, -65, 3.5, -63.5); g.stroke();
        g.fillStyle = "rgba(140,210,255,.9)"; ell(g, -6.4, -65.6, 1.2, 1.8); g.fill();
        g.fillStyle = "#e3c56e"; g.strokeStyle = INK; g.lineWidth = 1.2; circ(g, 0, -44, 4.2); g.fill(); g.stroke(); g.beginPath(); g.moveTo(-1.5, -47); g.lineTo(0.5, -44); g.lineTo(-1, -41); g.stroke();
      }
    }
  };
  PAINT.blotling = PAINT.blot;

  // -------------------------------------------------------------- héros / Pico de repli (dessinés une fois dans un sprite 128×128)
  function paintHeroFallback(g) {
    g.lineJoin = "round"; g.strokeStyle = INK; g.lineWidth = 4;
    g.fillStyle = "#3b4a6b"; rrect(g, 44, 100, 16, 22, 6); g.fill(); g.stroke(); rrect(g, 68, 100, 16, 22, 6); g.fill(); g.stroke();
    g.fillStyle = "#ff9600"; rrect(g, 36, 64, 56, 46, 16); g.fill(); g.stroke();
    g.fillStyle = "#ffd9b0"; circ(g, 30, 86, 9); g.fill(); g.stroke(); circ(g, 98, 86, 9); g.fill(); g.stroke();
    circ(g, 64, 44, 32); g.fill(); g.stroke();
    g.fillStyle = "#7a4a22"; g.beginPath(); g.arc(64, 42, 34, PI * 1.02, PI * 1.98); g.quadraticCurveTo(86, 30, 70, 26); g.quadraticCurveTo(54, 36, 30, 40); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = INK; ell(g, 52, 50, 4, 5.5); g.fill(); ell(g, 76, 50, 4, 5.5); g.fill();
    g.fillStyle = "#fff"; circ(g, 53.5, 48, 1.6); g.fill(); circ(g, 77.5, 48, 1.6); g.fill();
    g.fillStyle = "rgba(255,120,120,.45)"; circ(g, 44, 58, 5); g.fill(); circ(g, 84, 58, 5); g.fill();
    g.lineWidth = 3; g.beginPath(); g.arc(64, 58, 8, PI * 0.15, PI * 0.85); g.stroke();
  }
  function paintPetFallback(g) {
    g.lineJoin = "round"; g.strokeStyle = INK; g.lineWidth = 5;
    g.fillStyle = "#e0523f"; g.beginPath(); g.moveTo(40, 86); g.lineTo(14, 118); g.lineTo(34, 112); g.lineTo(46, 96); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = "#58cc02"; ell(g, 62, 70, 34, 40); g.fill(); g.stroke();
    g.fillStyle = "#3fa000"; g.beginPath(); g.moveTo(38, 60); g.quadraticCurveTo(22, 84, 48, 100); g.quadraticCurveTo(58, 80, 38, 60); g.fill(); g.stroke();
    g.fillStyle = "#ffc800"; g.beginPath(); g.moveTo(88, 50); g.quadraticCurveTo(116, 54, 104, 74); g.quadraticCurveTo(96, 66, 86, 66); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = "#fff"; circ(g, 74, 50, 11); g.fill(); g.lineWidth = 3; g.stroke(); g.fillStyle = INK; circ(g, 77, 50, 5.5); g.fill(); g.fillStyle = "#fff"; circ(g, 79, 48, 2); g.fill();
    g.fillStyle = "#7ee02a"; g.lineWidth = 4; tri(g, 50, 34, 56, 12, 66, 32); g.fill(); g.stroke(); tri(g, 62, 32, 72, 14, 78, 34); g.fill(); g.stroke();
  }

  // -------------------------------------------------------------- arme (dessinée pointant vers +x depuis la main)
  var BLADES = { wooden_sword: ["#c99a5b", "#e2bd84"], frost_blade: ["#9fdcff", "#eafaff"], crystal_blade: ["#ff9ad5", "#e6fbff"], silver_dagger: ["#dfe6f2", "#ffffff"], ranger_blade: ["#bfe3b0", "#f0fff0"], cutlass: ["#d7dde8", "#ffffff"] };
  function paintWeapon(g, kind, id, len) {
    var b = BLADES[id] || ["#cfd6e2", "#ffffff"];
    g.lineJoin = "round"; g.lineCap = "round"; g.strokeStyle = INK;
    if (kind === "staff") {
      g.lineWidth = 6; g.beginPath(); g.moveTo(-8, 0); g.lineTo(len - 6, 0); g.stroke();
      g.strokeStyle = "#a9753f"; g.lineWidth = 3.4; g.stroke();
      var oc = id === "star_staff" ? "#ffe066" : "#9be37a";
      glow(g, oc, len - 3, 0, 13, 0.8);
      g.fillStyle = oc; g.strokeStyle = INK; g.lineWidth = 1.8; circ(g, len - 3, 0, 5.5); g.fill(); g.stroke();
      g.fillStyle = "#fff"; circ(g, len - 4.5, -1.6, 1.6); g.fill();
    } else if (kind === "spear") {
      g.lineWidth = 5.5; g.beginPath(); g.moveTo(-14, 0); g.lineTo(len - 12, 0); g.stroke();
      g.strokeStyle = "#a9753f"; g.lineWidth = 3; g.stroke();
      g.fillStyle = b[0]; g.strokeStyle = INK; g.lineWidth = 1.8; tri(g, len - 14, -5.5, len + 2, 0, len - 14, 5.5); g.fill(); g.stroke();
      g.fillStyle = b[1]; tri(g, len - 12, -2.5, len - 2, 0, len - 12, 0); g.fill();
    } else {
      var L = kind === "dagger" ? len * 0.62 : len * 0.82, wd = kind === "dagger" ? 3.6 : 4.6;
      g.lineWidth = 1.8;
      g.fillStyle = b[0]; g.beginPath(); g.moveTo(6, -wd); g.lineTo(L - 6, -wd * 0.85); g.lineTo(L + 2, 0); g.lineTo(L - 6, wd * 0.85); g.lineTo(6, wd); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = b[1]; g.beginPath(); g.moveTo(7, -wd * 0.6); g.lineTo(L - 6, -wd * 0.5); g.lineTo(L - 1, 0); g.lineTo(7, 0); g.closePath(); g.fill();
      g.fillStyle = "#e3c56e"; rrect(g, 3, -7.5, 4.5, 15, 2); g.fill(); g.stroke();
      g.fillStyle = "#7a5230"; rrect(g, -5, -2.4, 9, 4.8, 2); g.fill(); g.stroke();
    }
  }

  // ========================================================================
  //  INSTANCE DE COMBAT
  // ========================================================================
  var HERO_SPEED = 168;       // px/s (unités monde) pour hero.speed = 1
  // Équilibrage global (réglé au bot, voir test/combat.e2e.js › balance) : les PV du catalogue sont des bases.
  // QA (partie complète au bot tactile + test/balance.js) : l'attaque des ennemis ordinaires passe de ×1,25 à ×1,5 (les combats normaux
  // se finissaient à 85-100 % de PV, potions et soins ne servaient jamais) ; celle des boss reste à ×1,3 : au-delà, le profil « pire cas »
  // (répond au hasard, n'esquive jamais) passe sous 90 % de victoires contre Lord Hush.
  var TUNING = { enemyHp: 2, bossHp: 1.8, enemyAtk: 1.5, bossAtk: 1.3, spawnGap: 0.5, waveGap: 1.2 };
  var SVG_ATK = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M33 5l10 0 0 10L21 37l-10-10z" fill="#fff" stroke="#1d1b2b" stroke-width="3" stroke-linejoin="round"/><path d="M8 28l12 12M10 38l-5 5" stroke="#1d1b2b" stroke-width="7" stroke-linecap="round"/><path d="M8 28l12 12M10 38l-5 5" stroke="#ffd34d" stroke-width="3.4" stroke-linecap="round"/></svg>';
  var SVG_DASH = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M20 10l18 14-18 14 5-14z" fill="#fff" stroke="#1d1b2b" stroke-width="3" stroke-linejoin="round"/><path d="M5 16h10M3 24h13M5 32h10" stroke="#fff" stroke-width="4" stroke-linecap="round"/></svg>';

  // ---------------------------------------------------------------- mini-tutoriel (premier combat ; rejouable depuis les réglages)
  var TUTO = [
    { t: "Bouge avec ton pouce gauche", s: "Pose ton pouce à gauche de l'écran et fais-le glisser : ton héros le suit.",
      art: '<span class="cb-tuto-joy"><i></i></span>' },
    { t: "Frappe !", s: "Touche l'épée pour frapper. La flèche bleue te fait rouler : esquive quand le sol devient rouge !",
      art: '<span class="cb-tuto-b cb-tuto-dash">' + SVG_DASH + '</span><span class="cb-tuto-b cb-tuto-atk">' + SVG_ATK + "</span>" },
    { t: "Lance un sort : trouve le bon mot !", s: "Touche un sort, puis choisis vite le bon mot anglais. Bonne réponse : le sort part à pleine puissance !",
      art: '<span class="cb-tuto-b cb-tuto-spell"><span class="cb-emo">✨</span></span><span class="cb-tuto-rune"><b><span class="cb-emo">🐶</span> le chien</b><i>cat</i><i class="cb-on">dog</i><i>bird</i></span>' }
  ];
  // Affiche les cartes dans `host` ; appelle done(skipped) à la fin. Renvoie { close }.
  function mountTuto(host, done, sound) {
    var i = 0, over = false;
    function draw() {
      var d = TUTO[i], dots = "", k;
      for (k = 0; k < TUTO.length; k++) dots += '<i class="' + (k === i ? "cb-on" : "") + '"></i>';
      host.innerHTML = '<div class="cb-card cb-tuto" role="dialog" aria-label="Comment jouer">' +
        '<div class="cb-tuto-art">' + d.art + "</div><h2>" + d.t + "</h2><p>" + d.s + "</p>" +
        '<div class="cb-tuto-dots" aria-hidden="true">' + dots + "</div>" +
        '<button type="button" class="cb-mbtn cb-primary" data-tuto="next">' + (i < TUTO.length - 1 ? "Suivant" : "C'est parti !") + "</button>" +
        (i < TUTO.length - 1 ? '<button type="button" class="cb-mbtn cb-ghost" data-tuto="skip">Passer</button>' : "") + "</div>";
    }
    function close() { if (over) return; over = true; host.removeEventListener("click", click, true); }
    function click(e) {
      var t = e.target, a;
      while (t && t !== host && !(t.getAttribute && t.getAttribute("data-tuto"))) t = t.parentNode;
      e.stopPropagation();
      if (!t || t === host) return;
      a = t.getAttribute("data-tuto"); if (sound) sound("click");
      if (a === "next" && i < TUTO.length - 1) { i++; draw(); return; }
      close(); host.innerHTML = ""; done(a === "skip");
    }
    host.addEventListener("click", click, true);
    draw();
    return { close: close };
  }
  function tutorial(container, o) {
    o = o || {};
    if (!container || !container.appendChild) throw new Error("Combat.tutorial : conteneur manquant");
    var root = document.createElement("div"), ov = document.createElement("div"), ctl;
    root.className = "cb-root cb-tuto-only"; ov.className = "cb-overlay";
    root.appendChild(ov); container.appendChild(root);
    try { if (root.getBoundingClientRect().height < 60) root.classList.add("cb-fixed"); } catch (err) { /* ignoré */ }
    function destroy() { ctl.close(); if (root.parentNode) root.parentNode.removeChild(root); }
    ctl = mountTuto(ov, function (skipped) { destroy(); try { if (o.onDone) o.onDone(!!skipped); } catch (err) { /* ignoré */ } }, o.sound);
    return { destroy: destroy };
  }

  function start(container, opts) {
    opts = opts || {};
    if (!container || !container.appendChild) throw new Error("Combat.start : conteneur manquant");
    var cat = catalog();
    var heroOpt = opts.hero || {}, wOpt = heroOpt.weapon || {}, wBonus = wOpt.bonus || {};
    var reduced = opts.reducedMotion != null ? !!opts.reducedMotion : !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    var baseDifficulty = clamp(num(opts.difficulty, 1), 0.4, 2), difficulty = baseDifficulty, easy = false;
    var destroyed = false, ended = false, paused = false, simulating = false, resultSent = null;
    var listeners = [];
    function on(target, type, fn, o) { target.addEventListener(type, fn, o); listeners.push([target, type, fn, o]); }
    function sfx(n) { if (simulating) return; try { if (opts.sound) opts.sound(n); } catch (err) { /* ignoré */ } }
    function vib(ms) { if (simulating || reduced) return; try { if (opts.vibrate) opts.vibrate(ms); } catch (err) { /* ignoré */ } }
    function speak(t) { if (simulating || !t) return; try { if (opts.speak) opts.speak(t); } catch (err) { /* ignoré */ } }

    // ---------------------------------------------------------------- données d'entrée (tolérantes)
    var weapon = {
      id: wOpt.id || "", kind: wOpt.kind || wOpt.wkind || "sword",
      reach: clamp(num(wOpt.reach, 50), 30, 120)
    };
    var H0 = {
      maxHp: Math.max(1, num(heroOpt.maxHp, 100)),
      atk: Math.max(1, num(heroOpt.atk, wOpt.atk != null ? num(wOpt.atk, 6) + 4 : 10)),
      spd: HERO_SPEED * clamp(num(heroOpt.speed, 1), 0.5, 2),
      dashCd: clamp(num(heroOpt.dashCd, 1.2), 0.25, 6),
      atkSpeed: clamp(heroOpt.attackSpeed != null ? num(heroOpt.attackSpeed, 1) : num(wBonus.attackSpeed, 1), 0.5, 3),
      regen: Math.max(0, num(heroOpt.regen, 0)),
      slowOnHit: !!(heroOpt.slowOnHit || wBonus.slowOnHit)
    };
    // Les statistiques du catalogue sont des bases « pour un héros de 100 PV / attaque 10 ». Si la coquille indique la part
    // de croissance due au NIVEAU (hero.baseAtk, hero.level), les ennemis grandissent d'autant : l'arme, l'armure et les
    // points de compétence restent le vrai avantage du joueur. Sans ces champs : aucune mise à l'échelle.
    var LV_ATK = num(heroOpt.baseAtk, 0) > 0 ? heroOpt.baseAtk / 10 : num(heroOpt.level, 0) > 1 ? 1 + 0.15 * (heroOpt.level - 1) : 1;
    var LV_HP = num(heroOpt.level, 0) > 1 ? 1 + 0.06 * (heroOpt.level - 1) : 1 + (LV_ATK - 1) * 0.4;
    LV_ATK = clamp(LV_ATK, 0.5, 30); LV_HP = clamp(LV_HP, 0.5, 30);
    H0.hp = clamp(num(heroOpt.hp, H0.maxHp), 1, H0.maxHp);
    var ATK_CD = (weapon.kind === "dagger" ? 0.26 : weapon.kind === "spear" ? 0.42 : weapon.kind === "staff" ? 0.38 : 0.34) / H0.atkSpeed;
    var spells = [];
    (opts.spells || []).slice(0, 3).forEach(function (s) {
      if (!s) return;
      var ref = findIn(cat && cat.spells, DEF_SPELLS, s.id) || {};
      spells.push({ id: s.id || ref.id || "spell", name: s.name || ref.name || String(s.id || "MAGIC!").toUpperCase(), fr: s.fr || ref.fr || "", emoji: s.emoji || ref.emoji || "✨",
        cooldown: Math.max(0.5, num(s.cooldown, num(ref.cooldown, 8))), power: Math.max(0.1, num(s.power, 1)), effect: s.effect || ref.effect || "projectile", cdT: 0, shown: -1, el: null });
    });
    var waves = [];
    (Array.isArray(opts.waves) ? opts.waves : []).forEach(function (w) {
      var list = [];
      (Array.isArray(w) ? w : [w]).forEach(function (g) { if (!g) return; var n = clamp(Math.round(num(g.n, 1)), 0, 12); for (var i = 0; i < n; i++) list.push(g.enemy || "mumblin"); });
      if (list.length) waves.push(list);
    });
    var bossDef = opts.boss ? (findIn(cat && cat.bosses, DEF_BOSSES, opts.boss) || null) : null;
    var arenaId = ARENAS[opts.arena] ? opts.arena : "meadow", arena = ARENAS[arenaId], darkArena = !!arena.dark;
    var potions0 = Math.max(0, Math.round(num(opts.potions, 0)));
    var POTION_HEAL = 0.4;
    (function () { var it = cat && cat.items, i; if (it) for (i = 0; i < it.length; i++) if (it[i].id === "potion" && it[i].heal) POTION_HEAL = it[i].heal; })();

    // ---------------------------------------------------------------- DOM
    var root = document.createElement("div");
    root.className = "cb-root" + (reduced ? " cb-reduced" : "");
    root.setAttribute("tabindex", "-1");
    var spellBtns = "";
    spells.forEach(function (s, i) {
      spellBtns += '<button type="button" class="cb-btn cb-btn-spell cb-s' + i + '" data-spell="' + i + '" aria-label="Sort ' + esc(s.name) + '"><span class="cb-ring"></span><span class="cb-emo">' + esc(s.emoji) + '</span><span class="cb-key">' + (i + 1) + "</span></button>";
    });
    root.innerHTML =
      '<canvas class="cb-canvas"></canvas>' +
      '<div class="cb-vignette"></div>' +
      '<div class="cb-hud">' +
        '<div class="cb-hp" aria-label="Points de vie"><svg class="cb-hp-heart" viewBox="0 0 32 30" aria-hidden="true"><path d="M16 28C4 19 2 13 2 9a7 7 0 0 1 14-2 7 7 0 0 1 14 2c0 4-2 10-14 19z" fill="#ff4d6d" stroke="#1d1b2b" stroke-width="3" stroke-linejoin="round"/><path d="M8 7.5c1.5-1.6 3.4-1.6 4.4-.6" stroke="#fff" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg><div class="cb-hp-bar"><div class="cb-hp-fill"></div><div class="cb-hp-txt"></div></div></div>' +
        '<div class="cb-wave"></div>' +
        '<button type="button" class="cb-pause" aria-label="Pause"><i></i><i></i></button>' +
      "</div>" +
      '<div class="cb-bossbar" hidden><div class="cb-boss-name"></div><div class="cb-boss-bar"><div class="cb-boss-fill"></div><div class="cb-boss-ticks"></div></div></div>' +
      '<div class="cb-joyzone"></div>' +
      '<div class="cb-joy" hidden><div class="cb-joy-knob"></div></div>' +
      '<div class="cb-pad">' +
        '<button type="button" class="cb-btn cb-btn-atk" aria-label="Attaque">' + SVG_ATK + '<span class="cb-key">Espace</span></button>' +
        '<button type="button" class="cb-btn cb-btn-dash" aria-label="Roulade"><span class="cb-ring"></span>' + SVG_DASH + '<span class="cb-key">Maj</span></button>' +
        '<button type="button" class="cb-btn cb-btn-potion" aria-label="Potion"><span class="cb-emo">🧪</span><span class="cb-count">0</span><span class="cb-key">E</span></button>' +
        spellBtns +
      "</div>" +
      '<div class="cb-hint" hidden></div>' +
      '<div class="cb-banner" hidden></div>' +
      '<div class="cb-rune" hidden><div class="cb-rune-head"><span class="cb-rune-title"></span><span class="cb-rune-pips"></span></div>' +
        '<div class="cb-rune-timer"><div class="cb-rune-timer-fill"></div></div>' +
        '<div class="cb-rune-q"><span class="cb-rune-hint"></span><span class="cb-rune-txt"><span class="cb-rune-prompt"></span><span class="cb-rune-sub"></span></span></div>' +
        '<div class="cb-rune-opts"></div><div class="cb-rune-msg"></div></div>' +
      '<div class="cb-overlay" hidden></div>';
    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
    function $(sel) { return root.querySelector(sel); }
    container.appendChild(root);
    try { if (root.getBoundingClientRect().height < 60) root.classList.add("cb-fixed"); } catch (err) { /* ignoré */ }
    var canvas = $(".cb-canvas"), ctx = canvas.getContext("2d");
    var elVignette = $(".cb-vignette"), elHpFill = $(".cb-hp-fill"), elHpTxt = $(".cb-hp-txt"), elHp = $(".cb-hp"), elWave = $(".cb-wave"), elPause = $(".cb-pause");
    var elBossBar = $(".cb-bossbar"), elBossName = $(".cb-boss-name"), elBossFill = $(".cb-boss-fill"), elBossTicks = $(".cb-boss-ticks");
    var elJoyZone = $(".cb-joyzone"), elJoy = $(".cb-joy"), elKnob = $(".cb-joy-knob"), elHud = $(".cb-hud"), elPad = $(".cb-pad");
    var elAtk = $(".cb-btn-atk"), elDash = $(".cb-btn-dash"), elPotion = $(".cb-btn-potion"), elCount = $(".cb-count");
    var elHint = $(".cb-hint"), elBanner = $(".cb-banner"), elOverlay = $(".cb-overlay");
    var elRune = $(".cb-rune"), elRuneTitle = $(".cb-rune-title"), elRunePips = $(".cb-rune-pips"), elRuneFill = $(".cb-rune-timer-fill"), elRuneHint = $(".cb-rune-hint"), elRunePrompt = $(".cb-rune-prompt"), elRuneSub = $(".cb-rune-sub"), elRuneOpts = $(".cb-rune-opts"), elRuneMsg = $(".cb-rune-msg");
    spells.forEach(function (s, i) { s.el = $(".cb-s" + i); });
    if (!spells.length) root.classList.add("cb-nospell");

    // ---------------------------------------------------------------- sprites (héros, Pico)
    function makeSprite(svg, fallback) {
      var c = document.createElement("canvas"); c.width = c.height = 192;
      var g = c.getContext("2d"); g.save(); g.scale(1.5, 1.5); fallback(g); g.restore();
      if (svg && typeof svg === "string" && svg.indexOf("<svg") >= 0) {
        try {
          var s = svg;
          if (s.indexOf("xmlns=") < 0) s = s.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
          var head = s.slice(s.indexOf("<svg"), s.indexOf(">", s.indexOf("<svg")) + 1);
          if (!/\swidth=/.test(head)) s = s.replace("<svg", '<svg width="192" height="192"');
          var img = new Image();
          img.onload = function () {
            if (destroyed) return;
            try { g.clearRect(0, 0, 192, 192); g.drawImage(img, 0, 0, 192, 192); } catch (err) { g.clearRect(0, 0, 192, 192); g.save(); g.scale(1.5, 1.5); fallback(g); g.restore(); }
            img.onload = img.onerror = null;
          };
          img.onerror = function () { img.onload = img.onerror = null; };
          img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
        } catch (err) { /* repli déjà dessiné */ }
      }
      return c;
    }
    var heroSprite = makeSprite(heroOpt.svg, paintHeroFallback);
    var petSprite = opts.pet ? makeSprite(opts.pet.svg, paintPetFallback) : null;
    var petRate = opts.pet ? clamp(num(opts.pet.rate, 1), 0.3, 4) : 0;

    // ---------------------------------------------------------------- mise en page / monde
    var W = 1, H = 1, dpr = 1, S = 1, WW = 390, WH = 700, portrait = true;
    var bx0 = 20, by0 = 90, bx1 = 370, by1 = 560;
    var bg = document.createElement("canvas"), bgInfo = { sea: [], foamY: 0 };
    var needLayout = true, layoutAt = 0, landHint = false, landHintShown = false;
    function layout() {
      needLayout = false;
      var r = root.getBoundingClientRect();
      W = Math.max(120, r.width || 390); H = Math.max(120, r.height || 700);
      dpr = Math.min(window.devicePixelRatio || 1, 3);
      if (W * H * dpr * dpr > 2600000) dpr = Math.sqrt(2600000 / (W * H));
      portrait = H >= W;
      S = clamp(Math.min(W / 390, H / (portrait ? 700 : 500)), 0.8, 2.2);   // monde ≈ 390 de large en portrait, ≈ 500 de haut en paysage
      WW = W / S; WH = H / S;
      var padScale = Math.min(W, H) >= 600 && W < 1100 ? 1.25 : 1;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      root.classList.toggle("cb-land", !portrait); root.style.setProperty("--cb-ps", "" + padScale);
      // HUD et boutons mesurés (ils tiennent compte des zones sûres iOS) : le terrain commence dessous et finit au-dessus
      var hudB = 62, safeB = 0, hr, pr;
      try { hr = elHud.getBoundingClientRect(); pr = elPad.getBoundingClientRect(); if (hr.bottom - r.top > 20) hudB = hr.bottom - r.top; if (r.bottom - pr.bottom > 0) safeB = r.bottom - pr.bottom; } catch (err) { /* ignoré */ }
      var topPx = hudB + 2 + (bossDef ? 40 : 0), botPx = (portrait ? 212 * padScale : 22) + safeB;
      bx0 = 22; bx1 = WW - 22; by0 = topPx / S + 30; by1 = WH - botPx / S - 8;
      if (by1 - by0 < 150) { by1 = WH - 14 - safeB / S; }
      if (by1 - by0 < 120) { by0 = Math.max(40, by1 - 120); }
      // marge de décor : dès que la hauteur le permet, on descend le terrain pour que le décor du haut dépasse sous le HUD
      by0 += clamp((by1 - by0 - 400) * 0.5, 8, 44);
      landHint = !portrait && H < 480;
      if (!landHint && landHintShown && hintT > 0 && elHint.textContent.indexOf("Tourne") >= 0) { hintT = 0; elHint.hidden = true; }   // revenu à la verticale : le conseil disparaît
      bg.width = canvas.width; bg.height = canvas.height;
      bgInfo.sea.length = 0; bgInfo.foamY = 0;
      var g = bg.getContext("2d");
      g.setTransform(dpr * S, 0, 0, dpr * S, 0, 0); g.lineJoin = "round"; g.lineCap = "round";
      try { arena.paint(g, WW, WH, mulberry(hashStr(arenaId)), { x0: bx0, y0: by0, x1: bx1, y1: by1 }, bgInfo); } catch (err) { g.fillStyle = arena.base; g.fillRect(0, 0, WW, WH); }
      edgeShade(g, WW, WH, darkArena ? 0.42 : 0.2);
      if (hero) { hero.x = clamp(hero.x, bx0, bx1); hero.y = clamp(hero.y, by0, by1); }
      for (var i = 0; i < enemies.length; i++) { enemies[i].x = clamp(enemies[i].x, bx0, bx1); enemies[i].y = clamp(enemies[i].y, by0, by1); }
      initAmbient();
      dirty = true;
    }

    // ---------------------------------------------------------------- entrées
    var inp = { jx: 0, jy: 0, joyId: -1, ox: 0, oy: 0, atkHeld: false, atkPtr: -1, atkBuf: 0, dashQ: false, botX: 0, botY: 0, botAtk: false };
    var keys = { up: false, down: false, left: false, right: false, atk: false }, kbdOn = false;
    var JOY_R = 46;
    function playing() { return !paused && !ended && (phase === "fight" || phase === "countdown" || phase === "intro"); }
    function rootPt(e) { var r = root.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function joyReset() {
      inp.joyId = -1; inp.jx = inp.jy = 0; elJoy.hidden = true; elKnob.style.transform = "translate(-50%,-50%)"; root.classList.remove("cb-joying");
    }
    function setKbd(on) { if (kbdOn !== on) { kbdOn = on; root.classList.toggle("cb-kbd", on); } }
    function onJoyDown(e) {
      if (inp.joyId !== -1 || !playing()) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      var p = rootPt(e);
      inp.joyId = e.pointerId; inp.ox = p.x; inp.oy = p.y; inp.jx = inp.jy = 0;
      try { elJoyZone.setPointerCapture(e.pointerId); } catch (err) { /* ignoré */ }
      elJoy.style.left = p.x + "px"; elJoy.style.top = p.y + "px"; elJoy.hidden = false; root.classList.add("cb-joying");
    }
    function onPtrMove(e) {
      if (e.pointerId !== inp.joyId) return;
      var p = rootPt(e), dx = p.x - inp.ox, dy = p.y - inp.oy, d = Math.sqrt(dx * dx + dy * dy);
      if (d > JOY_R) { // la base suit le pouce
        inp.ox += dx / d * (d - JOY_R); inp.oy += dy / d * (d - JOY_R); dx = dx / d * JOY_R; dy = dy / d * JOY_R; d = JOY_R;
        elJoy.style.left = inp.ox + "px"; elJoy.style.top = inp.oy + "px";
      }
      var m = d < 7 ? 0 : Math.min(1, (d - 7) / (JOY_R - 14));
      inp.jx = d ? dx / d * m : 0; inp.jy = d ? dy / d * m : 0;
      elKnob.style.transform = "translate(calc(-50% + " + dx.toFixed(1) + "px), calc(-50% + " + dy.toFixed(1) + "px))";
    }
    function onPtrUp(e) {
      if (e.pointerId === inp.joyId) joyReset();
      if (e.pointerId === inp.atkPtr) { inp.atkPtr = -1; inp.atkHeld = false; elAtk.classList.remove("cb-down"); }
    }
    function press(el) { el.classList.add("cb-tap"); tapEls.push(el); tapTs.push(T + 0.14); }
    var tapEls = [], tapTs = [];
    function onAtkDown(e) { e.preventDefault(); if (!playing()) return; inp.atkHeld = true; inp.atkPtr = e.pointerId; inp.atkBuf = 0.3; elAtk.classList.add("cb-down"); try { elAtk.setPointerCapture(e.pointerId); } catch (err) { /* ignoré */ } }
    function onDashDown(e) { e.preventDefault(); if (!playing()) return; inp.dashQ = true; press(elDash); }
    function onPotionDown(e) { e.preventDefault(); if (!playing()) return; press(elPotion); usePotion(); }
    function onSpellDown(e) { e.preventDefault(); if (!playing()) return; var i = +e.currentTarget.getAttribute("data-spell"); press(e.currentTarget); pressSpell(i); }
    function onRuneDown(e) {
      var t = e.target; while (t && t !== elRune && !(t.getAttribute && t.getAttribute("data-opt") != null)) t = t.parentNode;
      if (!t || t === elRune) return;
      e.preventDefault(); answerRune(+t.getAttribute("data-opt"));
    }
    function onOverlayClick(e) {
      if (tuto) return;
      var t = e.target; while (t && t !== elOverlay && !(t.getAttribute && t.getAttribute("data-act"))) t = t.parentNode;
      if (!t || t === elOverlay) { if (phase === "intro" && !paused) introT = Math.min(introT, 0.05); return; }
      var act = t.getAttribute("data-act"); sfx("click");
      if (act === "resume") resume();
      else if (act === "restart") restart(false);
      else if (act === "retry") restart(false);
      else if (act === "easy") restart(true);
      else if (act === "quit") finish(false, true);
    }
    function keyDir(e) {
      var k = e.key && e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (k === "ArrowUp" || k === "w" || k === "z") return "up";
      if (k === "ArrowDown" || k === "s") return "down";
      if (k === "ArrowLeft" || k === "a" || k === "q") return "left";
      if (k === "ArrowRight" || k === "d") return "right";
      return null;
    }
    function keyDigit(e) {
      var c = e.code || "";
      if (c === "Digit1" || c === "Numpad1" || e.key === "1") return 0;
      if (c === "Digit2" || c === "Numpad2" || e.key === "2") return 1;
      if (c === "Digit3" || c === "Numpad3" || e.key === "3") return 2;
      return -1;
    }
    function onKeyDown(e) {
      if (destroyed || ended) return;
      var tg = e.target, tn = tg && tg.tagName;
      if (tn === "INPUT" || tn === "TEXTAREA" || tn === "SELECT" || (tg && tg.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var k = e.key, d = keyDir(e), n;
      if (tuto) return;
      if (k === "Escape" || k === "p" || k === "P") { e.preventDefault(); if (!e.repeat) { if (paused) resume(); else if (phase !== "defeat" && phase !== "victory") pause(); } return; }
      if (paused || phase === "defeat") return;
      if (d || k === " " || k === "Shift" || e.code === "Space" || keyDigit(e) >= 0 || k === "e" || k === "E") setKbd(true);   // un vrai clavier : on montre les touches
      if (d) { keys[d] = true; e.preventDefault(); return; }
      if (k === " " || k === "Spacebar" || e.code === "Space") { e.preventDefault(); if (!e.repeat) { keys.atk = true; inp.atkBuf = 0.3; if (phase === "intro") introT = Math.min(introT, 0.05); } return; }
      if (k === "Shift") { if (!e.repeat) inp.dashQ = true; return; }
      n = keyDigit(e);
      if (n >= 0) { e.preventDefault(); if (e.repeat) return; if (rune) answerRune(n); else pressSpell(n); return; }
      if (k === "e" || k === "E") { if (!e.repeat) usePotion(); return; }
    }
    function onKeyUp(e) {
      var d = keyDir(e);
      if (d) keys[d] = false;
      if (e.key === " " || e.key === "Spacebar" || e.code === "Space") keys.atk = false;
    }
    function clearInput() { keys.up = keys.down = keys.left = keys.right = keys.atk = false; inp.atkHeld = false; inp.atkPtr = -1; inp.dashQ = false; elAtk.classList.remove("cb-down"); joyReset(); }
    function onVis() { if (document.hidden && !paused && !ended && phase !== "defeat" && phase !== "victory") pause(); lastNow = 0; }
    function onBlur() { keys.up = keys.down = keys.left = keys.right = keys.atk = false; }
    function onResize() { needLayout = true; }
    function prevent(e) { if (e.cancelable) e.preventDefault(); }

    on(elJoyZone, "pointerdown", onJoyDown);
    on(window, "pointermove", onPtrMove);
    on(window, "pointerup", onPtrUp);
    on(window, "pointercancel", onPtrUp);
    on(elAtk, "pointerdown", onAtkDown);
    on(elDash, "pointerdown", onDashDown);
    on(elPotion, "pointerdown", onPotionDown);
    spells.forEach(function (s) { on(s.el, "pointerdown", onSpellDown); });
    on(elRune, "pointerdown", onRuneDown);
    on(elOverlay, "click", onOverlayClick);
    on(elPause, "click", function () { if (tuto) return; if (paused) resume(); else if (!ended && phase !== "defeat" && phase !== "victory") pause(); });
    on(window, "keydown", onKeyDown);
    on(window, "keyup", onKeyUp);
    on(window, "blur", onBlur);
    on(window, "resize", onResize);
    on(document, "visibilitychange", onVis);
    on(root, "contextmenu", prevent);
    on(root, "selectstart", prevent);
    on(root, "dragstart", prevent);
    on(root, "gesturestart", prevent);
    on(root, "touchmove", prevent, { passive: false });
    on(root, "dblclick", prevent);
    var resizeObs = null;
    if (typeof ResizeObserver !== "undefined") { resizeObs = new ResizeObserver(onResize); resizeObs.observe(root); }

    // ---------------------------------------------------------------- état du jeu
    var phase = "intro", T = 0, fightT = 0, ts = 1, hitstop = 0, dirty = true, lastNow = 0;
    var introT = 0, cdN = 0, cdT = 0, victoryT = 0, endT = 0;
    var waveI = -1, pendingNext = 0, bossOn = false, bossDone = false, boss = null;
    var enemies = [], spawnQ = [], spawnQi = 0, spawnT = 0;
    var kills = 0, quizOk = 0, quizTotal = 0, potionsUsed = 0, potions = potions0, tries = 0, defeats = 0;
    var shake = 0, shakeX = 0, shakeY = 0, flashA = 0, slowFx = 0, hurtFx = 0, iceFx = { t: 0, x: 0, y: 0, r: 0 }, windFx = { t: 0, x: 0, y: 0 };
    var rune = null, shieldSeq = null, lastPrompt = null, stampN = 1;
    var bannerT = 0, hintT = 0, hintCd = 0, shieldMsgCd = 0;
    var hero = null, pet = null;
    var TELE = clamp(1 / Math.sqrt(difficulty), 0.86, 1.3);
    var LETTERS = "ABCDEFGHIJKLMNOPRSTUWY";
    var EP = {
      mumblin: { windT: 0.6, zr: 38, atkCd: 1.1 }, blot: { windT: 0.8, zr: 48, atkCd: 1.5 }, blotling: { windT: 0.6, zr: 30, atkCd: 1.1 },
      frostling: { windT: 0.65, zr: 40, atkCd: 1.3 }, hushguard: { windT: 0.9, zr: 50, atkCd: 1.7 },
      shushbat: { windT: 0.65 }, spitter: { windT: 0.7 }, whisper: { windT: 0.7 }, silent_knight: { windT: 0.95 }
    };

    // ---------------------------------------------------------------- pools (aucune allocation dans la boucle)
    var MAXP = reduced ? 150 : 340, parts = [], partI = 0, nums = [], numI = 0, projs = [], hz = [], bolts = [], stars = [], delayed = [], i0;
    for (i0 = 0; i0 < MAXP; i0++) parts.push({ a: false, type: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, col: "#fff", ch: "", rot: 0, vr: 0, drag: 2, grav: 0, lw: 3 });
    for (i0 = 0; i0 < 22; i0++) nums.push({ a: false, x: 0, y: 0, vy: 0, life: 0, max: 1, txt: "", col: "#fff", size: 15 });
    for (i0 = 0; i0 < 48; i0++) projs.push({ a: false, x: 0, y: 0, vx: 0, vy: 0, r: 6, dmg: 0, life: 0, type: 0, friendly: false, stamp: 0, home: 0, em: 0 });
    for (i0 = 0; i0 < 44; i0++) hz.push({ a: false, type: 0, x: 0, y: 0, r: 0, t: 0, delay: 1, dmg: 0, owner: null, fx: 0, done: false, slow: 0, ang: 0, len: 0, w: 0, half: 0, gapA: 0, gap: 0, speed: 0, rmax: 0, hit: false });
    for (i0 = 0; i0 < 8; i0++) bolts.push({ a: false, n: 0, pts: new Float32Array(24), life: 0 });
    for (i0 = 0; i0 < 16; i0++) stars.push({ a: false, tx: 0, ty: 0, delay: 0, t: 0, dmg: 0 });
    for (i0 = 0; i0 < 6; i0++) delayed.push({ a: false, t: 0, i: 0, pw: 1 });

    function part(type, x, y, vx, vy, life, size, col, ch) {
      var p = parts[partI]; partI = (partI + 1) % MAXP;
      p.a = true; p.type = type; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = p.max = life; p.size = size; p.col = col; p.ch = ch || "";
      p.rot = Math.random() * TAU; p.vr = (Math.random() - 0.5) * 8; p.drag = 2.4; p.grav = 0; p.lw = 3;
      return p;
    }
    function burst(x, y, n, col, s0, s1, size, life, type) {
      if (simulating) return;
      if (reduced) n = (n + 1) >> 1;
      for (var i = 0; i < n; i++) { var a = Math.random() * TAU, s = rnd(s0, s1); part(type || 0, x, y, Math.cos(a) * s, Math.sin(a) * s, life * rnd(0.7, 1.2), size * rnd(0.6, 1.2), col); }
    }
    function ringFx(x, y, r0, grow, life, col, lw) { if (simulating) return; var p = part(3, x, y, grow, 0, life, r0, col); p.lw = lw || 3; p.drag = 0; }
    function floatTxt(x, y, txt, col, size) {
      if (simulating) return;
      var d = nums[numI]; numI = (numI + 1) % nums.length;
      d.a = true; d.x = x + rnd(-7, 7); d.y = y; d.vy = -48; d.life = d.max = 0.85; d.txt = txt; d.col = col; d.size = size || 15;
    }
    function addShake(a) { if (!reduced && !simulating) shake = Math.max(shake, a); }
    function hazard(type, x, y, r, delay, dmg, owner, fx) {
      var h = null, i;
      for (i = 0; i < hz.length; i++) if (!hz[i].a) { h = hz[i]; break; }
      if (!h) return null;
      h.a = true; h.type = type; h.x = x; h.y = y; h.r = r; h.delay = Math.max(0.5, delay); h.t = 0; h.dmg = dmg; h.owner = owner || null; h.fx = fx || 0; h.done = false;
      h.slow = 0; h.ang = 0; h.len = 0; h.w = 0; h.half = 0; h.gapA = 0; h.gap = 0; h.speed = 0; h.rmax = 0; h.hit = false;
      return h;
    }
    function lineHazard(x, y, ang, len, w, delay, dmg, owner, fx) { var h = hazard(1, x, y, 0, delay, dmg, owner, fx); if (h) { h.ang = ang; h.len = len; h.w = w; } return h; }
    function shoot(type, x, y, vx, vy, r, dmg, life, friendly) {
      var p = null, i;
      for (i = 0; i < projs.length; i++) if (!projs[i].a) { p = projs[i]; break; }
      if (!p) return null;
      p.a = true; p.type = type; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.r = r; p.dmg = dmg; p.life = life; p.friendly = !!friendly; p.stamp = stampN++; p.home = 0; p.em = 0;
      return p;
    }
    function clearPools() {
      var i;
      for (i = 0; i < parts.length; i++) parts[i].a = false;
      for (i = 0; i < nums.length; i++) nums[i].a = false;
      for (i = 0; i < projs.length; i++) projs[i].a = false;
      for (i = 0; i < hz.length; i++) { hz[i].a = false; hz[i].owner = null; }
      for (i = 0; i < bolts.length; i++) bolts[i].a = false;
      for (i = 0; i < stars.length; i++) stars[i].a = false;
      for (i = 0; i < delayed.length; i++) delayed[i].a = false;
    }
    function wallDist(x, y, ang, max) { // distance jusqu'au bord de l'arène le long d'une direction
      var c = Math.cos(ang), s = Math.sin(ang), t = max;
      if (c > 0.001) t = Math.min(t, (bx1 - x) / c); else if (c < -0.001) t = Math.min(t, (bx0 - x) / c);
      if (s > 0.001) t = Math.min(t, (by1 - y) / s); else if (s < -0.001) t = Math.min(t, (by0 - y) / s);
      return Math.max(40, t);
    }

    // ---------------------------------------------------------------- héros
    function resetHero() {
      hero = { x: (bx0 + bx1) / 2, y: by0 + (by1 - by0) * 0.64, r: 13, face: 1, hp: H0.hp, maxHp: H0.maxHp, atk: H0.atk, aimA: 0, atkT: 0, atkDur: 0.18, atkCd: 0, combo: 0, comboT: 0, swing: 1, third: false, hitPend: false,
        dashT: 0, dashCdT: 0, ddx: 1, ddy: 0, dodgeT: 0, invT: 0, shieldT: 0, slowT: 0, hurtT: 0, walk: 0, moving: false, lx: 0, ly: 0, echo: 0, healT: 0, potT: 0, pingT: 0, mx: 0, my: 0, sq: 0, dust: 0, fall: 0 };
      pet = petSprite ? { x: hero.x - 31, y: hero.y - 56, st: 0, cd: 2.5, tgt: null, t: 0, face: 1 } : null;
    }
    function nearestEnemy(x, y, maxD, skipArmor) {
      var best = null, bd = maxD * maxD, i, e, dx, dy, d;
      for (i = 0; i < enemies.length; i++) {
        e = enemies[i];
        if (e.dead || e.spawnT > 0 || e.alpha < 0.5) continue;
        if (skipArmor && (e.armor && !(e.crackT > 0) || e.shield)) continue;
        dx = e.x - x; dy = e.y - y; d = dx * dx + dy * dy - e.r * e.r;
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    }
    function hurtHero(dmg, sx, sy) {
      var h = hero;
      if (phase !== "fight" || h.hp <= 0) return false;
      if (h.shieldT > 0) { if (!simulating && h.pingT <= 0) { ringFx(h.x, h.y - 18, 22, 60, 0.3, "#9fe0ff", 3); h.pingT = 0.25; } return true; }
      if (h.invT > 0 || h.dodgeT > 0) return false;
      dmg = Math.max(1, Math.round(dmg));
      h.hp = Math.max(0, h.hp - dmg); h.invT = 1.0; h.hurtT = 0.28; h.sq = -0.25;
      var dx = h.x - sx, dy = h.y - sy, d = Math.sqrt(dx * dx + dy * dy) || 1;
      h.lx += dx / d * 260; h.ly += dy / d * 260;
      addShake(7); hurtFx = 1; sfx("hurt"); vib(70);
      floatTxt(h.x, h.y - 44, "-" + dmg, "#ff5a5a", 18);
      burst(h.x, h.y - 20, 6, "#ffffff", 60, 150, 3, 0.35, 2);
      if (h.hp <= 0) lose();
      return true;
    }
    function healHero(n, col) {
      var h = hero, before = h.hp;
      h.hp = Math.min(h.maxHp, h.hp + Math.max(1, Math.round(n))); h.healT = 1;
      floatTxt(h.x, h.y - 46, "+" + Math.round(h.hp - before), col || "#4be07a", 18);
      if (!simulating) for (var i = 0; i < (reduced ? 5 : 10); i++) { var p = part(8, h.x + rnd(-16, 16), h.y - rnd(0, 30), rnd(-10, 10), rnd(-70, -30), rnd(0.6, 1), rnd(4, 6.5), col || "#4be07a"); p.drag = 0.5; }
    }
    function startDash(mx, my, m) {
      var h = hero;
      if (m > 0.1) { h.ddx = mx / m; h.ddy = my / m; } else { h.ddx = h.face; h.ddy = 0; }
      if (Math.abs(h.ddx) > 0.2) h.face = h.ddx > 0 ? 1 : -1;
      h.dashT = 0.26; h.dashCdT = H0.dashCd; h.dodgeT = 0.42; h.atkT = 0; h.hitPend = false;
      sfx("dash"); burst(h.x, h.y, 5, "#ffffff", 20, 70, 5, 0.4, 6);
    }
    function doAttack() {
      var h = hero, tgt = nearestEnemy(h.x, h.y, weapon.reach + 95, false), a, dx, dy, d, gap;
      if (tgt) { dx = tgt.x - h.x; dy = tgt.y - h.y; a = Math.atan2(dy, dx); }
      else a = h.moving ? Math.atan2(h.my, h.mx) : (h.face > 0 ? 0 : PI);
      h.aimA = a;
      if (Math.abs(Math.cos(a)) > 0.15) h.face = Math.cos(a) > 0 ? 1 : -1;
      h.combo = (h.comboT > 0 ? h.combo % 3 : 0) + 1; h.comboT = 0.9;
      h.third = h.combo === 3;
      h.atkDur = h.third ? 0.26 : 0.17; h.atkT = h.atkDur; h.atkCd = ATK_CD * (h.third ? 1.4 : 1);
      h.swing = h.combo === 2 ? -1 : 1; h.hitPend = true; h.sq = 0.16;
      if (tgt) {
        d = Math.sqrt(dx * dx + dy * dy) || 1; gap = d - tgt.r - weapon.reach * 0.7;
        if (gap > 0) { gap = Math.min(gap, 34); h.lx += dx / d * gap * 14; h.ly += dy / d * gap * 14; }
      }
      sfx("swing");
    }
    function swingHits() {
      var h = hero, third = h.third, R = weapon.reach + (third ? 10 : 0), half = third ? 4 : 1.2, dmg = h.atk * (third ? 1.7 : 1), any = 0, i, e, dx, dy, dd, d, res, k;
      for (i = enemies.length - 1; i >= 0; i--) {
        e = enemies[i];
        if (e.dead || e.spawnT > 0 || e.alpha < 0.5) continue;
        dx = e.x - h.x; dy = e.y - h.y; dd = Math.sqrt(dx * dx + dy * dy) || 1; d = dd - e.r;
        if (d > R) continue;
        if (d > 10 && Math.abs(angDiff(Math.atan2(dy, dx), h.aimA)) > half) continue;
        k = third ? 200 : 115;
        res = hitEnemy(e, dmg * rnd(0.92, 1.08), "sword", dx / dd * k, dy / dd * k, third);
        if (res === 1) { any = 1; if (H0.slowOnHit && !e.boss) e.slowT = Math.max(e.slowT, 1.2); }
      }
      if (any) { if (!simulating) hitstop = third ? 0.06 : 0.03; addShake(third ? 5 : 2.5); vib(third ? 22 : 10); sfx(third ? "crit" : "hit"); }
    }
    function usePotion() {
      var h = hero;
      if (phase !== "fight" || rune || paused || !h || h.hp <= 0 || h.potT > 0) return false;
      if (potions <= 0) { floatTxt(h.x, h.y - 50, "Plus de potion…", "#ffffff", 15); h.potT = 0.6; return false; }
      if (h.hp >= h.maxHp) { floatTxt(h.x, h.y - 50, "PV au max !", "#ffffff", 15); h.potT = 0.6; return false; }
      potions--; potionsUsed++; h.potT = 1;
      healHero(h.maxHp * POTION_HEAL, "#ff7fb0"); sfx("potion"); ringFx(h.x, h.y - 16, 10, 90, 0.4, "#ff9ac4", 4);
      return true;
    }
    function updHero(dt, rdt) {
      var h = hero, mx = inp.jx + inp.botX + (keys.right ? 1 : 0) - (keys.left ? 1 : 0), my = inp.jy + inp.botY + (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
      var m = Math.sqrt(mx * mx + my * my), sp, f;
      if (m > 1) { mx /= m; my /= m; m = 1; }
      h.mx = mx; h.my = my; h.moving = m > 0.08;
      if (h.atkCd > 0) h.atkCd -= dt;
      if (h.comboT > 0) { h.comboT -= dt; if (h.comboT <= 0) h.combo = 0; }
      if (h.invT > 0) h.invT -= dt;
      if (h.dodgeT > 0) h.dodgeT -= dt;
      if (h.shieldT > 0) h.shieldT -= dt;
      if (h.slowT > 0) h.slowT -= dt;
      if (h.hurtT > 0) h.hurtT -= dt;
      if (h.dashCdT > 0) h.dashCdT -= dt;
      if (h.healT > 0) h.healT -= dt;
      if (h.potT > 0) h.potT -= rdt;
      if (h.pingT > 0) h.pingT -= rdt; else h.pingT = 0;
      if (inp.atkBuf > 0) inp.atkBuf -= rdt;
      if (h.atkT > 0) {
        h.atkT -= dt;
        if (h.hitPend && h.atkT <= h.atkDur * 0.55) { h.hitPend = false; swingHits(); }
      }
      if (h.dashT > 0) {
        h.dashT -= dt; sp = H0.spd * 3.0;
        h.x += h.ddx * sp * dt; h.y += h.ddy * sp * dt;
        h.dust -= dt; if (h.dust <= 0 && !simulating) { h.dust = 0.05; part(6, h.x, h.y, rnd(-15, 15), rnd(-15, 5), 0.35, 6, "#ffffff"); }
        if (h.dashT <= 0) h.sq = -0.22;
      } else {
        sp = H0.spd * (h.slowT > 0 ? 0.6 : 1) * (h.atkT > 0 ? 0.62 : 1);
        h.x += mx * sp * dt; h.y += my * sp * dt;
        if (h.moving) { h.walk += dt * 11 * (0.5 + m * 0.5); if (h.atkT <= 0 && Math.abs(mx) > 0.15) h.face = mx > 0 ? 1 : -1; }
        if (inp.dashQ && h.dashCdT <= 0) startDash(mx, my, m);
      }
      inp.dashQ = false;
      if (h.lx || h.ly) {
        h.x += h.lx * dt; h.y += h.ly * dt; f = Math.exp(-14 * dt); h.lx *= f; h.ly *= f;
        if (Math.abs(h.lx) + Math.abs(h.ly) < 2) h.lx = h.ly = 0;
      }
      h.x = clamp(h.x, bx0, bx1); h.y = clamp(h.y, by0, by1);
      if ((inp.atkHeld || keys.atk || inp.botAtk || inp.atkBuf > 0) && h.atkCd <= 0 && h.dashT <= 0) { inp.atkBuf = 0; doAttack(); }
      if (H0.regen > 0 && h.hp > 0 && h.hp < h.maxHp) h.hp = Math.min(h.maxHp, h.hp + H0.regen * dt);
      if (h.sq) { h.sq *= Math.exp(-10 * dt); if (Math.abs(h.sq) < 0.005) h.sq = 0; }
    }
    function updPet(dt) {
      var p = pet, h = hero, tx, ty, dx, dy, d, e, sp;
      p.t += dt;
      if (p.st === 0) {
        tx = h.x - h.face * 31; ty = h.y - 56 + Math.sin(p.t * 3) * 5;
        dx = tx - p.x; dy = ty - p.y; p.x += dx * Math.min(1, dt * 5); p.y += dy * Math.min(1, dt * 5);
        if (Math.abs(dx) > 3) p.face = dx > 0 ? 1 : -1; else p.face = h.face;
        p.cd -= dt * petRate;
        if (p.cd <= 0) {
          e = nearestEnemy(h.x, h.y, 230, true);
          if (e) { p.tgt = e; p.st = 1; } else p.cd = 0.6;
        }
      } else if (p.st === 1) {
        e = p.tgt;
        if (!e || e.dead || e.alpha < 0.5) { p.st = 0; p.tgt = null; p.cd = 1.5; return; }
        dx = e.x - p.x; dy = e.y - e.r - p.y; d = Math.sqrt(dx * dx + dy * dy) || 1; sp = 520 * dt;
        p.face = dx > 0 ? 1 : -1;
        if (d <= sp + 6) {
          hitEnemy(e, h.atk * 0.5, "pet", dx / d * 60, dy / d * 60, false);
          sfx("pet"); burst(e.x, e.y - e.r, 4, "#7ee02a", 40, 110, 3, 0.4, 7);
          p.st = 0; p.tgt = null; p.cd = rnd(4, 5.5);
        } else { p.x += dx / d * sp; p.y += dy / d * sp; }
      }
    }

    // ---------------------------------------------------------------- ennemis
    function spawnPoint(e) {
      var k, side, x = 0, y = 0, dx, dy;
      for (k = 0; k < 8; k++) {
        side = Math.random();
        if (side < 0.44) { x = rnd(bx0 + 10, bx1 - 10); y = by0 + rnd(4, 26); }
        else if (side < 0.7) { x = bx0 + rnd(2, 18); y = rnd(by0 + 10, by1 - 30); }
        else if (side < 0.96) { x = bx1 - rnd(2, 18); y = rnd(by0 + 10, by1 - 30); }
        else { x = rnd(bx0 + 10, bx1 - 10); y = by1 - rnd(2, 14); }
        dx = x - hero.x; dy = y - hero.y;
        if (dx * dx + dy * dy > 130 * 130) break;
      }
      e.x = x; e.y = y;
    }
    function makeEnemy(id, x, y, quick) {
      var mini = id === "blotling", def = findIn(cat && cat.enemies, DEF_ENEMIES, mini ? "blot" : id) || DEF_ENEMIES[0];
      var key = mini ? "blotling" : def.id, ep = EP[key] || EP.mumblin, col = def.color || "#4B4B6A";
      var e = { id: key, kind: mini ? "chase" : (def.behavior || "chase"), boss: false, x: 0, y: 0, r: mini ? 12 : (ENEMY_R[def.id] || 15),
        hp: 1, maxHp: 1, atk: 1, spd: 60, state: "move", st: 0, wt: 1, cd: rnd(0.5, 1.4), face: 1, t: rnd(0, 6), moving: false, wp: 0, kx: 0, ky: 0,
        stunT: 0, freezeT: 0, slowT: 0, hitT: 0, spawnT: quick ? 0.25 : 0.75, spawn0: quick ? 0.25 : 0.75, dx: 1, dy: 0, len: 0, ax: 0, armor: false, crackT: 0, alpha: 1, ly: 0,
        col: col, c0: col, c1: shade(col, 0.28), c2: shade(col, -0.3), fly: false, dead: false, stamp: 0, hitOnce: false, orb: Math.random() < 0.5 ? 1 : -1,
        phase: 0, shield: false, thrI: 0, pat: 0, shots: 0, punish: false, windT: Math.max(0.5, (ep.windT || 0.6) * TELE), zr: ep.zr || 38, atkCd: (ep.atkCd || 1.2) / clamp(difficulty, 0.7, 1.3),
        paint: PAINT[key] || PAINT.mumblin, rules: null, name: def.fr || def.name || key };
      e.maxHp = e.hp = Math.max(1, Math.round(num(def.hp, 20) * TUNING.enemyHp * LV_ATK * (mini ? 0.36 : 1) * difficulty));
      e.atk = Math.max(1, num(def.atk, 8) * TUNING.enemyAtk * LV_HP * (mini ? 0.6 : 1) * difficulty);
      e.spd = HERO_SPEED * num(def.speed, 0.5) * (mini ? 1.6 : 1) * (0.85 + 0.15 * difficulty);
      if (e.kind === "armored") e.armor = true;
      if (e.kind === "swoop" || e.kind === "teleport") e.fly = true;
      if (x == null) spawnPoint(e); else { e.x = clamp(x, bx0, bx1); e.y = clamp(y, by0, by1); }
      e.face = hero.x >= e.x ? 1 : -1;
      enemies.push(e);
      if (!quick) sfx("spawn");
      return e;
    }
    function makeBoss(def) {
      var rules = BOSS_RULES[def.id] || { thr: [0.5], need: [3], r: 38 }, col = def.color || "#3B3B5C";
      var e = makeEnemy("mumblin", (bx0 + bx1) / 2, by0 + 80, false);
      e.id = def.id; e.kind = "boss"; e.boss = true; e.r = rules.r; e.rules = rules; e.name = def.name || def.id;
      e.h = { grumble: 98, bramble: 94, captain_blank: 98, glacia: 100, lord_hush: 118 }[def.id] || 96;
      e.maxHp = e.hp = Math.max(1, Math.round(num(def.hp, 300) * TUNING.bossHp * LV_ATK * difficulty)); e.atk = Math.max(1, num(def.atk, 14) * TUNING.bossAtk * LV_HP * difficulty);
      e.spd = HERO_SPEED * num(def.speed, 0.4) * (0.85 + 0.15 * difficulty);
      e.col = col; e.c0 = col; e.c1 = shade(col, 0.25); e.c2 = shade(col, -0.3); e.paint = PAINT[def.id] || PAINT.grumble;
      e.spawnT = e.spawn0 = 1.3; e.cd = 1.4; e.fly = def.id === "captain_blank" || def.id === "lord_hush" || def.id === "glacia";
      return e;
    }
    function minionCount() { var n = 0, i; for (i = 0; i < enemies.length; i++) if (!enemies[i].boss && !enemies[i].dead) n++; return n; }
    function disable(e) { // interrompt l'attaque en cours (étourdi / gelé)
      if (e.state !== "move") { e.state = "move"; e.cd = Math.max(e.cd, 0.7); }
      e.wp = 0; if (e.alpha < 1) e.alpha = 1;
      if (e.punish) e.punish = false;
    }
    function stun(e, dur) { if (e.dead || e.shield) return; if (e.boss) dur *= 0.5; e.stunT = Math.max(e.stunT, dur); disable(e); }
    function freeze(e, dur) { if (e.dead || e.shield) return; if (e.boss) { e.slowT = Math.max(e.slowT, dur); return; } e.freezeT = Math.max(e.freezeT, dur); disable(e); }
    function showHint(txt, dur) {
      if (simulating) return;
      elHint.textContent = txt; elHint.hidden = false; hintT = dur || 2.2;
    }
    function breakArmor(e, permanent) {
      if (!e.armor) return;
      if (permanent) { e.armor = false; e.crackT = 0; burst(e.x, e.y - 20, 10, "#b9bdc9", 70, 200, 5, 0.6, 2); ringFx(e.x, e.y - 18, 10, 150, 0.35, "#ffffff", 3); floatTxt(e.x, e.y - 50, "Armure brisée !", "#ffe066", 13); }
      else e.crackT = Math.max(e.crackT, 5);
    }
    // retour : 0 = rien, 1 = touché, 2 = « cling »
    function hitEnemy(e, dmg, kind, kx, ky, crit) {
      if (e.dead || e.spawnT > 0) return 0;
      if (e.boss && e.shield) {
        if (shieldMsgCd <= 0 && kind !== "pet") { shieldMsgCd = 1.2; floatTxt(e.x, e.y - e.r * 2 - 10, "Bouclier !", "#d9c2ff", 14); ringFx(e.x, e.y - e.r, e.r + 14, 40, 0.25, "#c9a8ff", 3); }
        return 0;
      }
      if (e.armor && !(e.crackT > 0)) {
        if (kind === "spell") breakArmor(e, true);
        else {
          if (kind === "sword") {
            sfx("cling"); burst(e.x, e.y - 22, 4, "#fff3b0", 80, 180, 3, 0.25, 2); e.kx += kx * 0.3; e.ky += ky * 0.3;
            if (hintCd <= 0) { hintCd = 4; showHint(spells.length ? "Armure ! Utilise un sort !" : "Armure épaisse…", 2.4); if (!simulating) { root.classList.remove("cb-nudge"); void root.offsetWidth; root.classList.add("cb-nudge"); } }
            if (spells.length) return 2;
            dmg *= 0.25;
          } else return 0;
        }
      }
      dmg = Math.max(1, Math.round(dmg));
      e.hp -= dmg; e.hitT = 0.12;
      if (!e.boss) { e.kx += kx; e.ky += ky; }
      floatTxt(e.x, e.y - (e.boss ? e.r * 2 : e.r * 2 + 6), "" + dmg, crit ? "#ffd34d" : kind === "spell" ? "#9fe8ff" : "#ffffff", crit ? 19 : 15);
      if (!simulating) part(0, e.x + rnd(-6, 6), e.y - e.r, rnd(-60, 60), rnd(-90, -20), 0.35, 3.5, e.col);
      if (e.boss && e.rules && e.thrI < e.rules.thr.length) {
        var lim = e.maxHp * e.rules.thr[e.thrI];
        if (e.hp <= lim) { e.hp = Math.max(1, Math.ceil(lim)); startShield(e); return 1; }
      }
      if (e.hp <= 0) killEnemy(e, false);
      return 1;
    }
    function killEnemy(e, silent) {
      if (e.dead) return;
      e.dead = true; e.hp = 0;
      if (!silent) kills++;
      var y = e.y - e.r, i, p;
      burst(e.x, y, e.boss ? 40 : 12, e.col, 60, e.boss ? 320 : 200, e.boss ? 8 : 5.5, 0.6);
      burst(e.x, y, e.boss ? 16 : 5, "#14121f", 40, 150, 4, 0.5);
      ringFx(e.x, y, e.r * 0.6, e.boss ? 320 : 160, 0.4, "#ffffff", 3);
      if (!simulating) for (i = 0; i < (e.boss ? 14 : reduced ? 2 : 4); i++) {
        p = part(1, e.x + rnd(-e.r, e.r), y + rnd(-8, 8), rnd(-40, 40), rnd(-120, -60), rnd(0.9, 1.4), rnd(13, 18), i % 2 ? "#fff6c9" : "#ffffff", LETTERS.charAt((Math.random() * LETTERS.length) | 0));
        p.drag = 0.8; p.vr = rnd(-2, 2);
      }
      if (!silent) sfx("pouf");
      if (e.id === "blot" && !silent) {
        var a = makeEnemy("blotling", e.x - 14, e.y, true), b = makeEnemy("blotling", e.x + 14, e.y, true);
        a.kx = -140; b.kx = 140; a.ky = b.ky = -40;
      }
      if (e.boss) bossDead(e);
    }
    function bossDead(e) {
      var i;
      bossDone = true; shieldSeq = null; if (rune) closeRune();
      for (i = 0; i < enemies.length; i++) if (!enemies[i].dead) killEnemy(enemies[i], true);
      for (i = 0; i < projs.length; i++) projs[i].a = false;
      for (i = 0; i < hz.length; i++) hz[i].a = false;
      addShake(12); flashA = 0.5; vib(120);
    }

    function moveToward(e, tx, ty, sp, dt) {
      var dx = tx - e.x, dy = ty - e.y, d = Math.sqrt(dx * dx + dy * dy);
      if (d > 0.5) { var s = Math.min(d, sp * dt); e.x += dx / d * s; e.y += dy / d * s; e.moving = true; }
      return d;
    }
    function windup(e, state, time) { e.state = state; e.st = e.wt = Math.max(0.5, time * (e.boss ? TELE : 1)); e.wp = 0; }
    function aiChase(e, dt, d, dx, dy) {
      if (e.state === "move") {
        e.cd -= dt;
        var range = e.r + hero.r + 17;
        if (d > range - 4) moveToward(e, hero.x, hero.y, e.spd, dt);
        if (d < range + 8 && e.cd <= 0) {
          windup(e, "wind", e.windT);
          e.dx = dx / (d || 1); e.dy = dy / (d || 1);
          hazard(0, e.x + e.dx * (e.r + 14), e.y + e.dy * (e.r + 14), e.zr, e.wt, e.atk, e, 0);
        }
      } else if (e.state === "wind") {
        e.st -= dt; e.wp = 1 - e.st / e.wt;
        if (e.st <= 0) { e.state = "rec"; e.st = 0.5; e.wp = 0; e.kx += e.dx * 70; e.ky += e.dy * 70; }
      } else { e.st -= dt; if (e.st <= 0) { e.state = "move"; e.cd = e.atkCd * rnd(0.8, 1.2); } }
      if (e.kind === "slow_aura" && d < 96 && hero.dodgeT <= 0) hero.slowT = 0.2;
    }
    function aiSwoop(e, dt, d, dx, dy) {
      if (e.state === "move") {
        e.cd -= dt;
        var a = Math.atan2(-dy, -dx) + e.orb * 0.5, R = 118;
        moveToward(e, hero.x + Math.cos(a) * R, hero.y + Math.sin(a) * R, e.spd, dt);
        if (e.cd <= 0 && d < 210 && d > 40) {
          windup(e, "wind", e.windT); e.dx = dx / d; e.dy = dy / d; e.len = d + 85;
          lineHazard(e.x, e.y, Math.atan2(dy, dx), e.len, 26, e.wt, 0, e, 0);
        }
      } else if (e.state === "wind") {
        e.st -= dt; e.wp = 1 - e.st / e.wt;
        if (e.st <= 0) { e.state = "swoop"; e.st = e.len / 400; e.hitOnce = false; e.wp = 0; }
      } else if (e.state === "swoop") {
        e.x += e.dx * 400 * dt; e.y += e.dy * 400 * dt; e.moving = true;
        if (!e.hitOnce && d < e.r + hero.r + 5) { e.hitOnce = true; hurtHero(e.atk, e.x, e.y); }
        e.st -= dt; if (e.st <= 0) { e.state = "rec"; e.st = 0.6; }
      } else { e.st -= dt; if (e.st <= 0) { e.state = "move"; e.cd = rnd(2.2, 3.4) / clamp(difficulty, 0.7, 1.3); } }
    }
    function aiRanged(e, dt, d, dx, dy) {
      if (e.state === "move") {
        e.cd -= dt;
        var ux = dx / (d || 1), uy = dy / (d || 1);
        if (d < 125) moveToward(e, e.x - ux * 40, e.y - uy * 40, e.spd, dt);
        else if (d > 215) moveToward(e, hero.x, hero.y, e.spd, dt);
        else moveToward(e, e.x - uy * e.orb * 40, e.y + ux * e.orb * 40, e.spd * 0.5, dt);
        if (e.x <= bx0 + 2 || e.x >= bx1 - 2 || e.y <= by0 + 2 || e.y >= by1 - 2) e.orb = -e.orb;
        if (e.cd <= 0 && d < 330) windup(e, "wind", e.windT);
      } else if (e.state === "wind") {
        e.st -= dt; e.wp = 1 - e.st / e.wt;
        if (e.st <= 0) {
          var a = Math.atan2(dy, dx);
          shoot(0, e.x + Math.cos(a) * 16, e.y - 12 + Math.sin(a) * 6, Math.cos(a) * 118, Math.sin(a) * 118, 8, e.atk, 3.6, false);
          e.state = "rec"; e.st = 0.5; e.wp = 0;
        }
      } else { e.st -= dt; if (e.st <= 0) { e.state = "move"; e.cd = rnd(2.4, 3.4) / clamp(difficulty, 0.7, 1.3); } }
    }
    function aiTeleport(e, dt, d, dx, dy) {
      if (e.state === "move") {
        e.cd -= dt; e.alpha = 1;
        if (d > 60) moveToward(e, hero.x + Math.sin(e.t * 2) * 30, hero.y + Math.cos(e.t * 1.7) * 30, e.spd * 0.6, dt);
        if (e.cd <= 0) { e.state = "fade"; e.st = 0.35; }
      } else if (e.state === "fade") {
        e.st -= dt; e.alpha = clamp(e.st / 0.35, 0, 1);
        if (e.st <= 0) {
          var a = rnd(0, TAU);
          e.x = clamp(hero.x + Math.cos(a) * 80, bx0, bx1); e.y = clamp(hero.y + Math.sin(a) * 80, by0, by1);
          windup(e, "appear", e.windT);
          hazard(0, e.x, e.y, 48, e.wt, e.atk, e, 0);
        }
      } else if (e.state === "appear") {
        e.st -= dt; e.wp = 1 - e.st / e.wt; e.alpha = clamp(e.wp * 1.6, 0, 1);
        if (e.st <= 0) { e.state = "rec"; e.st = 0.8; e.wp = 0; e.alpha = 1; }
      } else { e.st -= dt; if (e.st <= 0) { e.state = "move"; e.cd = rnd(2.6, 3.8) / clamp(difficulty, 0.7, 1.3); } }
    }
    function aiCharge(e, dt, d, dx, dy, speed) {
      speed = speed || 430;
      if (e.state === "move") {
        e.cd -= dt;
        if (d > 150) moveToward(e, hero.x, hero.y, e.spd, dt);
        if (e.cd <= 0 && d < 250) {
          windup(e, "wind", e.windT); e.dx = dx / (d || 1); e.dy = dy / (d || 1);
          var a = Math.atan2(dy, dx); e.len = wallDist(e.x, e.y, a, 320);
          lineHazard(e.x, e.y, a, e.len, 40, e.wt, 0, e, 0);
        }
      } else if (e.state === "wind") {
        e.st -= dt; e.wp = 1 - e.st / e.wt;
        if (e.st <= 0) { e.state = "charge"; e.st = e.len / speed; e.hitOnce = false; e.wp = 0; }
      } else if (e.state === "charge") {
        e.x += e.dx * speed * dt; e.y += e.dy * speed * dt; e.moving = true;
        if (!e.hitOnce && d < e.r + hero.r + 6) { e.hitOnce = true; hurtHero(e.atk, e.x, e.y); }
        e.st -= dt; if (e.st <= 0) { e.state = "rec"; e.st = 1.3; addShake(3); }
      } else { e.st -= dt; if (e.st <= 0) { e.state = "move"; e.cd = rnd(1.8, 2.6) / clamp(difficulty, 0.7, 1.3); } }
    }

    // ---------------------------------------------------------------- boss
    function bossPick(e, list) { var k = list[e.pat % list.length]; e.pat++; return k; }
    function bossRec(e, dt, cdMin, cdMax) { e.st -= dt; if (e.st <= 0) { e.state = "move"; e.punish = false; e.cd = rnd(cdMin, cdMax) / clamp(difficulty, 0.7, 1.3); } }
    function tick01(e, dt) { e.st -= dt; e.wp = clamp(1 - e.st / e.wt, 0, 1); return e.st <= 0; }
    function scatter(n, r, t0, step, dmg, fx, near) { // cercles annoncés : `near` près du héros, le reste au hasard
      var i, x, y, h;
      for (i = 0; i < n; i++) {
        if (i === 0) { x = hero.x; y = hero.y; }
        else if (i < near) { x = hero.x + hero.mx * 60 + rnd(-70, 70); y = hero.y + hero.my * 60 + rnd(-70, 70); }
        else { x = rnd(bx0 + 10, bx1 - 10); y = rnd(by0 + 10, by1 - 10); }
        h = hazard(0, clamp(x, bx0, bx1), clamp(y, by0, by1), r, (t0 + i * step) * TELE, dmg, null, fx);
      }
      return h;
    }
    function bossTeleport(e, dt, next) { // états "fade" → "appear" ; renvoie true quand c'est fini
      if (e.state === "fade") {
        e.st -= dt; e.alpha = clamp(e.st / 0.4, 0, 1);
        if (e.st <= 0) {
          var k, x, y;
          for (k = 0; k < 8; k++) { x = rnd(bx0 + 30, bx1 - 30); y = rnd(by0 + 30, by1 - 30); if ((x - hero.x) * (x - hero.x) + (y - hero.y) * (y - hero.y) > 150 * 150) break; }
          e.x = x; e.y = y; e.state = "appear"; e.st = e.wt = 0.55; ringFx(x, y - e.r, 8, 120, 0.4, e.col === "#2A1F3D" ? "#b79cff" : e.col, 3);
        }
        return false;
      }
      e.st -= dt; e.alpha = clamp(1 - e.st / e.wt, 0, 1);
      if (e.st <= 0) { e.alpha = 1; return true; }
      return false;
    }
    var BOSS_AI = {
      grumble: function (e, dt, d, dx, dy) {
        if (e.state === "move") {
          e.cd -= dt; if (d > 74) moveToward(e, hero.x, hero.y, e.spd, dt);
          if (e.cd <= 0) {
            var k = bossPick(e, ["slam", "slam", "summon"]);
            if (k === "summon" && minionCount() >= 3) k = "slam";
            if (k === "slam" && d > 175 && !e.punish) { e.pat--; e.cd = 0.25; return; }
            windup(e, k, k === "slam" ? 1.0 : 0.9); sfx("telegraph");
            if (k === "slam") hazard(0, e.x, e.y, 116, e.wt, e.atk, e, 4);
          }
        } else if (e.state === "slam") { if (tick01(e, dt)) { e.state = "rec"; e.st = 0.9; e.wp = 0; } }
        else if (e.state === "summon") {
          if (tick01(e, dt)) { makeEnemy("mumblin"); if (minionCount() < 4) makeEnemy("mumblin"); e.state = "rec"; e.st = 0.6; e.wp = 0; }
        } else bossRec(e, dt, 1.5, 2.1);
      },
      bramble: function (e, dt, d, dx, dy) {
        var i;
        if (e.state === "move") {
          e.cd -= dt; if (d > 120) moveToward(e, hero.x, hero.y, e.spd, dt);
          if (e.cd <= 0) {
            var k = bossPick(e, ["roots", "fan", "roots"]);
            sfx("telegraph");
            if (k === "roots") { windup(e, "roots", 1.0); scatter(3, 42, 0.95, 0.25, e.atk, 1, 3); }
            else { windup(e, "fan", 0.85); e.ax = Math.atan2(dy, dx); for (i = -2; i <= 2; i++) lineHazard(e.x, e.y - 20, e.ax + i * 0.3, 240, 12, e.wt, 0, e, 0); }
          }
        } else if (e.state === "roots") { if (tick01(e, dt)) { e.state = "rec"; e.st = 0.9; e.wp = 0; } }
        else if (e.state === "fan") {
          if (tick01(e, dt)) {
            for (i = -2; i <= 2; i++) shoot(1, e.x, e.y - 20, Math.cos(e.ax + i * 0.3) * 200, Math.sin(e.ax + i * 0.3) * 200, 7, e.atk * 0.8, 2.2, false);
            e.state = "rec"; e.st = 0.8; e.wp = 0;
          }
        } else bossRec(e, dt, 1.3, 1.9);
      },
      captain_blank: function (e, dt, d, dx, dy) {
        if (e.state === "move") {
          e.cd -= dt;
          var a = Math.atan2(-dy, -dx) + e.orb * 0.4;
          moveToward(e, clamp(hero.x + Math.cos(a) * 170, bx0 + 20, bx1 - 20), clamp(hero.y + Math.sin(a) * 170, by0 + 20, by1 - 20), e.spd, dt);
          if (e.cd <= 0) {
            var k = bossPick(e, ["cannon", "tele", "cannon", "summon"]);
            if (k === "summon" && minionCount() >= 2) k = "cannon";
            if (k === "tele") { e.state = "fade"; e.st = 0.4; e.shots = 1; return; }
            sfx("telegraph");
            if (k === "summon") windup(e, "summon", 0.9);
            else { e.shots = 2; e.state = "aim"; }
          }
        } else if (e.state === "fade" || e.state === "appear") { if (bossTeleport(e, dt)) { e.state = "aim"; sfx("telegraph"); } }
        else if (e.state === "aim") {
          windup(e, "cannon", e.shots === 2 ? 0.9 : 0.75); e.ax = Math.atan2(dy, dx);
          lineHazard(e.x, e.y - 14, e.ax, wallDist(e.x, e.y, e.ax, 560), 34, e.wt, e.atk, e, 5);
        } else if (e.state === "cannon") {
          if (tick01(e, dt)) { e.shots--; e.wp = 0; if (e.shots > 0) e.state = "aim"; else { e.state = "rec"; e.st = 0.7; } }
        } else if (e.state === "summon") {
          if (tick01(e, dt)) { makeEnemy("whisper"); if (minionCount() < 2) makeEnemy("whisper"); e.state = "rec"; e.st = 0.6; e.wp = 0; }
        } else bossRec(e, dt, 1.2, 1.8);
      },
      glacia: function (e, dt, d, dx, dy) {
        var h;
        if (e.state === "move") {
          e.cd -= dt;
          var a = Math.atan2(-dy, -dx) + e.orb * 0.35;
          moveToward(e, clamp(hero.x + Math.cos(a) * 150, bx0 + 30, bx1 - 30), clamp(hero.y + Math.sin(a) * 150, by0 + 30, by1 - 30), e.spd, dt);
          if (e.cd <= 0) {
            var k = bossPick(e, ["breath", "spikes", "slide"]);
            sfx("telegraph");
            if (k === "breath") { windup(e, "breath", 1.0); e.ax = Math.atan2(dy, dx); h = hazard(2, e.x, e.y - 16, 235, e.wt, e.atk, e, 6); if (h) { h.ang = e.ax; h.half = 0.5; h.slow = 2.5; } }
            else if (k === "spikes") { windup(e, "spikes", 0.8); scatter(6, 34, 0.95, 0.14, e.atk, 2, 2); }
            else { windup(e, "slidew", 0.95); e.ax = Math.atan2(dy, dx); e.dx = Math.cos(e.ax); e.dy = Math.sin(e.ax); e.len = wallDist(e.x, e.y, e.ax, 520); lineHazard(e.x, e.y, e.ax, e.len, 60, e.wt, 0, e, 0); }
          }
        } else if (e.state === "breath" || e.state === "spikes") { if (tick01(e, dt)) { e.state = "rec"; e.st = 0.9; e.wp = 0; } }
        else if (e.state === "slidew") { if (tick01(e, dt)) { e.state = "slide"; e.st = e.len / 460; e.hitOnce = false; e.wp = 0; } }
        else if (e.state === "slide") {
          e.x += e.dx * 460 * dt; e.y += e.dy * 460 * dt; e.moving = true;
          if (!simulating && Math.random() < 0.5) part(5, e.x + rnd(-20, 20), e.y - rnd(0, 30), rnd(-30, 30), rnd(-30, 30), 0.5, 4, "#ffffff");
          if (!e.hitOnce && d < e.r + hero.r + 4) { e.hitOnce = true; hurtHero(e.atk, e.x, e.y); }
          e.st -= dt; if (e.st <= 0) { e.state = "rec"; e.st = 1.1; addShake(4); }
        } else bossRec(e, dt, 1.2, 1.8);
      },
      lord_hush: function (e, dt, d, dx, dy) {
        var h, i, a;
        if (e.state === "move") {
          e.cd -= dt;
          if (d > 170) moveToward(e, hero.x, hero.y, e.spd * 0.7, dt);
          else { a = Math.atan2(-dy, -dx) + e.orb * 0.3; moveToward(e, clamp(hero.x + Math.cos(a) * 150, bx0 + 20, bx1 - 20), clamp(hero.y + Math.sin(a) * 150, by0 + 20, by1 - 20), e.spd * 0.5, dt); }
          if (e.cd <= 0) {
            var k = e.phase === 0 ? bossPick(e, ["ring", "ring2"]) : e.phase === 1 ? bossPick(e, ["rain", "ring", "rain"]) : bossPick(e, ["tele", "ring", "bolts"]);
            if (k === "tele") { e.state = "fade"; e.st = 0.4; return; }
            sfx("telegraph");
            if (k === "rain") { windup(e, "rain", 0.8); scatter(8, 32, 0.9, 0.16, e.atk * 0.9, 3, 3); }
            else if (k === "bolts") windup(e, "bolts", 0.8);
            else { e.shots = k === "ring2" ? 2 : 1; windup(e, "ring", 0.85); }
          }
        } else if (e.state === "fade" || e.state === "appear") { if (bossTeleport(e, dt)) { windup(e, "bolts", 0.8); sfx("telegraph"); } }
        else if (e.state === "ring") {
          if (tick01(e, dt)) {
            h = hazard(3, e.x, e.y, 20, 0.5, e.atk * 0.8, null, 0);
            if (h) { h.speed = 125; h.rmax = 480; h.gap = 1.0; h.gapA = Math.atan2(dy, dx) + rnd(-1.6, 1.6); h.done = true; }
            ringFx(e.x, e.y - 30, 10, 200, 0.3, "#d9c2ff", 4);
            e.shots--; e.wp = 0;
            if (e.shots > 0) windup(e, "ring", 0.8); else { e.state = "rec"; e.st = 0.8; }
          }
        } else if (e.state === "rain") { if (tick01(e, dt)) { e.state = "rec"; e.st = 1.0; e.wp = 0; } }
        else if (e.state === "bolts") {
          if (tick01(e, dt)) {
            a = Math.atan2(dy, dx);
            for (i = -1; i <= 1; i++) { h = shoot(2, e.x, e.y - 40, Math.cos(a + i * 0.7) * 108, Math.sin(a + i * 0.7) * 108, 9, e.atk * 0.8, 4.2, false); if (h) h.home = 1.1; }
            e.state = "rec"; e.st = 0.8; e.wp = 0;
          }
        } else bossRec(e, dt, e.phase === 2 ? 0.9 : 1.2, e.phase === 2 ? 1.4 : 1.8);
      }
    };
    function startShield(e) {
      var i;
      e.shield = true; e.state = "move"; e.wp = 0; e.punish = false; e.alpha = 1; e.stunT = 0; e.cd = 1;
      for (i = 0; i < hz.length; i++) if (hz[i].a && hz[i].owner === e) hz[i].a = false;
      shieldSeq = { boss: e, need: Math.max(2, (e.rules.need[e.thrI] || 3) - (easy ? 1 : 0)), streak: 0, wait: 1.15, errors: 0 };
      showBanner("Bouclier de silence !", "cb-b-shield", 1.3); sfx("shield"); addShake(5);
      showHint("Réponds juste " + shieldSeq.need + " fois d'affilée pour le briser !", 3);
      ringFx(e.x, e.y - e.r, e.r, 160, 0.5, "#c9a8ff", 5);
    }
    function breakShield(e) {
      e.shield = false; e.thrI++; e.phase = Math.min(2, e.thrI); shieldSeq = null; e.punish = false;
      burst(e.x, e.y - e.r, 26, "#d9c2ff", 90, 320, 6, 0.7, 2); ringFx(e.x, e.y - e.r, e.r, 300, 0.5, "#ffffff", 5);
      showBanner("Bouclier brisé !", "cb-b-good", 1.2); sfx("shield_break"); addShake(9); flashA = 0.45; vib(90);
      // Lord Hush : le dernier bouclier (« duel de mots ») se gagne par la parole — le briser le vainc.
      if (e.id === "lord_hush" && e.thrI >= e.rules.thr.length) hitEnemy(e, e.hp + 1, "spell", 0, 0, true);
      else hitEnemy(e, hero.atk * 2.5, "spell", 0, 0, true);
      if (!e.dead) { e.stunT = 2.4; e.state = "move"; e.cd = 0.8; }
    }
    function updEnemy(e, dt) {
      var sl, dx, dy, d;
      if (e.hitT > 0) e.hitT -= dt;
      if (e.crackT > 0) e.crackT -= dt;
      if (e.spawnT > 0) { e.spawnT -= dt; e.t += dt; return; }
      e.moving = false;
      if (e.kx || e.ky) {
        e.x += e.kx * dt; e.y += e.ky * dt; sl = Math.exp(-8 * dt); e.kx *= sl; e.ky *= sl;
        if (Math.abs(e.kx) + Math.abs(e.ky) < 2) e.kx = e.ky = 0;
      }
      if (e.freezeT > 0) { e.freezeT -= dt; }
      else if (e.stunT > 0) { e.stunT -= dt; e.t += dt * 0.3; }
      else {
        sl = e.slowT > 0 ? 0.4 : 1; if (e.slowT > 0) e.slowT -= dt;
        dt *= sl; e.t += dt;
        dx = hero.x - e.x; dy = hero.y - e.y; d = Math.sqrt(dx * dx + dy * dy);
        e.ly = clamp(dy / 60, -1, 1);
        if (e.state === "move" || e.state === "wind") { if (Math.abs(dx) > 3) e.face = dx > 0 ? 1 : -1; }
        if (e.boss) {
          if (e.shield && !e.punish) { e.wp = 0; }
          else BOSS_AI[e.id] ? BOSS_AI[e.id](e, dt, d, dx, dy) : aiChase(e, dt, d, dx, dy);
        } else if (e.kind === "swoop") aiSwoop(e, dt, d, dx, dy);
        else if (e.kind === "ranged") aiRanged(e, dt, d, dx, dy);
        else if (e.kind === "teleport") aiTeleport(e, dt, d, dx, dy);
        else if (e.kind === "charge") aiCharge(e, dt, d, dx, dy, 430);
        else aiChase(e, dt, d, dx, dy);
      }
      e.x = clamp(e.x, bx0, bx1); e.y = clamp(e.y, e.boss ? Math.min(by1, by0 + e.h * 0.5) : by0, by1);
    }
    function separate() {
      var n = enemies.length, i, j, a, b, dx, dy, d, min, push;
      for (i = 0; i < n; i++) {
        a = enemies[i]; if (a.dead || a.spawnT > 0 || a.state === "swoop" || a.state === "charge" || a.state === "slide") continue;
        for (j = i + 1; j < n; j++) {
          b = enemies[j]; if (b.dead || b.spawnT > 0 || b.state === "swoop" || b.state === "charge" || b.state === "slide") continue;
          dx = b.x - a.x; dy = b.y - a.y; min = (a.r + b.r) * 0.9; d = dx * dx + dy * dy;
          if (d >= min * min) continue;
          d = Math.sqrt(d); if (d < 0.01) { dx = 1; dy = 0; d = 1; }
          push = (min - d) * 0.5; dx /= d; dy /= d;
          if (a.boss) { b.x += dx * push * 2; b.y += dy * push * 2; }
          else if (b.boss) { a.x -= dx * push * 2; a.y -= dy * push * 2; }
          else { a.x -= dx * push; a.y -= dy * push; b.x += dx * push; b.y += dy * push; }
        }
      }
    }

    // ---------------------------------------------------------------- dangers annoncés, projectiles, étoiles
    function hazardFx(h) {
      if (simulating) return;
      if (h.fx === 4) { ringFx(h.x, h.y, 20, 420, 0.3, "#ffffff", 6); burst(h.x, h.y, 14, "#b9b3d6", 80, 260, 6, 0.5, 6); addShake(8); }
      else if (h.fx === 1) { burst(h.x, h.y, 9, "#4f7f3a", 60, 190, 6, 0.5, 2); burst(h.x, h.y, 5, "#2c4d22", 30, 90, 5, 0.6); }
      else if (h.fx === 2) { burst(h.x, h.y, 10, "#dff6ff", 70, 220, 5, 0.5, 2); burst(h.x, h.y, 5, "#ffffff", 20, 80, 4, 0.6, 5); addShake(3); }
      else if (h.fx === 3) { for (var i = 0; i < (reduced ? 2 : 4); i++) { var p = part(1, h.x + rnd(-14, 14), h.y + rnd(-8, 8), rnd(-70, 70), rnd(-120, -40), 0.7, 15, "#17121f", LETTERS.charAt((Math.random() * LETTERS.length) | 0)); p.drag = 1; } burst(h.x, h.y, 6, "#2a1f3d", 40, 150, 5, 0.45); }
      else if (h.fx === 5) { burst(h.x + Math.cos(h.ang) * 30, h.y + Math.sin(h.ang) * 30, 8, "#ffe9a8", 60, 200, 5, 0.35, 2); addShake(5); }
      else if (h.fx === 6) { for (var k = 0; k < (reduced ? 8 : 22); k++) { var a = h.ang + rnd(-h.half, h.half), s = rnd(160, 420); var q = part(k % 3 ? 6 : 5, h.x, h.y, Math.cos(a) * s, Math.sin(a) * s, rnd(0.4, 0.7), rnd(5, 9), k % 2 ? "#dff6ff" : "#ffffff"); q.drag = 1.6; } }
      else burst(h.x, h.y, 5, "#ffffff", 40, 120, 4, 0.3, 6);
    }
    function heroInHazard(h, pad) {
      var dx = hero.x - h.x, dy = hero.y - h.y, d, t, px, py, c, s;
      pad = pad || 0;
      if (h.type === 0) return dx * dx + dy * dy < (h.r + pad + hero.r * 0.5) * (h.r + pad + hero.r * 0.5);
      if (h.type === 1) {
        c = Math.cos(h.ang); s = Math.sin(h.ang); t = clamp(dx * c + dy * s, 0, h.len); px = dx - c * t; py = dy - s * t;
        d = h.w * 0.5 + pad + hero.r * 0.5; return px * px + py * py < d * d;
      }
      if (h.type === 2) { d = Math.sqrt(dx * dx + dy * dy); return d < h.r + pad && (d < 20 || Math.abs(angDiff(Math.atan2(dy, dx), h.ang)) < h.half + pad / 120); }
      return false;
    }
    function updHazards(dt) {
      var i, h, o, d, dx, dy;
      for (i = 0; i < hz.length; i++) {
        h = hz[i]; if (!h.a) continue;
        o = h.owner;
        if (o && !h.done && (o.dead || o.stunT > 0 || o.freezeT > 0 || o.shield && !o.punish)) { h.a = false; h.owner = null; continue; }
        h.t += o && o.slowT > 0 ? dt * 0.4 : dt;
        if (h.type === 3) { // onde circulaire
          h.r += h.speed * dt;
          if (!h.hit) {
            dx = hero.x - h.x; dy = hero.y - h.y; d = Math.sqrt(dx * dx + dy * dy);
            if (Math.abs(d - h.r) < 9 && Math.abs(angDiff(Math.atan2(dy, dx), h.gapA)) > h.gap * 0.5) { if (hurtHero(h.dmg, h.x, h.y)) h.hit = true; }
          }
          if (h.r > h.rmax) h.a = false;
          continue;
        }
        if (!h.done && h.t >= h.delay) {
          h.done = true;
          if (h.dmg > 0 && heroInHazard(h, 0)) { if (hurtHero(h.dmg, h.x, h.y) && h.slow > 0 && hero.shieldT <= 0) hero.slowT = Math.max(hero.slowT, h.slow); }
          if (h.dmg > 0 || h.fx) hazardFx(h);
        }
        if (h.done && h.t >= h.delay + 0.22) { h.a = false; h.owner = null; }
      }
    }
    function updProjs(dt) {
      var i, j, p, e, dx, dy, a, c, s, rr, col;
      for (i = 0; i < projs.length; i++) {
        p = projs[i]; if (!p.a) continue;
        p.life -= dt;
        if (p.home > 0) {
          a = angDiff(Math.atan2(hero.y - 16 - p.y, hero.x - p.x), Math.atan2(p.vy, p.vx)); a = clamp(a, -p.home * dt, p.home * dt);
          c = Math.cos(a); s = Math.sin(a); dx = p.vx * c - p.vy * s; p.vy = p.vx * s + p.vy * c; p.vx = dx;
        }
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (!simulating) {
          p.em -= dt;
          if (p.em <= 0) {
            p.em = p.friendly ? 0.025 : 0.07;
            if (p.friendly) part(0, p.x + rnd(-6, 6), p.y + rnd(-6, 6), rnd(-20, 20), rnd(-40, 0), 0.35, rnd(4, 9), Math.random() < 0.5 ? "#ffb347" : "#ff6b3d");
            else part(0, p.x, p.y, 0, 0, 0.3, p.r * 0.6, p.type === 0 ? "#22203a" : p.type === 2 ? "#6b4fd0" : "#3c5f2c");
          }
        }
        if (p.life <= 0 || p.x < bx0 - 30 || p.x > bx1 + 30 || p.y < by0 - 40 || p.y > by1 + 40) {
          p.a = false;
          if (p.friendly) { burst(p.x, p.y, 12, "#ff8a3d", 60, 220, 6, 0.4); ringFx(p.x, p.y, 8, 160, 0.3, "#ffd27a", 3); }
          continue;
        }
        if (p.friendly) {
          for (j = enemies.length - 1; j >= 0; j--) {
            e = enemies[j]; if (e.dead || e.spawnT > 0 || e.stamp === p.stamp || e.alpha < 0.5) continue;
            dx = e.x - p.x; dy = e.y - e.r * 0.6 - p.y; rr = p.r + e.r;
            if (dx * dx + dy * dy < rr * rr) { e.stamp = p.stamp; hitEnemy(e, p.dmg, "spell", p.vx * 0.3, p.vy * 0.3, false); burst(e.x, e.y - e.r, 6, "#ffb347", 60, 180, 5, 0.35); }
          }
        } else {
          dx = hero.x - p.x; dy = hero.y - 14 - p.y; rr = p.r + hero.r - 2;
          if (dx * dx + dy * dy < rr * rr && hero.dodgeT <= 0) {
            if (hurtHero(p.dmg, p.x, p.y) || hero.invT > 0) {
              p.a = false; col = p.type === 0 ? "#22203a" : p.type === 2 ? "#6b4fd0" : "#3c5f2c"; burst(p.x, p.y, 6, col, 40, 140, 4, 0.35);
            }
          }
        }
      }
    }
    function updStars(dt) {
      var i, j, s, e, dx, dy;
      for (i = 0; i < stars.length; i++) {
        s = stars[i]; if (!s.a) continue;
        s.t += dt;
        if (s.t >= s.delay + 0.42) {
          s.a = false;
          ringFx(s.tx, s.ty, 10, 240, 0.3, "#fff3b0", 4); burst(s.tx, s.ty, 9, "#ffe066", 70, 240, 5, 0.45, 4); addShake(3);
          for (j = enemies.length - 1; j >= 0; j--) {
            e = enemies[j]; if (e.dead || e.spawnT > 0) continue;
            dx = e.x - s.tx; dy = e.y - s.ty;
            if (dx * dx + dy * dy < (54 + e.r) * (54 + e.r)) hitEnemy(e, s.dmg, "spell", dx * 1.5, dy * 1.5, false);
          }
        }
      }
    }
    function addBolt(x0, y0, x1, y1) {
      if (simulating) return;
      var b = null, i, n = 7, dx = x1 - x0, dy = y1 - y0, len = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / len, ny = dx / len, t, o;
      for (i = 0; i < bolts.length; i++) if (!bolts[i].a) { b = bolts[i]; break; }
      if (!b) b = bolts[0];
      b.a = true; b.life = 0.45; b.n = n;
      for (i = 0; i < n; i++) { t = i / (n - 1); o = (i === 0 || i === n - 1) ? 0 : rnd(-1, 1) * Math.min(22, len * 0.16); b.pts[i * 2] = x0 + dx * t + nx * o; b.pts[i * 2 + 1] = y0 + dy * t + ny * o; }
    }

    // ---------------------------------------------------------------- sorts
    function castSpell(i, pw) {
      var sp = spells[i]; if (!sp || !hero || hero.hp <= 0) return;
      var h = hero, full = pw >= 0.99, S = h.atk * sp.power * pw, k, e, dx, dy, d, a, t, n, cx, cy, st, hx = h.x, hy = h.y - 16;
      switch (sp.effect) {
        case "stun":
          flashA = Math.max(flashA, full ? 0.75 : 0.25); ringFx(hx, hy, 12, 520, 0.32, "#fff6c9", 6);
          if (!simulating) for (k = 0; k < (reduced ? 8 : 18); k++) { a = k / 18 * TAU; part(2, hx, hy, Math.cos(a) * rnd(260, 420), Math.sin(a) * rnd(260, 420), 0.4, 5, "#fff3b0"); }
          for (k = enemies.length - 1; k >= 0; k--) { e = enemies[k]; dx = e.x - hx; dy = e.y - hy; d = Math.sqrt(dx * dx + dy * dy) || 1; if (d < 165 + e.r) { stun(e, full ? 2 : 0.6); hitEnemy(e, S * 1.2, "spell", dx / d * 90, dy / d * 90, false); } }
          break;
        case "heal":
          healHero(h.maxHp * 0.35 * pw, "#4be07a"); ringFx(hx, hy, 10, 120, 0.5, "#8ff0a8", 4);
          break;
        case "projectile":
          e = nearestEnemy(h.x, h.y, 2000, false);
          a = e ? Math.atan2(e.y - e.r * 0.6 - hy, e.x - hx) : (h.moving ? Math.atan2(h.my, h.mx) : (h.face > 0 ? 0 : PI));
          shoot(9, hx + Math.cos(a) * 14, hy + Math.sin(a) * 14, Math.cos(a) * 430, Math.sin(a) * 430, full ? 20 : 11, S * 4, 1.7, true);
          ringFx(hx, hy, 8, 120, 0.25, "#ffb347", 3);
          break;
        case "push":
          windFx.t = 0.6; windFx.x = hx; windFx.y = hy;
          ringFx(hx, hy, 14, 380, 0.4, "#e8fbff", 5); ringFx(hx, hy, 8, 260, 0.5, "#ffffff", 3);
          if (!simulating) for (k = 0; k < (reduced ? 6 : 16); k++) { a = rnd(0, TAU); st = part(7, hx + Math.cos(a) * 20, hy + Math.sin(a) * 20, Math.cos(a + 0.9) * 300, Math.sin(a + 0.9) * 300, 0.55, rnd(4, 7), k % 3 ? "#e8fbff" : "#9be37a"); st.drag = 1.5; }
          for (k = enemies.length - 1; k >= 0; k--) { e = enemies[k]; dx = e.x - h.x; dy = e.y - h.y; d = Math.sqrt(dx * dx + dy * dy) || 1; if (d < 205 + e.r) { t = full ? 540 : 200; stun(e, 0.8 * pw); hitEnemy(e, S * 1.2, "spell", dx / d * t, dy / d * t, false); } }
          for (k = 0; k < projs.length; k++) if (projs[k].a && !projs[k].friendly) { dx = projs[k].x - h.x; dy = projs[k].y - h.y; if (dx * dx + dy * dy < 230 * 230) { projs[k].a = false; burst(projs[k].x, projs[k].y, 4, "#ffffff", 30, 90, 4, 0.3, 6); } }
          break;
        case "freeze":
          e = nearestEnemy(h.x, h.y, 2000, false); cx = e ? e.x : h.x; cy = e ? e.y : h.y; t = full ? 145 : 90;
          iceFx.t = 0.9; iceFx.x = cx; iceFx.y = cy; iceFx.r = t;
          ringFx(cx, cy, 12, t * 3, 0.3, "#dff6ff", 5);
          if (!simulating) for (k = 0; k < (reduced ? 8 : 20); k++) { a = rnd(0, TAU); d = rnd(0, t); st = part(5, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, rnd(-20, 20), rnd(-50, -10), rnd(0.6, 1.1), rnd(4, 7), "#ffffff"); st.drag = 0.6; }
          for (k = enemies.length - 1; k >= 0; k--) { e = enemies[k]; dx = e.x - cx; dy = e.y - cy; if (dx * dx + dy * dy < (t + e.r) * (t + e.r)) { freeze(e, full ? 3 : 1); hitEnemy(e, S * 1.5, "spell", 0, 0, false); } }
          break;
        case "shield":
          h.shieldT = Math.max(h.shieldT, full ? 4 : 1.2); ringFx(hx, hy, 34, -40, 0.35, "#9fe0ff", 5);
          break;
        case "chain":
          cx = hx; cy = hy; st = stampN++; n = 0;
          for (k = 0; k < 4; k++) {
            var best = null, bd = (k === 0 ? 360 : 290), j;
            bd *= bd;
            for (j = 0; j < enemies.length; j++) { e = enemies[j]; if (e.dead || e.spawnT > 0 || e.stamp === st || e.alpha < 0.5) continue; dx = e.x - cx; dy = e.y - e.r - cy; d = dx * dx + dy * dy; if (d < bd) { bd = d; best = e; } }
            if (!best) break;
            best.stamp = st; addBolt(cx, cy, best.x, best.y - best.r); cx = best.x; cy = best.y - best.r; n++;
            burst(cx, cy, 5, "#fff3b0", 60, 200, 4, 0.3, 2); stun(best, 0.35 * pw); hitEnemy(best, S * 3, "spell", 0, 0, false);
          }
          if (!n) { a = h.face > 0 ? 0 : PI; addBolt(hx, hy, hx + Math.cos(a) * 120, hy - 30); }
          flashA = Math.max(flashA, full ? 0.3 : 0.1); addShake(full ? 5 : 2);
          break;
        case "slow":
          slowFx = full ? 5 : 1.5; ringFx(hx, hy, 14, 460, 0.6, "#ffe9a8", 5); ringFx(hx, hy, 8, 300, 0.8, "#f5c26b", 3);
          for (k = 0; k < enemies.length; k++) if (!enemies[k].dead && !enemies[k].shield) enemies[k].slowT = Math.max(enemies[k].slowT, full ? 5 : 1.5);
          break;
        case "area":
          n = full ? 12 : 5; t = 0;
          for (k = 0; k < stars.length && t < n; k++) {
            st = stars[k]; if (st.a) continue;
            e = enemies.length ? enemies[t % enemies.length] : null;
            if (e && !e.dead && t < enemies.length * 2) { st.tx = e.x + rnd(-26, 26); st.ty = e.y + rnd(-26, 26); } else { st.tx = rnd(bx0 + 20, bx1 - 20); st.ty = rnd(by0 + 20, by1 - 20); }
            st.a = true; st.t = 0; st.delay = t * 0.13; st.dmg = S * 1.6; t++;
          }
          break;
        case "double":
          h.echo = pw; ringFx(hx, hy, 10, 160, 0.5, "#b79cff", 4); ringFx(hx, hy, 10, 110, 0.7, "#b79cff", 3); ringFx(hx, hy, 10, 70, 0.9, "#b79cff", 2);
          break;
        default: break;
      }
      // le pouvoir des mots fend les armures : pleine puissance = brisée, pschitt = fêlée 5 s
      for (k = 0; k < enemies.length; k++) { e = enemies[k]; if (e.armor && !e.dead) breakArmor(e, full); }
    }
    function fireSpell(i, pw) {
      var sp = spells[i], h = hero, k, d;
      if (!sp || phase !== "fight") return;
      sp.cdT = sp.cooldown;
      if (pw >= 0.99) { sfx("spell"); floatTxt(h.x, h.y - 62, sp.name, "#fff3b0", 20); vib(30); }
      else { sfx("fizzle"); floatTxt(h.x, h.y - 60, "pschitt…", "#cfd3dc", 15); burst(h.x, h.y - 20, 6, "#cfd3dc", 20, 70, 5, 0.5, 6); }
      castSpell(i, pw);
      if (sp.effect !== "double" && h.echo > 0) {
        for (k = 0; k < delayed.length; k++) { d = delayed[k]; if (!d.a) { d.a = true; d.t = 0.45; d.i = i; d.pw = pw * h.echo; break; } }
        h.echo = 0;
      }
    }
    function pressSpell(i) {
      var sp = spells[i];
      if (!sp || phase !== "fight" || rune || paused || !hero || hero.hp <= 0) return false;
      if (sp.cdT > 0) { if (sp.el) { sp.el.classList.remove("cb-nope"); void sp.el.offsetWidth; sp.el.classList.add("cb-nope"); } return false; }
      openRune("spell", i);
      return true;
    }

    // ---------------------------------------------------------------- Rune de Mot
    function validQuiz(q) { return !!q && Array.isArray(q.options) && q.options.length >= 2 && q.answer >= 0 && q.answer < q.options.length; }
    function nextQuiz() {
      var q = null, i;
      for (i = 0; i < 10; i++) {
        q = null;
        if (opts.quiz) { try { q = opts.quiz(); } catch (err) { q = null; } }
        if (!validQuiz(q)) q = FALLBACK_QUIZ[(Math.random() * FALLBACK_QUIZ.length) | 0];
        if (q.prompt !== lastPrompt) break;
      }
      lastPrompt = q.prompt;
      return q;
    }
    function openRune(kind, i) {
      var q = nextQuiz(), n = Math.min(4, q.options.length), order = [], k, j, t, html = "", sp = spells[i], time = clamp(7 / difficulty, 5, 12), pips = "";
      for (k = 0; k < q.options.length; k++) order.push(k);
      if (n < q.options.length) { // garde la bonne réponse parmi les options affichées
        order.splice(q.answer, 1); order.length = n - 1; order.push(q.answer);
      }
      for (k = order.length - 1; k > 0; k--) { j = (Math.random() * (k + 1)) | 0; t = order[k]; order[k] = order[j]; order[j] = t; }
      rune = { kind: kind, i: i, q: q, order: order, t: time, max: time, done: 0, doneT: 0, bar: -1 };
      if (kind === "spell" && sp) { elRuneTitle.textContent = sp.emoji + " " + sp.name + (sp.fr ? " · " + sp.fr : ""); elRunePips.innerHTML = ""; elRuneMsg.textContent = "Trouve le bon mot !"; }
      else {
        elRuneTitle.textContent = "🤫 Bouclier de silence";
        for (k = 0; k < shieldSeq.need; k++) pips += '<i class="' + (k < shieldSeq.streak ? "cb-on" : "") + '"></i>';
        elRunePips.innerHTML = pips; elRuneMsg.textContent = "Encore " + (shieldSeq.need - shieldSeq.streak) + " bonne" + (shieldSeq.need - shieldSeq.streak > 1 ? "s" : "") + " réponse" + (shieldSeq.need - shieldSeq.streak > 1 ? "s" : "") + " d'affilée !";
      }
      elRuneHint.textContent = q.hint || ""; elRuneHint.hidden = !q.hint;
      elRunePrompt.textContent = q.prompt == null ? "" : q.prompt; elRunePrompt.classList.toggle("cb-long", String(q.prompt || "").length > 16); elRunePrompt.classList.toggle("cb-xlong", String(q.prompt || "").length > 30);
      elRuneSub.textContent = q.sub == null ? "" : q.sub; elRuneSub.hidden = !q.sub;   // q.sub (facultatif) : petite ligne d'aide sous la question (traduction d'une phrase à trou)
      for (k = 0; k < order.length; k++) html += '<button type="button" class="cb-rune-opt" data-opt="' + k + '"><span class="cb-key">' + (k + 1) + '</span><span class="cb-rune-opt-txt">' + esc(q.options[order[k]]) + "</span></button>";
      elRuneOpts.innerHTML = html;
      elRune.className = "cb-rune" + (kind === "shield" ? " cb-rune-shield" : "");
      elRuneFill.style.transform = "scaleX(1)";
      elRune.hidden = false; root.classList.add("cb-runeopen");
      inp.atkHeld = false; inp.atkPtr = -1; elAtk.classList.remove("cb-down");
      sfx("rune");
    }
    function closeRune() { rune = null; elRune.hidden = true; root.classList.remove("cb-runeopen"); }
    function answerRune(k) { // k = index affiché, -1 = temps écoulé
      var r = rune; if (!r || r.done || paused) return;
      if (k >= r.order.length) return;
      var q = r.q, ok = k >= 0 && r.order[k] === q.answer, btns = elRuneOpts.children, j;
      quizTotal++; if (ok) quizOk++;
      r.done = ok ? 1 : 2; r.doneT = ok ? 0.42 : 1.0;
      for (j = 0; j < btns.length; j++) {
        btns[j].disabled = true;
        if (r.order[j] === q.answer) btns[j].classList.add("cb-ok");
        else if (j === k) btns[j].classList.add("cb-ko");
        else btns[j].classList.add("cb-dim");
      }
      elRune.classList.add(ok ? "cb-rune-ok" : "cb-rune-ko");
      if (ok) { elRuneMsg.textContent = "Bravo !"; sfx("correct"); vib(20); speak(q.say || q.options[q.answer]); }
      else { elRuneMsg.textContent = (k < 0 ? "Trop tard ! " : "Raté… ") + "C'était : " + q.options[q.answer]; sfx("wrong"); vib(50); }
      try { if (opts.onQuiz) opts.onQuiz(q, ok); } catch (err) { /* ignoré */ }
    }
    function resolveRune() {
      var r = rune, ok = r.done === 1, sq = shieldSeq;
      if (r.kind === "spell") { closeRune(); fireSpell(r.i, ok ? 1 : 0.3); return; }
      if (!sq || !sq.boss || sq.boss.dead) { closeRune(); return; }
      if (ok) {
        sq.streak++;
        ringFx(sq.boss.x, sq.boss.y - sq.boss.r, sq.boss.r + 10, 90, 0.3, "#ffffff", 3);
        if (sq.streak >= sq.need) { closeRune(); breakShield(sq.boss); }
        else openRune("shield", -1);
      } else {
        sq.streak = 0; sq.errors++; closeRune(); sq.wait = 3.6;
        sq.boss.punish = true; sq.boss.state = "move"; sq.boss.cd = 0; sq.boss.wp = 0;
        // clémence : toutes les 2 erreurs, le bouclier se fissure (une bonne réponse de moins à enchaîner)
        if (sq.errors % 2 === 0 && sq.need > 1) { sq.need--; floatTxt(sq.boss.x, sq.boss.y - sq.boss.h - 14, "Le bouclier se fissure…", "#fff3b0", 15); }
        else floatTxt(sq.boss.x, sq.boss.y - sq.boss.h - 14, "Le bouclier tient !", "#d9c2ff", 15);
      }
    }
    function updRune(rdt) {
      var r = rune, q;
      if (!r.done) {
        r.t -= rdt; q = Math.ceil(r.t / r.max * 100);
        if (q !== r.bar) { r.bar = q; elRuneFill.style.transform = "scaleX(" + clamp(r.t / r.max, 0, 1).toFixed(3) + ")"; elRune.classList.toggle("cb-rune-hurry", r.t < 2.2); }
        if (r.t <= 0) answerRune(-1);
      } else { r.doneT -= rdt; if (r.doneT <= 0) resolveRune(); }
    }

    // ---------------------------------------------------------------- ambiance de l'arène
    var amb = [], DASH = [7, 7], NODASH = [];
    function initAmbient() {
      var n = reduced ? 8 : 26, i;
      amb.length = 0;
      for (i = 0; i < n; i++) amb.push({ x: rnd(0, WW), y: rnd(0, WH), ph: rnd(0, TAU), s: rnd(0.6, 1.4), ch: LETTERS.charAt((Math.random() * LETTERS.length) | 0) });
    }
    function drawSea(g) {
      var sea = bgInfo.sea, i, x, y, a;
      if (!sea.length && !bgInfo.foamY) return;
      g.strokeStyle = "#ffffff"; g.lineWidth = 1.8;
      for (i = 0; i < sea.length; i += 2) {
        a = 0.5 + 0.5 * Math.sin(T * 1.6 + i * 1.3); if (a < 0.08) continue;
        x = sea[i] + Math.sin(T * 0.7 + i) * 7; y = sea[i + 1] + Math.cos(T * 0.9 + i) * 2;
        g.globalAlpha = a * 0.7; g.beginPath(); g.moveTo(x - 8, y); g.quadraticCurveTo(x, y - 4, x + 8, y); g.stroke();
      }
      if (bgInfo.foamY) {
        y = bgInfo.foamY + Math.sin(T * 1.1) * 5;
        g.globalAlpha = 0.85; g.lineWidth = 4; g.beginPath(); g.moveTo(-5, y);
        for (x = 0; x <= WW + 30; x += 30) g.quadraticCurveTo(x + 15, y + 9 + Math.sin(T * 1.7 + x * 0.05) * 3, x + 30, y + Math.sin(T * 1.3 + x * 0.03) * 2);
        g.stroke();
        g.globalAlpha = 0.35; g.lineWidth = 9; g.stroke();
      }
      g.globalAlpha = 1;
    }
    function drawAmbient(g, rdt) {
      var kind = arena.amb, n = amb.length, i, p, a, mv = reduced ? 0 : rdt;
      if (kind === "sea") return;
      if (kind === "letters") { g.font = "900 13px Nunito, system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; n = Math.min(n, 12); }
      if (kind === "leaves") n = Math.min(n, 12);
      for (i = 0; i < n; i++) {
        p = amb[i];
        switch (kind) {
          case "pollen":
            p.x += (10 + Math.sin(T + p.ph) * 8) * p.s * mv; p.y += Math.sin(T * 0.7 + p.ph) * 6 * mv;
            g.globalAlpha = 0.55; g.fillStyle = "#fffbe0"; circ(g, p.x, p.y, 1.7 * p.s); g.fill(); break;
          case "leaves":
            p.x += (16 + Math.sin(T + p.ph) * 14) * p.s * mv; p.y += 24 * p.s * mv;
            g.globalAlpha = 0.75; g.fillStyle = i % 3 === 0 ? "#e2a03f" : i % 3 === 1 ? "#8fce5a" : "#d9743a";
            g.beginPath(); g.ellipse(p.x, p.y, 4 * p.s, 2 * p.s, T * 1.5 * p.s + p.ph, 0, TAU); g.fill(); break;
          case "dust":
            p.x += Math.sin(T * 0.4 + p.ph) * 5 * mv; p.y -= 4 * p.s * mv;
            g.globalAlpha = 0.25 + 0.25 * Math.sin(T * 1.3 + p.ph); g.fillStyle = "#fff6dc"; circ(g, p.x, p.y, 1.3 * p.s); g.fill(); break;
          case "fireflies":
            p.x += Math.cos(T * 0.6 + p.ph) * 16 * mv; p.y += Math.sin(T * 0.8 + p.ph * 2) * 16 * mv;
            a = 0.35 + 0.65 * Math.max(0, Math.sin(T * 1.8 + p.ph * 3));
            glow(g, "#d8ff7a", p.x, p.y, 9 * p.s, a * 0.8); g.globalAlpha = a; g.fillStyle = "#f6ffc9"; circ(g, p.x, p.y, 1.5); g.fill(); break;
          case "snow":
            p.x += Math.sin(T + p.ph) * 14 * mv; p.y += 42 * p.s * mv;
            g.globalAlpha = 0.9; g.fillStyle = "#ffffff"; circ(g, p.x, p.y, 1.6 * p.s + 0.4); g.fill(); break;
          case "ash":
            p.x -= 22 * p.s * mv; p.y += 6 * mv;
            g.globalAlpha = 0.4; g.fillStyle = i % 2 ? "#e4e5ea" : "#6f727c"; g.fillRect(p.x, p.y, 2.2 * p.s, 2.2 * p.s); break;
          case "letters":
            p.x += Math.sin(T * 0.5 + p.ph) * 6 * mv; p.y -= 9 * p.s * mv;
            g.globalAlpha = 0.2 + 0.12 * Math.sin(T + p.ph); g.fillStyle = "#7a5a1e"; g.fillText(p.ch, p.x, p.y); break;
          case "embers":
            p.x += Math.sin(T + p.ph) * 8 * mv; p.y -= 22 * p.s * mv;
            a = 0.4 + 0.5 * Math.sin(T * 2 + p.ph); if (a < 0) a = 0;
            glow(g, "#c08bff", p.x, p.y, 7 * p.s, a); break;
          default: break;
        }
        if (p.y > WH + 12) { p.y = -10; p.x = Math.random() * WW; } else if (p.y < -12) { p.y = WH + 10; p.x = Math.random() * WW; }
        if (p.x > WW + 12) p.x = -10; else if (p.x < -12) p.x = WW + 10;
      }
      g.globalAlpha = 1;
    }

    // ---------------------------------------------------------------- rendu
    var drawList = [], aimTgt = null;
    var FONT = "900 16px Nunito, 'Baloo 2', system-ui, sans-serif";
    function drawHazards(g) {
      var i, h, p, a, k;
      for (i = 0; i < hz.length; i++) {
        h = hz[i]; if (!h.a) continue;
        if (h.type === 3) {
          a = clamp((h.rmax - h.r) / 90, 0, 1);
          g.globalAlpha = 0.85 * a; g.strokeStyle = "#b79cff"; g.lineWidth = 8;
          g.beginPath(); g.arc(h.x, h.y, h.r, h.gapA + h.gap * 0.5, h.gapA - h.gap * 0.5 + TAU); g.stroke();
          g.globalAlpha = a; g.strokeStyle = "#ffffff"; g.lineWidth = 2.5; g.stroke();
          continue;
        }
        p = clamp(h.t / h.delay, 0, 1);
        k = h.done ? clamp(1 - (h.t - h.delay) / 0.22, 0, 1) : 0;
        g.fillStyle = h.done ? "#ffffff" : "#ff2d2d"; g.strokeStyle = h.done ? "#ffffff" : "#ff3b3b"; g.lineWidth = 3;
        if (h.type === 0) {
          g.globalAlpha = h.done ? k * 0.7 : 0.2; ell(g, h.x, h.y, h.r, h.r * 0.86); g.fill();
          if (!h.done) {
            g.globalAlpha = 0.38; ell(g, h.x, h.y, h.r * p, h.r * 0.86 * p); g.fill();
            g.globalAlpha = 0.75 + 0.25 * Math.sin(T * 18); g.setLineDash(DASH); g.lineDashOffset = -T * 30; ell(g, h.x, h.y, h.r, h.r * 0.86); g.stroke(); g.setLineDash(NODASH);
          }
        } else if (h.type === 1) {
          g.save(); g.translate(h.x, h.y); g.rotate(h.ang);
          g.globalAlpha = h.done ? k * 0.75 : 0.18; g.fillRect(0, -h.w / 2, h.len, h.w);
          if (!h.done) {
            g.globalAlpha = 0.3; g.fillRect(0, -h.w / 2, h.len * p, h.w);
            g.globalAlpha = 0.6 + 0.4 * Math.sin(T * 18); g.strokeRect(0, -h.w / 2, h.len, h.w);
            if (h.w >= 20) { g.globalAlpha = 0.75; g.fillStyle = "#ff4d4d"; for (a = h.len - 14; a > 20; a -= 46) { g.beginPath(); g.moveTo(a, 0); g.lineTo(a - 12, -h.w * 0.32); g.lineTo(a - 6, 0); g.lineTo(a - 12, h.w * 0.32); g.closePath(); g.fill(); } }
          }
          g.restore();
        } else {
          g.globalAlpha = h.done ? k * 0.7 : 0.2; g.beginPath(); g.moveTo(h.x, h.y); g.arc(h.x, h.y, h.r, h.ang - h.half, h.ang + h.half); g.closePath(); g.fill();
          if (!h.done) {
            g.globalAlpha = 0.3; g.beginPath(); g.moveTo(h.x, h.y); g.arc(h.x, h.y, h.r * p, h.ang - h.half, h.ang + h.half); g.closePath(); g.fill();
            g.globalAlpha = 0.6 + 0.4 * Math.sin(T * 18); g.beginPath(); g.moveTo(h.x, h.y); g.arc(h.x, h.y, h.r, h.ang - h.half, h.ang + h.half); g.closePath(); g.stroke();
          }
        }
      }
      g.globalAlpha = 1;
    }
    function drawGround(g) {
      var i, e, k, a;
      if (slowFx > 0) { g.globalAlpha = 0.1 * Math.min(1, slowFx); g.fillStyle = "#f5c26b"; g.fillRect(0, 0, WW, WH); }
      if (iceFx.t > 0) {
        k = iceFx.t / 0.9; g.globalAlpha = 0.4 * k; g.fillStyle = "#dff6ff"; ell(g, iceFx.x, iceFx.y, iceFx.r, iceFx.r * 0.86); g.fill();
        g.globalAlpha = k; g.strokeStyle = "#ffffff"; g.lineWidth = 3; g.stroke();
      }
      if (windFx.t > 0) {
        k = 1 - windFx.t / 0.6; g.strokeStyle = "#ffffff"; g.lineWidth = 4;
        for (i = 0; i < 4; i++) { a = i * 1.57 + k * 5; g.globalAlpha = (1 - k) * 0.7; g.beginPath(); g.arc(windFx.x, windFx.y, 30 + k * 170 + i * 6, a, a + 1.1); g.stroke(); }
      }
      for (i = 0; i < enemies.length; i++) {
        e = enemies[i]; if (e.dead) continue;
        if (e.spawnT > 0) { // flaque d'encre d'apparition
          k = 1 - e.spawnT / e.spawn0;
          g.globalAlpha = 0.75; g.fillStyle = "#14121f"; ell(g, e.x, e.y, e.r * 1.25 * Math.min(1, k * 2), e.r * 0.5 * Math.min(1, k * 2)); g.fill();
          g.globalAlpha = 0.5 * (1 - k); g.strokeStyle = e.boss ? "#ff4d4d" : "#ffffff"; g.lineWidth = 2; ell(g, e.x, e.y, e.r * (1.3 + k), e.r * (0.55 + k * 0.4)); g.stroke();
          continue;
        }
        if (e.kind === "slow_aura" && e.freezeT <= 0) {
          g.globalAlpha = 0.16; g.fillStyle = "#9fdcff"; circ(g, e.x, e.y, 96); g.fill();
          g.globalAlpha = 0.6; g.strokeStyle = "#ffffff"; g.lineWidth = 1.6; g.setLineDash(DASH); g.lineDashOffset = T * 14; g.stroke(); g.setLineDash(NODASH);
        }
      }
      g.globalAlpha = 1;
      drawHazards(g);
      // cible de la visée automatique
      aimTgt = phase === "fight" && hero.hp > 0 ? nearestEnemy(hero.x, hero.y, weapon.reach + 95, false) : null;
      if (aimTgt) { g.globalAlpha = 0.8; g.strokeStyle = "#ffd34d"; g.lineWidth = 2.2; ell(g, aimTgt.x, aimTgt.y + 1, aimTgt.r * 1.15 + Math.sin(T * 8) * 1.5, aimTgt.r * 0.5); g.stroke(); }
      // ombres
      g.fillStyle = "#0a0a1e";
      for (i = 0; i < enemies.length; i++) {
        e = enemies[i]; if (e.dead || e.spawnT > 0) continue;
        g.globalAlpha = (e.fly ? 0.14 : 0.24) * e.alpha; ell(g, e.x, e.y + 1, e.r * (e.fly ? 0.75 : 1), e.r * (e.fly ? 0.26 : 0.36)); g.fill();
      }
      g.globalAlpha = 0.25; ell(g, hero.x, hero.y + 1, 14, 5); g.fill();
      if (hero.slowT > 0) { g.globalAlpha = 0.5; g.fillStyle = "#bfe9ff"; ell(g, hero.x, hero.y + 1, 19, 7); g.fill(); }
      if (pet) { g.globalAlpha = 0.12; g.fillStyle = "#0a0a1e"; ell(g, pet.x, Math.max(pet.y + 30, hero.y - 6), 8, 3); g.fill(); }
      g.globalAlpha = 1;
    }
    function drawEnemy(g, e) {
      var sc = 1, top = e.boss ? e.h : e.r * 2 + (e.fly ? 24 : 10), k, i, a, w;
      if (e.spawnT > 0) { k = 1 - e.spawnT / e.spawn0; if (k < 0.5) return; sc = easeOut((k - 0.5) * 2); }
      g.save(); g.translate(e.x, e.y);
      if (e.alpha < 1) g.globalAlpha = e.alpha;
      if (sc !== 1) g.scale(sc, sc);
      g.save();
      if (e.stunT > 0 && e.freezeT <= 0) g.rotate(Math.sin(T * 22) * 0.05);
      g.scale(e.face, 1);
      e.paint(g, e, darkArena);
      g.restore();
      if (e.freezeT > 0) {
        g.globalAlpha = 0.45; g.fillStyle = "#dff6ff"; rrect(g, -e.r - 5, -top + 2, e.r * 2 + 10, top + 2, 7); g.fill();
        g.globalAlpha = 0.9; g.strokeStyle = "#ffffff"; g.lineWidth = 2; g.stroke();
        g.beginPath(); g.moveTo(-e.r + 2, -top + 12); g.lineTo(-e.r + 10, -top + 6); g.stroke();
      } else if (e.stunT > 0 || (e.state === "rec" && (e.kind === "charge" || e.id === "glacia") && e.st > 0.3)) {
        g.fillStyle = "#ffe066"; g.strokeStyle = INK; g.lineWidth = 1.2;
        for (i = 0; i < 3; i++) { a = T * 5 + i * 2.094; circ(g, Math.cos(a) * (e.r * 0.7 + 4), -top - 4 + Math.sin(a) * 3, 3); g.fill(); g.stroke(); }
      }
      if (e.slowT > 0 && e.freezeT <= 0) {
        g.globalAlpha = 0.95; g.fillStyle = "#fff3cf"; g.strokeStyle = "#8a6a2a"; g.lineWidth = 1.6; circ(g, e.r + 2, -top + 2, 5.5); g.fill(); g.stroke();
        g.beginPath(); g.moveTo(e.r + 2, -top + 2); g.lineTo(e.r + 2, -top - 1.5); g.moveTo(e.r + 2, -top + 2); g.lineTo(e.r + 2 + Math.cos(T * 2) * 3, -top + 2 + Math.sin(T * 2) * 3); g.stroke();
      }
      if (!e.boss && e.hp < e.maxHp && e.hp > 0) {
        w = e.r * 2 + 4; g.globalAlpha = 0.6; g.fillStyle = "#14121f"; rrect(g, -w / 2 - 1.5, -top - 9.5, w + 3, 7, 3.5); g.fill();
        g.globalAlpha = 1; g.fillStyle = e.armor && !(e.crackT > 0) ? "#b9bdc9" : "#ff6b6b"; rrect(g, -w / 2, -top - 8, Math.max(3, w * e.hp / e.maxHp), 4, 2); g.fill();
      }
      if (e.boss && e.shield) {
        k = e.h / 2 + 16;
        g.globalAlpha = 0.2 + 0.05 * Math.sin(T * 5); g.fillStyle = "#b79cff"; circ(g, 0, -e.h / 2, k); g.fill();
        g.globalAlpha = 0.9; g.strokeStyle = "#e6d9ff"; g.lineWidth = 3; g.stroke();
        g.strokeStyle = "#ffffff"; g.lineWidth = 2; g.setLineDash(DASH); g.lineDashOffset = T * 26; circ(g, 0, -e.h / 2, k - 6); g.stroke(); g.setLineDash(NODASH);
        if (shieldSeq && !rune) for (i = 0; i < shieldSeq.need; i++) {
          g.globalAlpha = 1; g.fillStyle = i < shieldSeq.streak ? "#7ee02a" : "#2a1f3d"; g.strokeStyle = "#ffffff"; g.lineWidth = 2;
          circ(g, (i - (shieldSeq.need - 1) / 2) * 18, -e.h - 26, 6); g.fill(); g.stroke();
        }
      }
      g.restore();
    }
    function drawHeroWeapon(g) {
      var h = hero, cy = -20, len = weapon.reach * 0.78, p, ep, a, a0, span, R1, R0, ext;
      g.save();
      if (h.atkT > 0) {
        p = clamp(1 - h.atkT / h.atkDur, 0, 1); ep = easeOut(p);
        if ((weapon.kind === "spear" || weapon.kind === "dagger") && !h.third) {
          a = h.aimA; ext = Math.sin(p * PI) * (weapon.kind === "spear" ? 20 : 12);
          g.globalAlpha = (1 - p) * 0.7; g.strokeStyle = "#ffffff"; g.lineWidth = 7;
          g.beginPath(); g.moveTo(Math.cos(a) * 14, cy + Math.sin(a) * 14); g.lineTo(Math.cos(a) * (weapon.reach + 6), cy + Math.sin(a) * (weapon.reach + 6)); g.stroke();
          g.globalAlpha = 1; g.translate(Math.cos(a) * (8 + ext), cy + Math.sin(a) * (8 + ext)); g.rotate(a);
        } else {
          span = h.third ? TAU : 2.5; a0 = h.aimA - h.swing * span / 2; a = a0 + h.swing * span * ep;
          R1 = weapon.reach + (h.third ? 10 : 0) + 4; R0 = R1 * 0.5;
          g.globalAlpha = (1 - p * p) * 0.8; g.fillStyle = h.third ? "#ffe08a" : "#ffffff";
          g.beginPath(); g.arc(0, cy + 6, R1, a0, a, h.swing < 0); g.arc(0, cy + 6, R0, a, a0, h.swing > 0); g.closePath(); g.fill();
          g.globalAlpha = 1; g.translate(Math.cos(a) * 10, cy + 6 + Math.sin(a) * 10); g.rotate(a);
        }
      } else {
        g.translate(h.face * 13, cy + 8); g.scale(h.face, 1); g.rotate(-1.0 + (h.moving ? Math.sin(h.walk) * 0.12 : 0));
      }
      paintWeapon(g, weapon.kind, weapon.id, len);
      g.restore();
    }
    function drawHero(g) {
      var h = hero, hop = phase === "victory" ? Math.abs(Math.sin(T * 8)) * 9 : 0;
      var bob = h.moving && h.dashT <= 0 ? Math.abs(Math.sin(h.walk)) * 3.5 : Math.sin(T * 2.4) * 0.8;
      var behind = h.atkT > 0 && Math.sin(h.aimA) < -0.35, blink = h.invT > 0 && h.hp > 0 && Math.sin(T * 38) > 0.1, k;
      g.save(); g.translate(h.x, h.y - hop);
      if (h.healT > 0) glow(g, "#4be07a", 0, -22, 44, h.healT * 0.7);
      if (h.echo > 0) { g.strokeStyle = "#b79cff"; g.lineWidth = 2; for (k = 0; k < 2; k++) { g.globalAlpha = 0.7 - ((T * 0.9 + k * 0.5) % 1) * 0.7; ell(g, 0, 0, 14 + ((T * 0.9 + k * 0.5) % 1) * 22, 5 + ((T * 0.9 + k * 0.5) % 1) * 8); g.stroke(); } g.globalAlpha = 1; }
      if (behind && h.hp > 0) drawHeroWeapon(g);
      g.save();
      g.translate(0, -bob);
      if (h.dashT > 0) { g.translate(0, -22); g.rotate(h.face * (1 - h.dashT / 0.26) * TAU); g.scale(1.1, 0.9); g.translate(0, 22); }
      else if (h.fall > 0) { g.translate(0, -8 * h.fall); g.rotate(h.face * -1.25 * easeOut(h.fall)); }
      g.scale(h.face * (1 - h.sq), 1 + h.sq);
      if (blink) g.globalAlpha = 0.35;
      g.drawImage(heroSprite, -27, -52, 54, 54);
      if (h.hurtT > 0) { g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.6; g.drawImage(heroSprite, -27, -52, 54, 54); g.globalCompositeOperation = "source-over"; }
      g.restore();
      if (!behind && h.hp > 0) drawHeroWeapon(g);
      if (h.shieldT > 0 && (h.shieldT > 1 || Math.sin(T * 26) > 0)) {
        g.globalAlpha = 0.24; g.fillStyle = "#9fe0ff"; circ(g, 0, -22, 33); g.fill();
        g.globalAlpha = 0.95; g.strokeStyle = "#e6f8ff"; g.lineWidth = 3; g.stroke();
        g.globalAlpha = 0.7; g.lineWidth = 2; g.beginPath(); g.arc(0, -22, 26, PI * 1.1 + T, PI * 1.5 + T); g.stroke();
      }
      g.restore();
    }
    function drawPet(g) {
      var p = pet, fl = Math.sin(p.t * 22) * 0.12;
      g.save(); g.translate(p.x, p.y); g.scale(p.face, 1 + fl); if (p.st === 1) g.rotate(0.35);
      g.drawImage(petSprite, -15, -15, 30, 30); g.restore();
    }
    function drawProjs(g) {
      var i, p, a;
      for (i = 0; i < projs.length; i++) {
        p = projs[i]; if (!p.a) continue;
        if (p.type === 9) { glow(g, "#ff8a3d", p.x, p.y, p.r * 2.4, 0.95); g.fillStyle = "#ffd27a"; circ(g, p.x, p.y, p.r * 0.62); g.fill(); g.fillStyle = "#ffffff"; circ(g, p.x, p.y, p.r * 0.3); g.fill(); continue; }
        g.globalAlpha = 0.2; g.fillStyle = "#0a0a1e"; ell(g, p.x, p.y + 16, p.r, p.r * 0.4); g.fill(); g.globalAlpha = 1;
        if (p.type === 1) {
          a = Math.atan2(p.vy, p.vx); g.save(); g.translate(p.x, p.y); g.rotate(a);
          g.fillStyle = "#4f7f3a"; g.strokeStyle = INK; g.lineWidth = 1.6; tri(g, -9, -5, 11, 0, -9, 5); g.fill(); g.stroke(); g.restore();
        } else if (p.type === 2) {
          glow(g, "#b79cff", p.x, p.y, p.r * 2.6, 0.9); g.fillStyle = "#1a1228"; circ(g, p.x, p.y, p.r * 0.8); g.fill(); g.strokeStyle = "#e6d9ff"; g.lineWidth = 1.6; g.stroke();
        } else {
          g.fillStyle = "#22203a"; circ(g, p.x, p.y, p.r); g.fill(); g.strokeStyle = "#c9c4ea"; g.lineWidth = 1.8; g.stroke();
          g.fillStyle = "#8f8ab8"; circ(g, p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.28); g.fill();
        }
      }
    }
    function drawStars(g) {
      var i, s, k, x, y;
      for (i = 0; i < stars.length; i++) {
        s = stars[i]; if (!s.a) continue;
        g.globalAlpha = 0.55; g.strokeStyle = "#ffe066"; g.lineWidth = 2; ell(g, s.tx, s.ty, 16, 9); g.stroke();
        if (s.t < s.delay) continue;
        k = (s.t - s.delay) / 0.42; x = s.tx + (1 - k) * 80; y = s.ty - (1 - k) * 360;
        g.globalAlpha = 0.8; g.strokeStyle = "#fff3b0"; g.lineWidth = 5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 18, y - 80); g.stroke();
        g.globalAlpha = 1; glow(g, "#ffe066", x, y, 22, 0.95); g.fillStyle = "#ffffff"; g.beginPath(); g.moveTo(x, y - 9); g.lineTo(x + 3, y - 3); g.lineTo(x + 9, y); g.lineTo(x + 3, y + 3); g.lineTo(x, y + 9); g.lineTo(x - 3, y + 3); g.lineTo(x - 9, y); g.lineTo(x - 3, y - 3); g.closePath(); g.fill();
      }
      g.globalAlpha = 1;
    }
    function drawParts(g) {
      var i, p, k, s;
      g.font = FONT; g.textAlign = "center"; g.textBaseline = "middle";
      for (i = 0; i < MAXP; i++) {
        p = parts[i]; if (!p.a) continue;
        k = p.life / p.max; if (k < 0) k = 0;
        g.globalAlpha = k > 0.5 ? 1 : k * 2;
        switch (p.type) {
          case 0: g.fillStyle = p.col; circ(g, p.x, p.y, p.size * (0.35 + 0.65 * k)); g.fill(); break;
          case 1: g.save(); g.translate(p.x, p.y); g.rotate(Math.sin(p.rot) * 0.5); s = p.size / 16; g.scale(s, s); g.lineWidth = 3; g.strokeStyle = p.col === "#17121f" ? "#ffffff" : INK; g.strokeText(p.ch, 0, 0); g.fillStyle = p.col; g.fillText(p.ch, 0, 0); g.restore(); break;
          case 2: g.strokeStyle = p.col; g.lineWidth = p.size * (0.3 + 0.7 * k); g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.045, p.y - p.vy * 0.045); g.stroke(); break;
          case 3: g.globalAlpha = k; g.strokeStyle = p.col; g.lineWidth = p.lw * (0.3 + 0.7 * k); ell(g, p.x, p.y, p.size, p.size * 0.86); g.stroke(); break;
          case 4: s = p.size * (0.4 + 0.6 * k); g.fillStyle = p.col; g.beginPath(); g.moveTo(p.x, p.y - s * 1.6); g.lineTo(p.x + s * 0.4, p.y - s * 0.4); g.lineTo(p.x + s * 1.6, p.y); g.lineTo(p.x + s * 0.4, p.y + s * 0.4); g.lineTo(p.x, p.y + s * 1.6); g.lineTo(p.x - s * 0.4, p.y + s * 0.4); g.lineTo(p.x - s * 1.6, p.y); g.lineTo(p.x - s * 0.4, p.y - s * 0.4); g.closePath(); g.fill(); break;
          case 5: s = p.size; g.strokeStyle = p.col; g.lineWidth = 1.6; g.beginPath(); g.moveTo(p.x - s, p.y); g.lineTo(p.x + s, p.y); g.moveTo(p.x - s * 0.5, p.y - s * 0.87); g.lineTo(p.x + s * 0.5, p.y + s * 0.87); g.moveTo(p.x + s * 0.5, p.y - s * 0.87); g.lineTo(p.x - s * 0.5, p.y + s * 0.87); g.stroke(); break;
          case 6: g.globalAlpha = k * 0.55; g.fillStyle = p.col; circ(g, p.x, p.y, p.size * (1.7 - k * 0.7)); g.fill(); break;
          case 7: g.fillStyle = p.col; g.beginPath(); g.ellipse(p.x, p.y, p.size, p.size * 0.45, p.rot, 0, TAU); g.fill(); break;
          default: s = p.size; g.fillStyle = p.col; g.fillRect(p.x - s, p.y - s * 0.3, s * 2, s * 0.6); g.fillRect(p.x - s * 0.3, p.y - s, s * 0.6, s * 2); break;
        }
      }
      g.globalAlpha = 1;
    }
    function drawBolts(g) {
      var i, j, b, k;
      for (i = 0; i < bolts.length; i++) {
        b = bolts[i]; if (!b.a) continue;
        k = clamp(b.life / 0.45, 0, 1);
        g.beginPath(); g.moveTo(b.pts[0], b.pts[1]); for (j = 1; j < b.n; j++) g.lineTo(b.pts[j * 2], b.pts[j * 2 + 1]);
        g.globalAlpha = 0.6 * k; g.strokeStyle = "#ffe066"; g.lineWidth = 11; g.stroke();
        g.globalAlpha = Math.min(1, k * 1.5); g.strokeStyle = "#ffffff"; g.lineWidth = 3.5; g.stroke();
      }
      g.globalAlpha = 1;
    }
    function drawNums(g) {
      var i, d, k, s;
      g.font = FONT; g.textAlign = "center"; g.textBaseline = "middle"; g.lineWidth = 4; g.strokeStyle = INK;
      for (i = 0; i < nums.length; i++) {
        d = nums[i]; if (!d.a) continue;
        k = d.life / d.max; s = d.size / 16 * (k > 0.85 ? 1 + (k - 0.85) * 3 : 1);
        g.globalAlpha = k < 0.3 ? k / 0.3 : 1;
        g.save(); g.translate(clamp(d.x, 30, WW - 30), d.y); g.scale(s, s); g.strokeText(d.txt, 0, 0); g.fillStyle = d.col; g.fillText(d.txt, 0, 0); g.restore();
      }
      g.globalAlpha = 1;
    }
    function render(rdt) {
      var g = ctx, k = dpr * S, i, j, n, e, heroDrawn = false;
      if (shake > 0) { shakeX = (Math.random() * 2 - 1) * shake; shakeY = (Math.random() * 2 - 1) * shake; } else shakeX = shakeY = 0;
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
      if (shakeX || shakeY) { g.fillStyle = arena.base; g.fillRect(0, 0, canvas.width, canvas.height); }
      g.drawImage(bg, Math.round(shakeX * k), Math.round(shakeY * k));
      g.setTransform(k, 0, 0, k, shakeX * k, shakeY * k);
      g.lineJoin = "round"; g.lineCap = "round";
      drawSea(g);
      drawGround(g);
      // tri en profondeur (insertion, sans allocation)
      n = 0;
      for (i = 0; i < enemies.length; i++) if (!enemies[i].dead) drawList[n++] = enemies[i];
      for (i = 1; i < n; i++) { e = drawList[i]; j = i - 1; while (j >= 0 && drawList[j].y > e.y) { drawList[j + 1] = drawList[j]; j--; } drawList[j + 1] = e; }
      for (i = 0; i < n; i++) {
        e = drawList[i];
        if (!heroDrawn && e.y > hero.y) { drawHero(g); heroDrawn = true; }
        drawEnemy(g, e);
      }
      if (!heroDrawn) drawHero(g);
      if (pet) drawPet(g);
      drawProjs(g); drawStars(g); drawParts(g); drawBolts(g); drawNums(g);
      drawAmbient(g, rdt || 0);
      if (flashA > 0.01) { g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = Math.min(reduced ? 0.18 : 1, flashA); g.fillStyle = "#ffffff"; g.fillRect(0, 0, canvas.width, canvas.height); g.globalAlpha = 1; }
    }

    // ---------------------------------------------------------------- HUD
    var hud = { hp: -1, pot: -1, dash: -1, boss: -1, shield: null };
    function syncHud() {
      var h = hero, hp = Math.ceil(h.hp), q, i, sp;
      if (hp !== hud.hp) {
        hud.hp = hp; elHpFill.style.transform = "scaleX(" + clamp(h.hp / h.maxHp, 0, 1).toFixed(3) + ")";
        elHpTxt.textContent = hp + "/" + Math.round(h.maxHp); elHp.classList.toggle("cb-low", h.hp / h.maxHp < 0.3); root.classList.toggle("cb-lowhp", h.hp > 0 && h.hp / h.maxHp < 0.35);
      }
      if (potions !== hud.pot) { hud.pot = potions; elCount.textContent = potions; elPotion.classList.toggle("cb-empty", potions <= 0); }
      for (i = 0; i < spells.length; i++) {
        sp = spells[i]; q = sp.cdT > 0 ? Math.ceil(sp.cdT / sp.cooldown * 50) : 0;
        if (q !== sp.shown) { sp.shown = q; sp.el.style.setProperty("--cd", (q / 50).toFixed(2)); sp.el.classList.toggle("cb-ready", q === 0); }
      }
      q = h.dashCdT > 0 ? Math.ceil(h.dashCdT / H0.dashCd * 30) : 0;
      if (q !== hud.dash) { hud.dash = q; elDash.style.setProperty("--cd", (q / 30).toFixed(2)); elDash.classList.toggle("cb-ready", q === 0); }
      if (boss) {
        q = Math.ceil(Math.max(0, boss.hp) / boss.maxHp * 300);
        if (q !== hud.boss) { hud.boss = q; elBossFill.style.transform = "scaleX(" + (q / 300).toFixed(3) + ")"; }
        if (boss.shield !== hud.shield) { hud.shield = boss.shield; elBossBar.classList.toggle("cb-shielded", !!boss.shield); }
      }
    }
    function showBanner(txt, cls, dur) {
      if (simulating) return;
      elBanner.className = "cb-banner"; elBanner.textContent = txt; void elBanner.offsetWidth;
      elBanner.className = "cb-banner " + (cls || ""); elBanner.hidden = false; bannerT = dur || 1.2;
    }
    function setWaveLabel() {
      elWave.textContent = bossOn ? "Boss" : waves.length ? "Vague " + Math.max(1, waveI + 1) + "/" + waves.length : (bossDef ? "Boss" : "");
    }

    // ---------------------------------------------------------------- déroulement
    function startWave(i) {
      waveI = i; spawnQ = waves[i]; spawnQi = 0; spawnT = 0.25; setWaveLabel();
      if (i > 0) { showBanner("Vague " + (i + 1) + " !", "cb-b-wave", 1.2); sfx("wave"); }
    }
    function startBoss() {
      var i, t = "";
      bossOn = true; spawnQ = []; spawnQi = 0; setWaveLabel();
      boss = makeBoss(bossDef);
      elBossName.textContent = bossDef.name || bossDef.id;
      for (i = 0; i < boss.rules.thr.length; i++) t += '<i style="left:' + (boss.rules.thr[i] * 100) + '%"></i>';
      elBossTicks.innerHTML = t; hud.boss = -1; hud.shield = null; elBossBar.hidden = false;
      showBanner("BOSS !", "cb-b-boss", 1.5); sfx("boss"); addShake(6);
    }
    function nextStage() {
      if (waveI + 1 < waves.length) startWave(waveI + 1);
      else if (bossDef && !bossOn && !bossDone) startBoss();
      else victory();
    }
    function victory() {
      var i, p;
      if (phase !== "fight") return;
      phase = "victory"; victoryT = reduced ? 1.2 : 1.9; if (rune) closeRune(); shieldSeq = null; clearInput();
      showBanner("Victoire !", "cb-b-win", 2.4); sfx("win"); vib(80);
      elHint.hidden = true; hintT = 0;
      if (!simulating) for (i = 0; i < (reduced ? 8 : 26); i++) {
        p = part(i % 3 === 0 ? 4 : 1, rnd(bx0, bx1), rnd(by0, by1), rnd(-30, 30), rnd(-150, -60), rnd(1.1, 1.8), rnd(8, 18), ["#ffe066", "#ffffff", "#7ee02a", "#7fd6ff", "#ff9ecb"][i % 5], LETTERS.charAt((Math.random() * LETTERS.length) | 0));
        p.drag = 0.6;
      }
    }
    function lose() {
      if (phase !== "fight") return;
      phase = "defeat"; defeats++; if (rune) closeRune(); clearInput();
      sfx("lose"); vib(160); elHint.hidden = true; hintT = 0; elBanner.hidden = true; bannerT = 0;
      var pico = opts.pet && typeof opts.pet.svg === "string" && opts.pet.svg.indexOf("<svg") >= 0 ? opts.pet.svg : "🦜";
      elOverlay.innerHTML = '<div class="cb-card cb-card-defeat" role="dialog" aria-label="Défaite">' +
        '<div class="cb-card-pico">' + pico + "</div>" +
        "<h2>Oups… Pico te relève !</h2>" +
        "<p>Pas grave : on apprend en se trompant. On y retourne ?</p>" +
        '<button type="button" class="cb-mbtn cb-primary" data-act="retry">Réessayer</button>' +
        (defeats >= 2 && !easy ? '<button type="button" class="cb-mbtn cb-easy" data-act="easy">🌱 Mode facile</button><small>Les ennemis seront un peu moins forts.</small>' : "") +
        (easy ? "<small>Mode facile activé 🌱</small>" : "") +
        '<button type="button" class="cb-mbtn cb-ghost" data-act="quit">Quitter</button>' +
        '<div class="cb-card-tries">Essai n° ' + (tries + 1) + "</div></div>";
      elOverlay.hidden = false;
    }
    function pause() {
      if (paused || ended || destroyed || phase === "defeat" || phase === "victory") return;
      paused = true; clearInput(); dirty = true; sfx("pause");
      elOverlay.innerHTML = '<div class="cb-card" role="dialog" aria-label="Pause"><h2>Pause</h2>' +
        '<button type="button" class="cb-mbtn cb-primary" data-act="resume">Reprendre</button>' +
        '<button type="button" class="cb-mbtn" data-act="restart">Recommencer</button>' +
        '<button type="button" class="cb-mbtn cb-ghost" data-act="quit">Quitter</button></div>';
      elOverlay.hidden = false; root.classList.add("cb-paused");
    }
    var tuto = null;
    function showTuto() {
      if (tuto || destroyed || simulating) return;
      paused = true; clearInput(); dirty = true; root.classList.add("cb-paused"); elOverlay.hidden = false;
      tuto = mountTuto(elOverlay, function () {
        tuto = null; paused = false; lastNow = 0; root.classList.remove("cb-paused"); elOverlay.hidden = true;
        try { if (opts.onTutorial) opts.onTutorial(); } catch (err) { /* ignoré */ }
      }, sfx);
    }
    function resume() {
      if (tuto) return;                       // le tutoriel se ferme avec ses propres boutons
      if (!paused || destroyed) return;
      paused = false; lastNow = 0; root.classList.remove("cb-paused");
      if (phase !== "defeat") elOverlay.hidden = true;
    }
    function begin(retry) {
      var i;
      enemies.length = 0; clearPools(); spawnQ = []; spawnQi = 0; waveI = -1; pendingNext = 0; bossOn = false; bossDone = false; boss = null;
      kills = quizOk = quizTotal = potionsUsed = 0; potions = potions0; fightT = 0; ts = 1; hitstop = 0; shake = 0; flashA = 0; slowFx = 0; iceFx.t = 0; windFx.t = 0;
      rune = null; shieldSeq = null; elRune.hidden = true; root.classList.remove("cb-runeopen"); root.classList.remove("cb-paused");
      elOverlay.hidden = true; elBossBar.hidden = true; elHint.hidden = true; elBanner.hidden = true; bannerT = hintT = 0; hurtFx = 0; elVignette.classList.remove("cb-hurt");
      for (i = 0; i < spells.length; i++) { spells[i].cdT = 0; spells[i].shown = -1; }
      hud.hp = hud.pot = hud.dash = hud.boss = -1;
      TELE = clamp(1 / Math.sqrt(difficulty), 0.86, 1.3);
      resetHero(); clearInput(); setWaveLabel(); paused = false; ended = false;
      if (opts.skipIntro) { phase = "fight"; }
      else if (!retry && opts.intro) { phase = "intro"; introT = 2.0; showBanner(String(opts.intro), "cb-b-intro", 2.0); }
      else { phase = "countdown"; cdN = 3; cdT = 0.15; }
      syncHud(); dirty = true;
    }
    function restart(easyMode) {
      if (destroyed || resultSent) return;
      tries++;
      if (easyMode) { easy = true; difficulty = baseDifficulty * 0.7; }
      begin(true);
    }
    function finish(win, quit) {
      if (resultSent || destroyed) return;
      if (tuto) { tuto.close(); tuto = null; elOverlay.innerHTML = ""; }
      ended = true; paused = false; phase = "ended"; if (rune) closeRune(); elOverlay.hidden = true; root.classList.remove("cb-paused"); clearInput(); endT = 1.0;
      var hpLeft = Math.max(win ? 1 : 0, Math.round(hero.hp)), ratio = quizTotal ? quizOk / quizTotal : 1, frac = hpLeft / hero.maxHp, starsN = 0;
      if (win) starsN = frac >= 0.6 && ratio >= 0.7 ? 3 : (frac >= 0.3 || ratio >= 0.5) ? 2 : 1;
      resultSent = { win: !!win, quit: !!quit, hpLeft: hpLeft, maxHp: Math.round(hero.maxHp), time: Math.round(fightT * 10) / 10, kills: kills, quizOk: quizOk, quizTotal: quizTotal,
        potionsUsed: potionsUsed, stars: starsN, tries: tries, easy: easy, difficulty: Math.round(difficulty * 100) / 100 };
      try { if (opts.onEnd) opts.onEnd(resultSent); } catch (err) { if (window.console && console.error) console.error("Combat onEnd :", err); }
    }
    function updParts(dt) {
      var i, p, f;
      for (i = 0; i < MAXP; i++) {
        p = parts[i]; if (!p.a) continue;
        p.life -= dt; if (p.life <= 0) { p.a = false; continue; }
        if (p.type === 3) { p.size += p.vx * dt; if (p.size < 2) p.size = 2; continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; f = 1 - p.drag * dt; if (f < 0) f = 0; p.vx *= f; p.vy *= f; p.rot += p.vr * dt;
      }
      for (i = 0; i < nums.length; i++) { p = nums[i]; if (!p.a) continue; p.life -= dt; if (p.life <= 0) { p.a = false; continue; } p.y += p.vy * dt; p.vy *= 1 - 2.5 * dt; }
      for (i = 0; i < bolts.length; i++) if (bolts[i].a) { bolts[i].life -= dt; if (bolts[i].life <= 0) bolts[i].a = false; }
    }
    function updFight(dt, rdt) {
      var i, d;
      updHero(dt, rdt); if (phase !== "fight") return;
      if (pet) updPet(dt);
      for (i = 0; i < enemies.length; i++) if (!enemies[i].dead) updEnemy(enemies[i], dt);
      if (phase !== "fight") return;
      separate(); updHazards(dt); updProjs(dt); updStars(dt);
      if (phase !== "fight") return;
      for (i = 0; i < delayed.length; i++) { d = delayed[i]; if (d.a) { d.t -= dt; if (d.t <= 0) { d.a = false; floatTxt(hero.x, hero.y - 62, "Écho !", "#d9c2ff", 16); castSpell(d.i, d.pw); } } }
      for (i = 0; i < spells.length; i++) if (spells[i].cdT > 0) spells[i].cdT -= dt;
      if (iceFx.t > 0) iceFx.t -= dt; if (windFx.t > 0) windFx.t -= dt; if (slowFx > 0) slowFx -= dt;
      if (rune) updRune(rdt);
      else if (shieldSeq) { shieldSeq.wait -= rdt; if (shieldSeq.wait <= 0) openRune("shield", -1); }
      for (i = enemies.length - 1; i >= 0; i--) if (enemies[i].dead) { enemies[i] = enemies[enemies.length - 1]; enemies.pop(); }
      if (opts.sandbox) return;
      if (spawnQi < spawnQ.length) { spawnT -= dt; if (spawnT <= 0) { makeEnemy(spawnQ[spawnQi++]); spawnT = TUNING.spawnGap; } }
      else if (pendingNext > 0) { pendingNext -= dt; if (pendingNext <= 0) nextStage(); }
      else if (enemies.length === 0) pendingNext = waveI < 0 && !bossOn ? 0.05 : bossDone ? 0.85 : TUNING.waveGap;
    }
    function tick(rdt) {
      var dt;
      T += rdt;
      while (tapEls.length && tapTs[0] <= T) { tapEls.shift().classList.remove("cb-tap"); tapTs.shift(); }
      if (bannerT > 0) { bannerT -= rdt; if (bannerT <= 0) elBanner.hidden = true; }
      if (hintT > 0) { hintT -= rdt; if (hintT <= 0) elHint.hidden = true; }
      if (hintCd > 0) hintCd -= rdt;
      if (shieldMsgCd > 0) shieldMsgCd -= rdt;
      ts += ((rune ? 0.15 : 1) - ts) * Math.min(1, rdt * 14);
      dt = rdt * ts;
      if (hitstop > 0) { hitstop -= rdt; dt = 0; }
      if (shake > 0) { shake -= rdt * 32; if (shake < 0) shake = 0; }
      if (flashA > 0) flashA = Math.max(0, flashA - rdt * 2.6);
      if (hurtFx > 0) { if (hurtFx === 1) elVignette.classList.add("cb-hurt"); hurtFx -= rdt * 3; if (hurtFx <= 0) { hurtFx = 0; elVignette.classList.remove("cb-hurt"); } }
      switch (phase) {
        case "intro":
          introT -= rdt; if (pet) updPet(dt);
          if (introT <= 0) { phase = "countdown"; cdN = 3; cdT = 0; }
          break;
        case "countdown":
          cdT -= rdt; updHero(dt, rdt); if (pet) updPet(dt);
          if (cdT <= 0) {
            if (cdN > 0) { showBanner("" + cdN, "cb-b-num", 0.6); sfx("countdown"); cdN--; cdT = 0.6; }
            else { showBanner("Go !", "cb-b-num cb-b-go", 0.7); sfx("go"); phase = "fight"; }
          }
          break;
        case "fight":
          fightT += rdt; updFight(dt, rdt);
          if (landHint && !landHintShown && !rune && hintT <= 0 && !simulating) { landHintShown = true; showHint("📱 Tourne ton téléphone à la verticale : c'est plus facile !", 4.5); }
          break;
        case "victory": victoryT -= rdt; if (pet) updPet(dt); if (victoryT <= 0) finish(true, false); break;
        case "defeat": hero.fall = Math.min(1, hero.fall + rdt * 3); if (pet) { pet.x += (hero.x + 22 - pet.x) * Math.min(1, rdt * 4); pet.y += (hero.y - 16 - pet.y) * Math.min(1, rdt * 4); pet.t += rdt; } break;
        default: break;
      }
      updParts(dt);
      if (!simulating) syncHud();
    }
    var rafId = 0, perfSum = 0, perfN = 0, perfMax = 0;
    function frame(now) {
      var rdt, t0;
      rafId = 0; if (destroyed) return;
      rafId = requestAnimationFrame(frame);
      if (needLayout && now - layoutAt > 120) { layoutAt = now; layout(); }
      rdt = lastNow ? (now - lastNow) / 1000 : 0.016; lastNow = now;
      if (rdt > 0.05) rdt = 0.05;
      if (rdt <= 0) return;
      if (paused) { if (dirty) { render(0); dirty = false; } return; }
      if (ended) { endT -= rdt; if (endT <= 0) { cancelAnimationFrame(rafId); rafId = 0; return; } }
      t0 = performance.now();
      if (bot.on) botStep(rdt);
      tick(rdt); render(rdt);
      t0 = performance.now() - t0; perfSum += t0; perfN++; if (t0 > perfMax) perfMax = t0;
    }

    // ---------------------------------------------------------------- bot de test (joue « comme un enfant »)
    var bot = { on: false, acc: 0.8, dodge: 0.45, idle: 0.15, spells: true, ansT: 0, inRune: false, spellT: 1.5, idleT: 0, nextIdle: 2, seen: [] };
    for (i0 = 0; i0 < hz.length; i0++) bot.seen.push(0);
    function botStep(rdt) {
      var h = hero, i, z, e, dx, dy, d, mx = 0, my = 0, danger = false, k, c, s, sp;
      inp.botX = inp.botY = 0; inp.botAtk = false;
      if (phase !== "fight" || paused || !h || h.hp <= 0) return;
      if (rune) {
        if (!bot.inRune) { bot.inRune = true; bot.ansT = rnd(1.3, 2.8); }
        if (!rune.done) { bot.ansT -= rdt; if (bot.ansT <= 0) { k = rune.order.indexOf(rune.q.answer); answerRune(Math.random() < bot.acc ? k : (k + 1) % rune.order.length); bot.inRune = false; } }
        return;
      }
      bot.inRune = false;
      for (i = 0; i < hz.length; i++) {
        z = hz[i]; if (!z.a) { bot.seen[i] = 0; continue; }
        if (z.done || z.type === 3) {
          if (z.type === 3 && !z.hit) { dx = h.x - z.x; dy = h.y - z.y; d = Math.sqrt(dx * dx + dy * dy); if (d - z.r > 0 && d - z.r < 30 && h.dashCdT <= 0 && bot.seen[i] === 0) { bot.seen[i] = Math.random() < bot.dodge ? 1 : 2; if (bot.seen[i] === 1) { inp.dashQ = true; mx = -dx / d; my = -dy / d; danger = true; } } }
          continue;
        }
        if (!heroInHazard(z, 14)) continue;
        if (bot.seen[i] === 0) bot.seen[i] = Math.random() < bot.dodge ? 1 : 2;
        if (bot.seen[i] !== 1) continue;
        danger = true;
        if (z.type === 0) { dx = h.x - z.x; dy = h.y - z.y; d = Math.sqrt(dx * dx + dy * dy); if (d < 4) { dx = (bx0 + bx1) / 2 - h.x; dy = (by0 + by1) / 2 - h.y; d = Math.sqrt(dx * dx + dy * dy) || 1; } mx += dx / d; my += dy / d; }
        else { c = Math.cos(z.ang); s = Math.sin(z.ang); dx = h.x - z.x; dy = h.y - z.y; k = (dx * -s + dy * c) >= 0 ? 1 : -1; mx += -s * k; my += c * k; }
      }
      if (!danger) {
        if (bot.idleT > 0) { bot.idleT -= rdt; return; }
        bot.nextIdle -= rdt; if (bot.nextIdle <= 0) { bot.nextIdle = rnd(1.5, 3.5); bot.idleT = bot.idle * rnd(1, 4); }
        e = nearestEnemy(h.x, h.y, 5000, false);
        if (e) {
          dx = e.x - h.x; dy = e.y - h.y; d = Math.sqrt(dx * dx + dy * dy) || 1;
          if (d - e.r > weapon.reach * 0.8) { mx = dx / d; my = dy / d; }
          if (d - e.r < weapon.reach + 26) inp.botAtk = true;
        }
      }
      if (bot.spells) {
        bot.spellT -= rdt;
        if (bot.spellT <= 0) {
          bot.spellT = rnd(0.8, 2.2);
          for (i = 0; i < spells.length; i++) {
            sp = spells[i]; if (sp.cdT > 0) continue;
            if (sp.effect === "heal" && h.hp / h.maxHp > 0.6) continue;
            if (sp.effect === "shield" && h.hp / h.maxHp > 0.75) continue;
            if (sp.effect !== "heal" && sp.effect !== "shield" && !nearestEnemy(h.x, h.y, 300, false)) continue;
            if (sp.effect === "double" && spells.length < 2) continue;
            if (pressSpell(i)) break;
          }
        }
      }
      if (potions > 0 && h.hp / h.maxHp < 0.35) usePotion();
      inp.botX = mx; inp.botY = my;
    }
    function setBot(cfg) {
      if (cfg === false || cfg == null) { bot.on = false; inp.botX = inp.botY = 0; inp.botAtk = false; return; }
      bot.on = true;
      if (typeof cfg === "object") { if (cfg.acc != null) bot.acc = cfg.acc; if (cfg.dodge != null) bot.dodge = cfg.dodge; if (cfg.idle != null) bot.idle = cfg.idle; if (cfg.spells != null) bot.spells = !!cfg.spells; }
    }
    function liveCount() { var n = 0, i; for (i = 0; i < enemies.length; i++) if (!enemies[i].dead) n++; return n + (spawnQ.length - spawnQi); }

    // ---------------------------------------------------------------- poignée publique
    var debug = {
      spawn: function (id, x, y, hp) { if (phase !== "fight") return false; var e = makeEnemy(id, x, y, false); if (hp > 0) e.hp = e.maxHp = hp; return true; },
      killAll: function () { for (var i = enemies.length - 1; i >= 0; i--) if (!enemies[i].boss) killEnemy(enemies[i], false); },
      hurtHero: function (n) { hero.invT = hero.dodgeT = hero.shieldT = 0; return hurtHero(n == null ? 10 : n, hero.x, hero.y - 1); },
      setHeroHp: function (n) { hero.hp = clamp(n, 1, hero.maxHp); },
      godMode: function (onOff) { hero.shieldT = onOff ? 1e9 : 0; },
      bossHp: function (frac) { if (!boss || boss.dead) return false; hitEnemy(boss, Math.max(1, boss.hp - boss.maxHp * frac), "spell", 0, 0, false); return true; },
      skipIntro: function () { if (phase === "intro" || phase === "countdown") { introT = 0; cdN = 0; cdT = 0; } },
      skipWave: function () { spawnQi = spawnQ.length; this.killAll(); },
      ready: function () { for (var i = 0; i < spells.length; i++) spells[i].cdT = 0; hero.dashCdT = 0; },
      cast: function (i, pw) { castSpell(i, pw == null ? 1 : pw); },
      moveHero: function (x, y) { hero.x = clamp(x, bx0, bx1); hero.y = clamp(y, by0, by1); },
      bot: setBot,
      info: function () {
        var list = [], i, e, nh = 0, np = 0, npa = 0;
        for (i = 0; i < enemies.length; i++) { e = enemies[i]; list.push({ id: e.id, x: Math.round(e.x), y: Math.round(e.y), hp: e.hp, maxHp: e.maxHp, state: e.state, armor: e.armor, crack: e.crackT > 0, boss: e.boss, shield: e.shield, stun: e.stunT > 0, frozen: e.freezeT > 0, slow: e.slowT > 0, phase: e.phase, spawning: e.spawnT > 0 }); }
        var hzl = [];
        for (i = 0; i < hz.length; i++) if (hz[i].a) { nh++; hzl.push({ i: i, type: hz[i].type, delay: hz[i].delay, t: hz[i].t, dmg: hz[i].dmg, done: hz[i].done, x: hz[i].x, y: hz[i].y, r: hz[i].r, ang: hz[i].ang, hit: hz[i].hit, inside: !hz[i].done && hz[i].type !== 3 && heroInHazard(hz[i], 14) }); }
        for (i = 0; i < projs.length; i++) if (projs[i].a) np++;
        for (i = 0; i < parts.length; i++) if (parts[i].a) npa++;
        return { hero: { x: hero.x, y: hero.y, hp: hero.hp, maxHp: hero.maxHp, shield: hero.shieldT > 0, echo: hero.echo, slow: hero.slowT > 0, combo: hero.combo, dashCd: hero.dashCdT, face: hero.face },
          enemies: list.map(function (o, k) { o.r = enemies[k].r; o.dead = !!enemies[k].dead; return o; }), reach: weapon.reach, potions: potions, phase: phase, paused: paused, hazards: nh, hazardList: hzl, projectiles: np, particles: npa, bounds: { x0: bx0, y0: by0, x1: bx1, y1: by1 }, world: { w: WW, h: WH, scale: S, dpr: dpr },
          spells: spells.map(function (s) { return { id: s.id, cd: s.cdT, effect: s.effect }; }), rune: rune ? { kind: rune.kind, prompt: rune.q.prompt, correct: rune.q.options[rune.q.answer], t: rune.t, done: rune.done } : null,
          shield: shieldSeq ? { need: shieldSeq.need, streak: shieldSeq.streak } : null, timeScale: ts, quizOk: quizOk, quizTotal: quizTotal, kills: kills, defeats: defeats, tries: tries, easy: easy, listeners: listeners.length, raf: !!rafId, scale: { hp: LV_ATK, atk: LV_HP } };
      },
      perf: function (reset) { var r = { avgMs: perfN ? perfSum / perfN : 0, maxMs: perfMax, frames: perfN }; if (reset) { perfSum = 0; perfN = 0; perfMax = 0; } return r; },
      // simulation accélérée (sans rendu) : le bot joue jusqu'à la fin ou `seconds` secondes simulées
      simulate: function (seconds, cfg) {
        var t = 0, step = 1 / 60, max = seconds || 300, wasBot = bot.on;
        setBot(cfg || true); simulating = true; paused = false;
        try { while (t < max && !ended && phase !== "defeat") { botStep(step); tick(step); t += step; } }
        finally { simulating = false; if (!wasBot) setBot(false); hud.hp = -1; if (!ended && hero) syncHud(); dirty = true; }
        return { phase: ended ? "ended" : phase, win: !!(resultSent && resultSent.win), time: Math.round(fightT * 10) / 10, hp: Math.round(hero.hp), maxHp: hero.maxHp, kills: kills, quizOk: quizOk, quizTotal: quizTotal, potionsUsed: potionsUsed, result: resultSent };
      }
    };
    var handle = {
      destroy: function () {
        var i, l;
        if (destroyed) return;
        if (tuto) { tuto.close(); tuto = null; }
        destroyed = true; ended = true;
        if (rafId) cancelAnimationFrame(rafId); rafId = 0;
        for (i = 0; i < listeners.length; i++) { l = listeners[i]; l[0].removeEventListener(l[1], l[2], l[3]); }
        listeners.length = 0;
        if (resizeObs) { resizeObs.disconnect(); resizeObs = null; }
        if (root.parentNode) root.parentNode.removeChild(root);
        root.innerHTML = ""; enemies.length = 0; clearPools(); amb.length = 0; drawList.length = 0; tapEls.length = 0; tapTs.length = 0;
        bg.width = bg.height = 1; canvas.width = canvas.height = 1; heroSprite.width = 1; if (petSprite) petSprite.width = 1;
        rune = null; shieldSeq = null; boss = null; pet = null;
      },
      pause: pause,
      resume: resume,
      debugWin: function () { if (destroyed || resultSent) return; phase = "fight"; finish(true, false); },
      debugLose: function () { if (destroyed || resultSent) return; if (hero) hero.hp = 0; finish(false, false); },
      debug: debug
    };
    Object.defineProperty(handle, "state", { enumerable: true, get: function () {
      return { phase: ended ? "ended" : (phase === "fight" && bossOn ? "boss" : phase), paused: paused, wave: Math.max(0, waveI + 1), waves: waves.length,
        hp: hero ? Math.max(0, Math.round(hero.hp)) : 0, maxHp: H0.maxHp, enemies: destroyed ? 0 : liveCount(), rune: !!rune,
        boss: boss && !boss.dead ? boss.id : null, bossHp: boss ? Math.max(0, boss.hp) : 0, bossMaxHp: boss ? boss.maxHp : 0, bossShield: !!(boss && boss.shield && !boss.dead),
        potions: potions, kills: kills, time: Math.round(fightT * 10) / 10, tries: tries, difficulty: difficulty, easy: easy, ended: ended, destroyed: destroyed };
    } });

    // ---------------------------------------------------------------- démarrage
    on(root, "pointerdown", function (e) { if (e.pointerType === "touch") setKbd(false); if (phase === "intro" && !paused && e.target !== elPause && !elPause.contains(e.target)) introT = Math.min(introT, 0.05); });
    layout();
    begin(false);
    if (opts.tutorial && !opts.sandbox) showTuto();
    render(0);
    rafId = requestAnimationFrame(frame);
    return handle;
  }

  window.Combat = {
    start: start,
    tutorial: tutorial,
    version: "1.1.0",
    tuning: TUNING,
    arenas: Object.keys(ARENAS),
    sounds: ["countdown", "go", "spawn", "wave", "boss", "swing", "hit", "crit", "cling", "dash", "hurt", "potion", "pet", "pouf", "telegraph", "rune", "correct", "wrong", "spell", "fizzle", "shield", "shield_break", "win", "lose", "pause", "click"]
  };
})();
