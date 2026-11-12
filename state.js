/* Echoria — state.js : données indexées, état du joueur (sauvegarde locale + cloud facultatif),
   progression RPG (niveaux, statistiques, récompenses), sons, voix, questions de combat.
   Exposé via window.Store. */
(function () {
  'use strict';
  var E = window.Engine;
  var GAME = window.GAME || { catalog: {}, chapters: [] };
  var CAT = GAME.catalog || {};
  var KEY = 'echoria.v1';
  var now = function () { return Date.now(); };
  function isObj(o) { return o && typeof o === 'object' && !Array.isArray(o); }
  function isStr(x) { return typeof x === 'string'; }

  // ---------------------------------------------------------------- index des données
  // Les régions sans cristal (r0, la maison) sont gérées à part par le niveau 1 ; le reste du jeu ne voit que les régions à cristal.
  var HOME_REGION = (CAT.regions || []).filter(function (r) { return !r.crystal; })[0] || null;
  var REGIONS = (CAT.regions || []).filter(function (r) { return r && r.crystal; });
  var CHAPTERS = (GAME.chapters || []).slice().sort(function (a, b) { return (a.n || 0) - (b.n || 0); });
  var HOME_CHAPTER = CHAPTERS.filter(function (c) { return c.kind === 'home'; })[0] || null;
  function isHome(id) { return !!HOME_CHAPTER && HOME_CHAPTER.id === id; }
  var chapterById = {}, lessonInfo = {}, itemById = {}, spellById = {}, regionById = {}, foeById = {};
  CHAPTERS.forEach(function (c) { chapterById[c.id] = c; (c.lessons || []).forEach(function (l) { lessonInfo[l.id] = { chapter: c, lesson: l }; }); });
  (CAT.items || []).forEach(function (it) { itemById[it.id] = it; });
  (CAT.spells || []).forEach(function (sp) { spellById[sp.id] = sp; });
  REGIONS.forEach(function (r) { regionById[r.id] = r; });
  (CAT.enemies || []).concat(CAT.bosses || []).forEach(function (f) { foeById[f.id] = f; });
  function chapterNum(id) { var m = /\d+/.exec(String(id || '')); return m ? parseInt(m[0], 10) : 0; }
  function regionIndexOfChapter(id) { for (var i = 0; i < REGIONS.length; i++) if ((REGIONS[i].chapters || []).indexOf(id) >= 0) return i; return 0; }
  function regionOfChapter(id) { return REGIONS[regionIndexOfChapter(id)] || null; }
  // Adaptateur vers le format « cours » du moteur de Parlo : unité = chapitre, tips = grammar.
  var COURSE = {
    sections: REGIONS.map(function (r) { return { id: r.id, title: r.name, cefr: r.cefr, description: r.fr, units: r.chapters || [] }; }),
    units: CHAPTERS.map(function (c) { return { id: c.id, title: c.title, cefr: c.cefr, lessons: c.lessons || [], tips: c.grammar || [] }; })
  };

  // ---------------------------------------------------------------- état
  var HERO_OUTFITS = ['#2F8FE6', '#E5484D', '#3DBB6B', '#9A63E0', '#FF9600', '#F27BB1', '#12A5A5', '#F5B833'];
  var SKILLS = [
    { id: 'force', name: 'Force', emoji: '💪', desc: '+8 % de dégâts' },
    { id: 'vita', name: 'Vitalité', emoji: '❤️', desc: '+10 PV' },
    { id: 'magic', name: 'Magie', emoji: '🔮', desc: '−5 % de recharge des sorts' },
    { id: 'luck', name: 'Chance', emoji: '🍀', desc: '+5 % d\'or' }
  ];
  // ---------------------------------------------------------------- disposition des étapes (les sauvegardes indexent les étapes par position)
  // Quand le contenu change (ex. ajout d'une 4e leçon), on retrouve chaque étape par son id et on déplace sa progression.
  function stepIdsOf(ch) { return (ch.steps || []).map(function (st) { return st.id || st.lesson; }); }
  function currentLayout() { var o = {}; CHAPTERS.forEach(function (ch) { o[ch.id] = stepIdsOf(ch); }); return o; }
  function migrateLayout(s, raw) {
    var prevAll = isObj(raw.layout) ? raw.layout : (GAME.legacyLayouts || {});
    CHAPTERS.forEach(function (ch) {
      var cur = stepIdsOf(ch), prev = prevAll[ch.id];
      if (!Array.isArray(prev) || prev.join('|') === cur.join('|')) return;
      var moved = {};
      prev.forEach(function (id, i) { var k = ch.id + ':' + i, v = s.steps[k]; if (v) { var j = cur.indexOf(id); if (j >= 0) moved[ch.id + ':' + j] = v; } delete s.steps[k]; });
      Object.keys(moved).forEach(function (k) { s.steps[k] = moved[k]; });
    });
    s.layout = currentLayout();
  }
  function defaultState() {
    var t = now();
    return {
      v: 1,
      layout: currentLayout(),
      hero: { name: '', gender: 'f', skin: 'light', hair: 'short', hairColor: 'brown', outfit: '#2F8FE6', created: false, createdAt: t },
      settings: { sound: true, vibrate: true, voice: 'UK', rate: 1, frHelp: 'tap', typing: 'auto', textSize: 'm', reducedMotion: false },
      xp: 0, gold: 0,
      steps: {}, unitsDone: [], progress: {}, crystals: [],
      spells: [], spellsEquipped: [],
      items: ['stick', 'cloth_tunic'], potions: 0,
      equip: { weapon: 'stick', armor: 'cloth_tunic', trinket: '' },
      skills: { force: 0, vita: 0, magic: 0, luck: 0 },
      wordStrength: {}, mistakes: [], phrases: [], bestiary: [],
      streak: 0, lastActiveDay: null, streakHistory: [],
      daily: { date: null, done: false },
      stats: { time: 0, lessons: 0, dialogues: 0, scenes: 0, combatsWon: 0, combatsLost: 0, trainings: 0, quests: 0 },
      tasks: {}, wordMiss: {}, losses: {},
      flags: { unlockAll: false, easy: false, combatTuto: false, ended: false, frSeen: false, preHome: false },
      // niveau 1 (la maison explorable) : drapeaux de la maison, objets vus, position du héros, mots vus, quête en cours
      home: {},
      lastChapter: 'c1',
      updatedAt: t
    };
  }
  // Fusionne un état chargé avec les valeurs par défaut, en corrigeant les types (sauvegarde bricolée ou ancienne).
  function sanitize(raw) {
    var d = defaultState();
    if (!isObj(raw) || raw.v !== 1) return d;
    var s = {};
    Object.keys(d).forEach(function (k) {
      var dv = d[k], rv = raw[k];
      if (isObj(dv)) s[k] = Object.assign({}, dv, isObj(rv) ? rv : {});
      else if (Array.isArray(dv)) s[k] = Array.isArray(rv) ? rv.slice() : dv;
      else if (typeof dv === 'number') s[k] = typeof rv === 'number' && isFinite(rv) ? rv : dv;
      else s[k] = rv === undefined ? dv : rv;
    });
    var en = CAT.lookEnums || {}, h = s.hero;
    h.name = isStr(h.name) ? h.name.slice(0, 16) : '';
    if (h.gender !== 'm' && h.gender !== 'f') h.gender = 'f';
    if ((en.skin || []).indexOf(h.skin) < 0) h.skin = 'light';
    if ((en.hair || []).indexOf(h.hair) < 0) h.hair = 'short';
    if ((en.hairColor || []).indexOf(h.hairColor) < 0) h.hairColor = 'brown';
    if (!/^#[0-9a-f]{6}$/i.test(h.outfit || '')) h.outfit = '#2F8FE6';
    h.created = h.created === true;
    var st = s.settings;
    ['sound', 'vibrate', 'reducedMotion'].forEach(function (k) { st[k] = st[k] === true || (k !== 'reducedMotion' && st[k] !== false); });
    if (['UK', 'US'].indexOf(st.voice) < 0) st.voice = 'UK';
    if (typeof st.rate !== 'number' || !isFinite(st.rate)) st.rate = 1; st.rate = E.clamp(st.rate, 0.6, 1.2);
    if (['always', 'tap', 'never'].indexOf(st.frHelp) < 0) st.frHelp = 'tap';
    if (['auto', 'on', 'off'].indexOf(st.typing) < 0) st.typing = 'auto';
    if (['m', 'l', 'xl'].indexOf(st.textSize) < 0) st.textSize = 'm';
    s.xp = Math.max(0, Math.round(s.xp)); s.gold = Math.max(0, Math.round(s.gold)); s.potions = E.clamp(Math.round(s.potions), 0, 99);
    s.streak = Math.max(0, Math.round(s.streak));
    ['unitsDone', 'crystals', 'spells', 'spellsEquipped', 'items', 'bestiary', 'streakHistory'].forEach(function (k) { s[k] = E.uniqueBy(s[k].filter(isStr), function (x) { return x; }); });
    s.crystals = s.crystals.filter(function (id) { return !!regionById[id]; });
    s.spells = s.spells.filter(function (id) { return !!spellById[id]; });
    s.spellsEquipped = s.spellsEquipped.filter(function (id) { return s.spells.indexOf(id) >= 0; }).slice(0, 3);
    s.items = s.items.filter(function (id) { return !!itemById[id] && itemById[id].kind !== 'potion'; });
    ['stick', 'cloth_tunic'].forEach(function (id) { if (itemById[id] && s.items.indexOf(id) < 0) s.items.push(id); });
    [['weapon', 'stick'], ['armor', 'cloth_tunic'], ['trinket', '']].forEach(function (p) {
      var id = s.equip[p[0]], it = itemById[id];
      if (!isStr(id) || !it || it.kind !== p[0] || s.items.indexOf(id) < 0) s.equip[p[0]] = p[1];
    });
    SKILLS.forEach(function (sk) { var v = s.skills[sk.id]; s.skills[sk.id] = typeof v === 'number' && isFinite(v) ? Math.max(0, Math.round(v)) : 0; });
    if (skillsSpent(s) > levelOf(s.xp) - 1) SKILLS.forEach(function (sk) { s.skills[sk.id] = 0; });
    Object.keys(s.steps).forEach(function (k) { var v = s.steps[k]; if (!isObj(v)) { delete s.steps[k]; return; } s.steps[k] = { done: v.done === true, stars: E.clamp(Math.round(+v.stars || 0), 0, 3), plays: Math.max(0, Math.round(+v.plays || 0)) }; });
    Object.keys(s.progress).forEach(function (k) { var v = s.progress[k]; if (typeof v !== 'number' || !isFinite(v)) delete s.progress[k]; else s.progress[k] = Math.max(0, Math.round(v)); });
    Object.keys(s.wordStrength).forEach(function (k) { var w = s.wordStrength[k]; if (!isObj(w) || typeof w.s !== 'number') delete s.wordStrength[k]; });
    ['wordMiss', 'losses'].forEach(function (g) { Object.keys(s[g]).forEach(function (k) { if (typeof s[g][k] !== 'number' || !isFinite(s[g][k])) delete s[g][k]; }); });
    Object.keys(s.tasks).forEach(function (k) { var t = s.tasks[k]; if (!isObj(t)) { delete s.tasks[k]; return; } s.tasks[k] = { ok: Math.max(0, Math.round(+t.ok || 0)), n: Math.max(0, Math.round(+t.n || 0)) }; });
    Object.keys(s.stats).forEach(function (k) { if (typeof s.stats[k] !== 'number' || !isFinite(s.stats[k])) s.stats[k] = 0; });
    s.mistakes = s.mistakes.filter(function (m) { return isObj(m) && isStr(m.en); }).slice(-30);
    s.phrases = s.phrases.filter(function (p) { return isObj(p) && isStr(p.en); }).slice(-200);
    s.flags.unlockAll = s.flags.unlockAll === true; s.flags.easy = s.flags.easy === true;
    s.flags.combatTuto = s.flags.combatTuto === true || (isObj(raw.flags) && raw.flags.combatTuto === undefined && s.stats.combatsWon > 0); // anciennes sauvegardes : déjà vu
    s.flags.ended = s.flags.ended === true; s.flags.frSeen = s.flags.frSeen === true;
    // sauvegarde d'avant le niveau 1 : rien n'est reverrouillé (c1 reste ouvert), la maison est simplement disponible
    s.flags.preHome = (isObj(raw.flags) && raw.flags.preHome === true) || (h.created && !!HOME_CHAPTER && !(isObj(raw.layout) && Array.isArray(raw.layout[HOME_CHAPTER.id])));
    var hm = s.home;
    ['flags', 'seen', 'words', 'secrets'].forEach(function (k) { if (!isObj(hm[k])) hm[k] = {}; });
    if (!isObj(hm.cur) || typeof hm.cur.i !== 'number') hm.cur = null;
    if (!isStr(hm.map)) { delete hm.map; delete hm.x; delete hm.y; }
    else if (typeof hm.x !== 'number' || typeof hm.y !== 'number' || !isFinite(hm.x) || !isFinite(hm.y)) { delete hm.map; delete hm.x; delete hm.y; }
    s.daily.done = s.daily.done === true;
    if (!isStr(s.lastChapter)) s.lastChapter = 'c1';
    migrateLayout(s, raw);
    return s;
  }
  var loadError = false;
  function loadState() {
    try {
      var raw = window.localStorage ? localStorage.getItem(KEY) : null;
      if (!raw) return defaultState();
      var parsed = JSON.parse(raw);
      if (!isObj(parsed) || parsed.v !== 1) { loadError = true; return defaultState(); }
      return sanitize(parsed);
    } catch (e) { loadError = true; return defaultState(); }
  }
  var state = loadState();
  var saveTimer = null;
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* stockage indisponible */ } }
  function save() {
    state.updatedAt = now();
    clearTimeout(saveTimer); saveTimer = setTimeout(persist, 400);
    Cloud.schedule();
  }
  function flush() { clearTimeout(saveTimer); persist(); }
  function reset() { state = defaultState(); flush(); Cloud.schedule(); }
  function importJson(text) {
    var raw;
    try { raw = JSON.parse(text); } catch (e) { return false; }
    if (!isObj(raw) || raw.v !== 1 || !isObj(raw.hero)) return false;
    state = sanitize(raw); state.updatedAt = now(); flush(); Cloud.schedule();
    return true;
  }

  // ---------------------------------------------------------------- synchro cloud facultative (repris de Parlo, doc data/users/<uid>/save)
  var listeners = { remote: null, sync: null };
  var Cloud = {
    status: 'local', ref: null, saving: null, timer: null, lastJson: '', dirty: false,
    init: function () {
      var self = this;
      if (!(window.claude && typeof window.claude.use === 'function')) return;
      (async function () {
        try {
          var user = await window.claude.use('user');
          var uid = user ? await user.id() : null;
          if (!uid) return;
          var db = await window.claude.use('db');
          if (!db) return;
          self.ref = db.doc('data/users/' + uid + '/save');
          self.status = 'pending'; self.notify();
          var snap = await self.ref.get();
          var adopted = false;
          if (snap && snap.exists) {
            var remote = snap.data();
            if (isObj(remote) && remote.v === 1 && (remote.updatedAt || 0) > (state.updatedAt || 0)) {
              state = sanitize(remote); flush(); adopted = true;
              if (listeners.remote) listeners.remote();
            }
          }
          self.status = 'synced'; self.notify();
          self.lastJson = adopted ? JSON.stringify(state) : '';
          self.schedule();
        } catch (e) { self.status = self.ref ? 'error' : 'local'; self.notify(); }
      })();
    },
    notify: function () { if (listeners.sync) try { listeners.sync(this.status); } catch (e) { /* ignore */ } },
    schedule: function () {
      var self = this;
      if (!this.ref) return;
      this.dirty = true;
      clearTimeout(this.timer);
      this.timer = setTimeout(function () { self.flush(); }, 2000);
    },
    flush: function () { // une seule écriture à la fois
      var self = this;
      if (!this.ref || this.saving || !this.dirty) return;
      var json = JSON.stringify(state);
      if (json === this.lastJson) { this.dirty = false; return; }
      this.dirty = false;
      this.saving = (async function () {
        try { await self.ref.set(JSON.parse(json)); self.lastJson = json; self.status = 'synced'; }
        catch (e) { self.status = 'error'; self.dirty = true; }
        self.saving = null; self.notify();
        if (self.dirty) self.schedule();
      })();
    },
    label: function () { return this.status === 'synced' ? '☁️ synchronisé' : this.status === 'pending' ? '☁️ synchronisation…' : this.status === 'error' ? '☁️ hors ligne' : '💾 sauvegarde sur cet appareil'; }
  };

  // ---------------------------------------------------------------- sons (WebAudio synthétisé) & vibrations
  // [fréquence, début, durée, forme, volume] — synthèse courte pour chaque nom émis par combat.js
  var COMBAT_SFX = {
    countdown: [[440, 0, 0.09, 'square', 0.06]],
    go: [[523, 0, 0.1, 'triangle', 0.14], [784, 0.08, 0.22, 'triangle', 0.16]],
    spawn: [[260, 0, 0.07, 'sine', 0.05], [200, 0.05, 0.08, 'sine', 0.04]],
    wave: [[392, 0, 0.1, 'triangle', 0.12], [523, 0.1, 0.1, 'triangle', 0.12], [659, 0.2, 0.2, 'triangle', 0.12]],
    boss: [[110, 0, 0.5, 'sawtooth', 0.12], [82, 0.25, 0.6, 'sawtooth', 0.12], [165, 0.5, 0.4, 'square', 0.05]],
    swing: [[420, 0, 0.05, 'sine', 0.04], [300, 0.03, 0.06, 'sine', 0.03]],
    hit: [[340, 0, 0.05, 'square', 0.06], [200, 0.03, 0.07, 'triangle', 0.08]],
    crit: [[520, 0, 0.05, 'square', 0.07], [780, 0.04, 0.08, 'triangle', 0.1], [1040, 0.1, 0.12, 'sine', 0.09]],
    cling: [[1800, 0, 0.05, 'square', 0.04], [2400, 0.03, 0.09, 'sine', 0.05]],
    dash: [[500, 0, 0.1, 'sine', 0.05], [300, 0.05, 0.1, 'sine', 0.04]],
    hurt: [[160, 0, 0.16, 'sawtooth', 0.1], [120, 0.08, 0.14, 'sawtooth', 0.07]],
    potion: [[500, 0, 0.08, 'sine', 0.12], [660, 0.08, 0.08, 'sine', 0.12], [880, 0.16, 0.16, 'sine', 0.12]],
    pet: [[1500, 0, 0.04, 'sine', 0.05], [1900, 0.04, 0.05, 'sine', 0.05]],
    pouf: [[400, 0, 0.06, 'triangle', 0.12], [700, 0.05, 0.1, 'sine', 0.1]],
    telegraph: [[300, 0, 0.1, 'square', 0.05], [300, 0.16, 0.1, 'square', 0.05]],
    rune: [[880, 0, 0.1, 'sine', 0.1], [1175, 0.08, 0.2, 'sine', 0.1]],
    fizzle: [[400, 0, 0.12, 'sawtooth', 0.06], [250, 0.1, 0.2, 'sawtooth', 0.05], [160, 0.25, 0.2, 'sine', 0.05]],
    shield: [[700, 0, 0.14, 'sine', 0.1], [560, 0.1, 0.14, 'sine', 0.1], [420, 0.2, 0.3, 'sine', 0.1]],
    shield_break: [[1568, 0, 0.07, 'triangle', 0.12], [1245, 0.05, 0.07, 'triangle', 0.12], [1865, 0.1, 0.07, 'triangle', 0.12], [988, 0.16, 0.3, 'sine', 0.14]],
    win: [[523, 0, 0.14, 'triangle', 0.2], [659, 0.12, 0.14, 'triangle', 0.2], [784, 0.24, 0.14, 'triangle', 0.2], [1047, 0.36, 0.4, 'triangle', 0.2]],
    lose: [[392, 0, 0.2, 'triangle', 0.16], [330, 0.18, 0.2, 'triangle', 0.16], [262, 0.36, 0.45, 'triangle', 0.16]],
    pause: [[500, 0, 0.06, 'sine', 0.08], [400, 0.06, 0.08, 'sine', 0.08]]
  };
  var Sound = {
    ctx: null,
    get: function () { if (this.ctx) return this.ctx; try { var AC = window.AudioContext || window.webkitAudioContext; if (AC) this.ctx = new AC(); } catch (e) { this.ctx = null; } return this.ctx; },
    tone: function (freq, start, dur, type, gain) {
      var ctx = this.get(); if (!ctx) return;
      try {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type || 'sine'; o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
        g.gain.exponentialRampToValueAtTime(gain || 0.18, ctx.currentTime + start + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
        o.connect(g); g.connect(ctx.destination);
        o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur + 0.02);
      } catch (e) { /* ignore */ }
    },
    play: function (name) {
      if (!state.settings.sound) return;
      try { var ctx = this.get(); if (ctx && ctx.state === 'suspended') ctx.resume(); } catch (e) { /* ignore */ }
      var S = this, n = String(name || '');
      switch (n) {
        case 'click': S.tone(600, 0, 0.05, 'sine', 0.08); return;
        case 'page': S.tone(520, 0, 0.05, 'triangle', 0.07); S.tone(700, 0.04, 0.06, 'sine', 0.05); return;
        case 'correct': S.tone(660, 0, 0.12, 'sine', 0.2); S.tone(880, 0.1, 0.18, 'sine', 0.2); return;
        case 'wrong': S.tone(220, 0, 0.28, 'triangle', 0.22); S.tone(180, 0.12, 0.25, 'triangle', 0.18); return;
        case 'fanfare': [523, 659, 784, 1047].forEach(function (f, i) { S.tone(f, i * 0.12, 0.22, 'triangle', 0.2); }); S.tone(1319, 0.5, 0.4, 'sine', 0.18); return;
        case 'unlock': S.tone(523, 0, 0.12, 'sine', 0.2); S.tone(784, 0.12, 0.3, 'sine', 0.2); return;
        case 'coin': S.tone(1200, 0, 0.08, 'sine', 0.15); S.tone(1600, 0.08, 0.16, 'sine', 0.15); return;
        case 'tile': S.tone(900, 0, 0.04, 'sine', 0.07); S.tone(1300, 0.03, 0.06, 'sine', 0.05); return;
        case 'combo': [659, 784, 988, 1319].forEach(function (f, i) { S.tone(f, i * 0.07, 0.14, 'triangle', 0.16); }); return;
        case 'spell': [784, 988, 1175, 1568].forEach(function (f, i) { S.tone(f, i * 0.06, 0.2, 'sine', 0.14); }); return;
        case 'levelup': [523, 659, 784, 1047, 1319].forEach(function (f, i) { S.tone(f, i * 0.09, 0.2, 'square', 0.07); }); return;
        case 'crystal': [659, 831, 988, 1319, 1661].forEach(function (f, i) { S.tone(f, i * 0.14, 0.5, 'sine', 0.14); }); return;
      }
      // sons du moteur de combat (Combat.sounds) : chacun a sa petite signature
      var cs = COMBAT_SFX[n];
      if (cs) { cs.forEach(function (t) { S.tone(t[0], t[1], t[2], t[3], t[4]); }); return; }
      // autres noms libres : on devine une famille de son
      if (/win|victor|fanfare/i.test(n)) return S.play('fanfare');
      if (/lose|defeat|fail|wrong|fizz|pschitt/i.test(n)) return S.play('wrong');
      if (/spell|cast|magic|rune|ok|correct/i.test(n)) return S.play('spell');
      if (/coin|gold|pick|potion|heal/i.test(n)) return S.play('coin');
      if (/hurt|damage|hit_hero|ouch/i.test(n)) { S.tone(160, 0, 0.16, 'sawtooth', 0.1); return; }
      if (/hit|slash|attack|swing|strike/i.test(n)) { S.tone(340, 0, 0.05, 'square', 0.06); S.tone(200, 0.03, 0.07, 'triangle', 0.08); return; }
      if (/dash|roll|dodge|whoosh/i.test(n)) { S.tone(500, 0, 0.1, 'sine', 0.05); S.tone(300, 0.05, 0.1, 'sine', 0.04); return; }
      if (/pop|pouf|kill|die/i.test(n)) { S.tone(400, 0, 0.06, 'triangle', 0.12); S.tone(700, 0.05, 0.1, 'sine', 0.1); return; }
      S.tone(600, 0, 0.04, 'sine', 0.05);
    }
  };
  function vibrate(p) { if (!state.settings.vibrate) return; try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* ignore */ } }

  // ---------------------------------------------------------------- synthèse vocale (en-GB de préférence)
  var TTS = {
    voices: [],
    init: function () {
      var self = this;
      if (!('speechSynthesis' in window)) return;
      var load = function () { try { self.voices = window.speechSynthesis.getVoices() || []; } catch (e) { self.voices = []; } };
      load();
      try { window.speechSynthesis.onvoiceschanged = function () { load(); }; } catch (e) { /* ignore */ }
    },
    hasEnglish: function () { return this.voices.some(function (v) { return /^en[-_]/i.test(v.lang || ''); }); },
    available: function () { return !!(('speechSynthesis' in window) && this.hasEnglish()); },
    // opts : true (lent) ou { slow, queue } ; queue = ne coupe pas la phrase en cours
    speak: function (text, opts) {
      if (!text || !('speechSynthesis' in window)) return;
      if (opts === true) opts = { slow: true };
      opts = opts || {};
      try {
        var synth = window.speechSynthesis; if (!opts.queue) synth.cancel();
        var u = new SpeechSynthesisUtterance(String(text));
        var want = state.settings.voice === 'US' ? 'en-US' : 'en-GB';
        u.lang = want;
        var v = this.voices.filter(function (v) { return (v.lang || '').replace('_', '-').toLowerCase() === want.toLowerCase(); })[0] || this.voices.filter(function (v) { return /^en[-_]/i.test(v.lang || ''); })[0];
        if (v) u.voice = v;
        u.rate = (opts.slow ? 0.6 : 0.95) * (state.settings.rate || 1); u.pitch = 1.05;
        synth.speak(u);
      } catch (e) { /* ignore */ }
    },
    stop: function () { try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
  };

  // ---------------------------------------------------------------- progression : niveaux & statistiques
  // XP total pour atteindre le niveau L : courbe douce (niveau 2 ≈ fin du chapitre 1, ≈ niveau 30 à la fin du jeu).
  function xpForLevel(L) { var x = Math.max(0, L - 1); return Math.round(88.7 * x + 1.3 * x * x); }
  function levelOf(xp) { var L = 1; while (L < 60 && xp >= xpForLevel(L + 1)) L++; return L; }
  function levelInfo() { var L = levelOf(state.xp), a = xpForLevel(L), b = xpForLevel(L + 1); return { level: L, cur: state.xp - a, need: b - a, pct: (state.xp - a) / Math.max(1, b - a) }; }
  function skillsSpent(s) { var n = 0; SKILLS.forEach(function (sk) { n += (s.skills && s.skills[sk.id]) || 0; }); return n; }
  function skillPoints() { return Math.max(0, levelOf(state.xp) - 1 - skillsSpent(state)); }
  function heroStats() {
    var L = levelOf(state.xp), w = itemById[state.equip.weapon], a = itemById[state.equip.armor], t = itemById[state.equip.trinket];
    var wb = (w && w.bonus) || {}, tb = (t && t.bonus) || {}, sk = state.skills;
    var baseAtk = 10 + 1.5 * (L - 1);
    return {
      level: L,
      maxHp: Math.round(100 + 6 * (L - 1) + ((a && a.hp) || 0) + 10 * sk.vita),
      atk: Math.round((baseAtk + ((w && w.atk) || 0)) * (1 + 0.08 * sk.force) * (tb.atk || 1)),
      baseAtk: baseAtk,
      speed: tb.speed || 1,
      dashCd: Math.round(1.5 * (tb.dashCd || 1) * 100) / 100,
      cdMul: Math.max(0.5, 1 - 0.05 * sk.magic) * (wb.spellCooldown || 1),
      goldMul: (1 + 0.05 * sk.luck) * (tb.gold || 1),
      xpMul: tb.xp || 1,
      regen: tb.regen || 0, petRate: tb.pet || 1, attackSpeed: wb.attackSpeed || 1, slowOnHit: !!wb.slowOnHit
    };
  }

  // ---------------------------------------------------------------- progression : chapitres & étapes
  function stepKey(chId, i) { return chId + ':' + i; }
  function stepState(chId, i) { return state.steps[stepKey(chId, i)] || { done: false, stars: 0, plays: 0 }; }
  function isRegionUnlocked(ri) { return ri <= 0 || state.flags.unlockAll || state.crystals.indexOf((REGIONS[ri - 1] || {}).id) >= 0; }
  function isChapterDone(id) { return state.unitsDone.indexOf(id) >= 0; }
  function isChapterUnlocked(id) {
    if (!chapterById[id]) return false;
    if (state.flags.unlockAll || isHome(id)) return true;
    var n = chapterNum(id);
    if (n <= 1) return !HOME_CHAPTER || state.flags.preHome || isChapterDone(HOME_CHAPTER.id) || chapterStarted(id);
    if (!isRegionUnlocked(regionIndexOfChapter(id))) return false;
    return isChapterDone('c' + (n - 1));
  }
  function chapterStarted(id) { var ch = chapterById[id]; return !!ch && ch.steps.some(function (st, i) { return stepState(id, i).done; }); }
  function nextStepIndex(chId) {
    var ch = chapterById[chId]; if (!ch) return -1;
    for (var i = 0; i < ch.steps.length; i++) if (!stepState(chId, i).done) return i;
    return -1;
  }
  function isStepUnlocked(chId, i) {
    if (!isChapterUnlocked(chId)) return false;
    if (stepState(chId, i).done) return true;
    var nx = nextStepIndex(chId);
    return nx === i || state.flags.unlockAll;
  }
  function chapterStars(chId) {
    var ch = chapterById[chId], got = 0, max = 0; if (!ch) return { got: 0, max: 0, avg: 0 };
    ch.steps.forEach(function (st, i) { if (st.type === 'scene') return; max += 3; got += stepState(chId, i).stars; });
    return { got: got, max: max, avg: max ? Math.max(isChapterDone(chId) ? 1 : 0, Math.round(got / max * 3)) : 0 };
  }
  // Chapitre « courant » : le premier chapitre présent, débloqué et pas terminé (sinon le dernier terminé).
  function currentChapterId() {
    for (var i = 0; i < CHAPTERS.length; i++) { var id = CHAPTERS[i].id; if (isHome(id) && state.flags.preHome) continue; if (isChapterUnlocked(id) && !isChapterDone(id)) return id; }
    if (HOME_CHAPTER && state.flags.preHome && !isChapterDone(HOME_CHAPTER.id)) return HOME_CHAPTER.id;
    var last = null; CHAPTERS.forEach(function (c) { if (isChapterDone(c.id)) last = c.id; });
    return last || (CHAPTERS[0] && CHAPTERS[0].id) || null;
  }
  function typingOn(chId) { var t = state.settings.typing; return t === 'on' ? true : t === 'off' ? false : regionIndexOfChapter(chId) >= 2; }
  function recordTask(kind, ok) { var t = state.tasks[kind] || (state.tasks[kind] = { ok: 0, n: 0 }); t.n++; if (ok) t.ok++; }
  function recordMiss(en) { if (!en) return; state.wordMiss[en] = (state.wordMiss[en] || 0) + 1; }
  function touchStreak() { return E.extendStreak(state, now()); }
  function addPhrase(en, fr, chId) {
    if (!en) return;
    state.phrases = state.phrases.filter(function (p) { return p.en !== en; });
    state.phrases.push({ en: en, fr: fr || '', c: chId || '' });
    if (state.phrases.length > 200) state.phrases = state.phrases.slice(-200);
  }

  // ---------------------------------------------------------------- récompenses
  // reward : { gold, xp, items, spell, crystal } ; opts : { replay } → or ×0,25, XP ×0,25, pas d'objets.
  // Renvoie la liste des « cartes » à afficher.
  function grant(reward, opts) {
    reward = reward || {}; opts = opts || {};
    var cards = [], hs = heroStats(), before = hs.level, k = opts.replay ? 0.25 : 1;
    if (reward.gold) { var g = Math.max(1, Math.round(reward.gold * hs.goldMul * k)); state.gold += g; cards.push({ kind: 'gold', n: g, bonus: !opts.replay && hs.goldMul > 1 }); }
    if (reward.xp) { var x = Math.max(1, Math.round(reward.xp * hs.xpMul * k)); state.xp += x; cards.push({ kind: 'xp', n: x }); }
    if (!opts.replay) {
      (reward.items || []).forEach(function (id) {
        var it = itemById[id]; if (!it) return;
        if (it.kind === 'potion') { state.potions = Math.min(99, state.potions + 1); var pc = cards.filter(function (c) { return c.kind === 'potion'; })[0]; if (pc) pc.n++; else cards.push({ kind: 'potion', n: 1, item: it }); return; }
        if (state.items.indexOf(id) >= 0) return;
        state.items.push(id);
        var card = { kind: 'item', item: it, equipped: autoEquip(it) };
        cards.push(card);
      });
      if (reward.spell && spellById[reward.spell] && state.spells.indexOf(reward.spell) < 0) {
        state.spells.push(reward.spell);
        var eq = state.spellsEquipped.length < 3; if (eq) state.spellsEquipped.push(reward.spell);
        cards.push({ kind: 'spell', spell: spellById[reward.spell], equipped: eq });
      }
      if (reward.crystal && regionById[reward.crystal] && state.crystals.indexOf(reward.crystal) < 0) {
        state.crystals.push(reward.crystal);
        cards.push({ kind: 'crystal', region: regionById[reward.crystal] });
      }
    }
    var after = levelOf(state.xp);
    if (after > before) cards.push({ kind: 'level', level: after, points: after - before });
    return cards;
  }
  // Équipe automatiquement une arme/armure meilleure (ou le premier talisman). Renvoie true si équipé.
  function autoEquip(it) {
    if (it.kind === 'weapon') { var w = itemById[state.equip.weapon]; if (!w || (it.atk || 0) > (w.atk || 0)) { state.equip.weapon = it.id; return true; } }
    else if (it.kind === 'armor') { var a = itemById[state.equip.armor]; if (!a || (it.hp || 0) > (a.hp || 0)) { state.equip.armor = it.id; return true; } }
    else if (it.kind === 'trinket' && !state.equip.trinket) { state.equip.trinket = it.id; return true; }
    return false;
  }
  // Valide une étape. result : { stars } ; renvoie { first, replay, cards, chapterDone }.
  function completeStep(chId, i, result) {
    var ch = chapterById[chId], step = ch && ch.steps[i]; if (!step) return { cards: [] };
    var key = stepKey(chId, i), prev = stepState(chId, i), replay = prev.done, stars = (result && result.stars) || 0;
    state.steps[key] = { done: true, stars: Math.max(prev.stars, stars), plays: prev.plays + 1 };
    var reward = Object.assign({}, step.reward || {});
    // XP / or de base par type d'étape (en plus des récompenses d'histoire)
    if (step.type === 'scene') { reward.xp = (reward.xp || 0) + 3; state.stats.scenes++; }
    else if (step.type === 'lesson') { reward.xp = (reward.xp || 0) + 10 + (stars === 3 ? 5 : 0); reward.gold = (reward.gold || 0) + 4 + 2 * stars; state.stats.lessons++; state.progress[step.lesson] = (state.progress[step.lesson] || 0) + 1; }
    else if (step.type === 'dialogue') { reward.xp = (reward.xp || 0) + 8 + 2 * stars; state.stats.dialogues++; }
    else if (step.type === 'combat') { state.stats.combatsWon++; }
    else if (step.type === 'minigame') { reward.xp = (reward.xp || 0) + 2 + stars; reward.gold = (reward.gold || 0) + 2 + stars; state.stats.quests++; if (step.lesson) state.progress[step.lesson] = (state.progress[step.lesson] || 0) + 1; }
    var cards = grant(reward, { replay: replay });
    var chapterDone = false;
    if (!isChapterDone(chId) && nextStepIndex(chId) < 0) { state.unitsDone.push(chId); chapterDone = true; }
    state.lastChapter = chId;
    touchStreak();
    save(); flush();   // une étape terminée est écrite tout de suite (pas d'attente) : fermer l'onglet juste après ne perd rien
    return { first: !replay, replay: replay, cards: cards, chapterDone: chapterDone, stars: stars };
  }

  // ---------------------------------------------------------------- leçons (moteur de Parlo)
  function lessonExercises(lessonId) {
    var info = lessonInfo[lessonId]; if (!info) return [];
    var ri = regionIndexOfChapter(info.chapter.id), typing = typingOn(info.chapter.id), plays = state.progress[lessonId] || 0;
    var level = ri <= 1 ? 1 : ri <= 3 ? 2 : 3;
    if (plays >= 1) level = Math.min(4, level + 1);
    if (typing && level < 2) level = 2;
    var exs = E.generateLesson(COURSE, lessonId, level, { count: 10, tts: TTS.available(), typing: typing });
    if (plays >= 1) return exs;
    // première fois : d'abord les mots (images, sens, écoute, paires), ensuite les phrases
    var isWord = function (e) { return e.type === 'select_image' || e.type === 'select_meaning' || e.type === 'listen_word' || e.type === 'match_pairs'; };
    return exs.filter(isWord).concat(exs.filter(function (e) { return !isWord(e); }));
  }
  // Met à jour la force des mots et la liste d'erreurs à partir des réponses d'une session (repris de Parlo).
  function bumpWords(result) {
    var idx = E.indexCourse(COURSE), newWords = 0, t = now(), seen = {}, failedEn = {};
    (result.answers || []).forEach(function (a) { if (!a.ok) { var it = a.ex.sentence || a.ex.word; if (it) failedEn[it.en] = 1; } });
    (result.answers || []).forEach(function (a) {
      var ex = a.ex, words = [];
      if (ex.vocab && ex.vocab.length) words = ex.vocab.slice();
      else if (ex.sentence) {
        var lessonVocab = {}; var lesson = idx.lessonById[ex.sentence._lesson]; if (lesson) (lesson.vocab || []).forEach(function (v) { lessonVocab[E.normalize(v.en)] = v.en; });
        E.wordsOf(ex.sentence.en).forEach(function (w) { var k = E.normalize(w); if (lessonVocab[k]) words.push(lessonVocab[k]); });
        Object.keys(lessonVocab).forEach(function (k) { if (k.indexOf(' ') > 0 && E.normalize(ex.sentence.en).indexOf(k) >= 0) words.push(lessonVocab[k]); });
      }
      words.forEach(function (w) {
        var key = ex.id + '|' + w; if (seen[key]) return; seen[key] = 1;
        var r = E.bumpStrength(state.wordStrength, w, a.ok, t);
        if (r.isNew && a.ok) newWords++;
        if (!a.ok && a.firstTry) recordMiss(w);
      });
      if (a.firstTry) recordTask('lesson', a.ok);
      if (!a.ok && a.firstTry) {
        var en = ex.sentence ? ex.sentence.en : (ex.word ? ex.word.en : null);
        if (en) {
          state.mistakes = state.mistakes.filter(function (m) { return m.en !== en; });
          state.mistakes.push({ kind: ex.sentence ? 'sentence' : 'vocab', en: en, lessonId: (ex.sentence || ex.word || {})._lesson, unitId: (ex.sentence || ex.word || {})._unit, t: t });
          if (state.mistakes.length > 30) state.mistakes = state.mistakes.slice(-30);
        }
      } else if (a.ok && a.firstTry && (ex.sentence || ex.word) && !failedEn[(ex.sentence || ex.word).en]) {
        var enOk = (ex.sentence || ex.word).en; state.mistakes = state.mistakes.filter(function (m) { return m.en !== enOk; });
      }
    });
    return newWords;
  }
  // Tous les mots des leçons déjà faites (avec chapitre et force).
  function learnedVocab() {
    var out = [], t = now();
    var seen = (state.home && state.home.words) || {};
    CHAPTERS.forEach(function (c) { (c.lessons || []).forEach(function (l) { var done = (state.progress[l.id] || 0) >= 1; if (!done && !isHome(c.id)) return; (l.vocab || []).forEach(function (v) { if (!done && !seen[v.en]) return; out.push({ en: v.en, fr: v.fr, emoji: v.emoji || '', pos: v.pos || '', chapter: c.id, lesson: l.id, s: E.strengthOf(state.wordStrength, v.en, t), seen: !done }); }); }); });
    return out;
  }
  function practice(mode) {
    var count = mode === 'daily' ? 8 : 10;
    var gen = E.generatePractice(COURSE, mode === 'daily' ? 'weak' : mode, state, { count: count, tts: TTS.available(), typing: typingOn(currentChapterId()), seed: mode === 'daily' ? 'daily:' + E.dayKey(now()) + ':' + state.stats.trainings : undefined });
    return gen;
  }

  // ---------------------------------------------------------------- questions de combat (Rune de Mot)
  function makeQuiz(chId) {
    var ri = regionIndexOfChapter(chId), t = now(), recent = [];
    var all = learnedVocab(), ch = chapterById[chId];
    var cur = all.filter(function (v) { return v.chapter === chId; });
    if (!cur.length && ch) (ch.lessons || []).forEach(function (l) { (l.vocab || []).forEach(function (v) { cur.push({ en: v.en, fr: v.fr, emoji: v.emoji || '', pos: v.pos || '', chapter: chId, lesson: l.id, s: 0 }); }); });
    if (!all.length) all = cur.slice();
    var sentences = [];
    if (ri >= 1) CHAPTERS.forEach(function (c) { (c.lessons || []).forEach(function (l) { if ((state.progress[l.id] || 0) < 1) return; (l.sentences || []).forEach(function (s) { if (s.blank && (s.distractors || []).length >= 2 && E.wordsOf(s.en).length <= 8) sentences.push({ s: s, chapter: c.id }); }); }); });
    function weighted(pool) {
      var tot = 0, w = pool.map(function (v) { var x = (E.strengthOf(state.wordStrength, v.en, t) <= 2 ? 3 : 1) * (recent.indexOf(v.en) >= 0 ? 0.05 : 1); tot += x; return x; });
      var r = Math.random() * tot;
      for (var i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i]; }
      return pool[pool.length - 1];
    }
    function wordQuiz() {
      var pool = (cur.length && (Math.random() < 0.65 || all.length < 3)) ? cur : all;
      var v = weighted(pool); if (!v) return { prompt: 'bonjour', hint: '👋', options: ['hello', 'goodbye', 'sorry'], answer: 0, say: 'hello' };
      recent.push(v.en); if (recent.length > 4) recent.shift();
      var others = all.concat(cur).filter(function (o) { return E.normalize(o.en) !== E.normalize(v.en) && !E.frOverlap(o.fr, v.fr); });
      others = E.uniqueBy(others, function (o) { return E.normalize(o.en); });
      var same = others.filter(function (o) { return o.pos === v.pos; });
      var picks = E.pickN(same.length >= 2 ? same : others, 2, Math.random).map(function (o) { return o.en; });
      ['yes', 'no', 'hello'].forEach(function (f) { if (picks.length < 2 && f !== v.en && picks.indexOf(f) < 0) picks.push(f); });
      var options = E.shuffle([v.en].concat(picks), Math.random);
      return { kind: 'word', prompt: v.fr, hint: v.emoji || '', options: options, answer: options.indexOf(v.en), say: v.en, word: v.en };
    }
    function blankQuiz() {
      var mine = sentences.filter(function (x) { return x.chapter === chId; });
      var pool = mine.length && Math.random() < 0.6 ? mine : sentences;
      var pick = pool[Math.floor(Math.random() * pool.length)] || sentences[0];
      var ex = E.buildSet({ rng: Math.random, opts: { tts: false, typing: false }, vocab: [], sentences: [pick.s], sentencePool: [pick.s], plan: ['fill_blank'], keepOrder: true })[0];
      if (!ex || ex.options.length < 3) return wordQuiz();
      var options = ex.options.slice(0, 3); if (options.indexOf(ex.answer) < 0) options[0] = ex.answer;
      return { kind: 'blank', prompt: ex.before + '___' + ex.after, hint: '', sub: pick.s.fr, options: options, answer: options.indexOf(ex.answer), say: pick.s.en, sentence: pick.s.en };
    }
    return function () {
      try { if (ri >= 1 && sentences.length && Math.random() < 0.25) return blankQuiz(); return wordQuiz(); }
      catch (e) { return { prompt: 'bonjour', hint: '👋', options: ['hello', 'goodbye', 'sorry'], answer: 0, say: 'hello' }; }
    };
  }
  function onQuiz(q, correct) {
    if (!q) return;
    recordTask('quiz', !!correct);
    if (q.word) { E.bumpStrength(state.wordStrength, q.word, !!correct, now()); if (!correct) recordMiss(q.word); }
    save();
  }

  // ---------------------------------------------------------------- temps de jeu
  var TICK = 15000;
  function startClock() {
    setInterval(function () { try { if (document.visibilityState !== 'hidden' && state.hero.created) { state.stats.time += TICK; clearTimeout(saveTimer); saveTimer = setTimeout(persist, 400); } } catch (e) { /* ignore */ } }, TICK);
  }

  window.Store = {
    get state() { return state; },
    get loadError() { return loadError; },
    KEY: KEY, GAME: GAME, CAT: CAT, REGIONS: REGIONS, HOME_REGION: HOME_REGION, HOME_CHAPTER: HOME_CHAPTER, isHome: isHome, CHAPTERS: CHAPTERS, COURSE: COURSE, SKILLS: SKILLS, HERO_OUTFITS: HERO_OUTFITS,
    chapter: function (id) { return chapterById[id] || null; }, lesson: function (id) { return lessonInfo[id] || null; }, item: function (id) { return itemById[id] || null; }, spell: function (id) { return spellById[id] || null; }, region: function (id) { return regionById[id] || null; }, foe: function (id) { return foeById[id] || null; },
    chapterNum: chapterNum, regionIndexOfChapter: regionIndexOfChapter, regionOfChapter: regionOfChapter,
    defaultState: defaultState, sanitize: sanitize, save: save, flush: flush, reset: reset, importJson: importJson, exportJson: function () { return JSON.stringify(state); },
    cloud: Cloud, sound: Sound, tts: TTS, vibrate: vibrate, on: function (ev, fn) { listeners[ev] = fn; },
    xpForLevel: xpForLevel, levelOf: levelOf, levelInfo: levelInfo, skillPoints: skillPoints, heroStats: heroStats,
    stepKey: stepKey, stepState: stepState, isRegionUnlocked: isRegionUnlocked, isChapterDone: isChapterDone, isChapterUnlocked: isChapterUnlocked, isStepUnlocked: isStepUnlocked, nextStepIndex: nextStepIndex, chapterStars: chapterStars, currentChapterId: currentChapterId,
    typingOn: typingOn, recordTask: recordTask, recordMiss: recordMiss, touchStreak: touchStreak, addPhrase: addPhrase,
    grant: grant, autoEquip: autoEquip, completeStep: completeStep,
    lessonExercises: lessonExercises, bumpWords: bumpWords, learnedVocab: learnedVocab, practice: practice,
    makeQuiz: makeQuiz, onQuiz: onQuiz, startClock: startClock
  };
})();
