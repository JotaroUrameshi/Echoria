/* Echoria — minigames.js : le niveau 1 « Les quêtes de la maison ». Exposé via window.MiniGames.
   Le « directeur » de la maison explorable (world.js) : quêtes de maman, objectif courant (« ! » doré + flèche), liste à cocher,
   porte d'entrée verrouillée, indices de Pico, objets qui disent leur nom anglais, et les 9 mini-jeux :
     dans le monde : mum_says, house_tour, tidy_up, lay_table ; en gros plan : routine, dress_up, recipe, day_order, big_hug.
   Chaque quête : (découverte) → action → « À toi de le dire » (Lesson.Player, mode court) → quête cochée (étoiles, XP, or, mots).
   Aucun texte de jeu ici : tout vient de chapters/c0.js (ch.ui, ch.world, ch.steps).

   MiniGames.open(root, ctx) → session
     ctx : { ch, start: index d'étape à lancer / rejouer (facultatif), complete(i, result) → résultat de Store.completeStep,
             finale(res) (fin du niveau : bilans de la coquille), exit() (retour à la carte) }
   Tests : MiniGames.state(), MiniGames.debug.expect() (prochaine action attendue), .wrong() (une mauvaise action possible). */
(function () {
  'use strict';
  var S, C, UI, E, L, P, FX, esc;
  function deps() { S = window.Store; C = window.Chars; UI = window.UI; E = window.Engine; L = window.Lesson; P = window.Props; FX = window.FX; esc = UI.esc; }
  var cur = null;
  function rand(a) { return a[Math.floor(Math.random() * a.length)]; }
  var SPEAKER = '<svg viewBox="0 0 28 28" fill="currentColor" aria-hidden="true"><path d="M4 10v8h5l6 5V5L9 10zm13.5 4a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zm-2.5-9.5v2.3a7.5 7.5 0 0 1 0 14.4v2.3a9.8 9.8 0 0 0 0-19z"/></svg>';

  function open(root, ctx) {
    deps();
    if (cur) cur.destroy();
    var ch = ctx.ch, steps = ch.steps, U = ch.ui || {}, def = JSON.parse(JSON.stringify(ch.world));
    var st = S.state, hs = st.home;
    if (!hs || typeof hs !== 'object') hs = st.home = {};
    ['flags', 'seen', 'words', 'secrets'].forEach(function (k) { if (!hs[k] || typeof hs[k] !== 'object') hs[k] = {}; });
    var api = null, destroyed = false, game = null, q = null, pending = null, timers = [], calls = {}, layerKind = null, player = null, cu = null, busyT = 0;
    var VOCAB = {}; (ch.lessons || []).forEach(function (l) { (l.vocab || []).forEach(function (v) { VOCAB[v.en] = v; }); });

    root.innerHTML = '<div class="home-root"><div class="home-world"></div><div class="mg-meter hidden" data-role="meter"></div><div class="mg-list hidden" data-role="list"></div><div class="mg-layer hidden" data-role="layer"></div></div>';
    var hroot = root.firstChild, worldEl = hroot.firstChild, meterEl = hroot.querySelector('[data-role="meter"]'), listEl = hroot.querySelector('[data-role="list"]'), layerEl = hroot.querySelector('[data-role="layer"]');

    // ---------------------------------------------------------------- textes
    function girl() { return st.hero.gender === 'f'; }
    function T(t) { return window.Story.T(t); }
    function sub(t, o) { t = String(t === undefined || t === null ? '' : t); if (o) Object.keys(o).forEach(function (k) { t = t.split('{' + k + '}').join(o[k] === undefined ? '' : o[k]); }); return T(t); }
    function line(l, o) { if (!l) return null; var fr = girl() && l.frF ? l.frF : l.fr; return { who: l.who || 'mum', en: l.en ? sub(l.en, o) : undefined, fr: fr ? sub(fr, o) : '' }; }
    function frHelp() { return st.settings.frHelp || 'tap'; }
    function later(fn, ms) { var t = setTimeout(function () { timers.splice(timers.indexOf(t), 1); if (!destroyed) fn(); }, FX && FX.reduced() ? Math.min(ms, 350) : ms); timers.push(t); return t; }
    function save() { S.save(); }
    function sound(n) { S.sound.play(n); }
    function speak(t) { if (t) S.tts.speak(t); }
    function lbl(o) { var a = o.alt && api.cond(o.alt.if) ? o.alt : o; return { en: a.en, fr: a.fr, word: a.word }; }
    function objSub(o) { if (!o) return {}; var l = lbl(o); return { obj: l.en, objFr: l.fr }; }

    // ---------------------------------------------------------------- mots vus
    function seeWord(w) {
      if (!w || !VOCAB[w] || hs.words[w]) return false;
      hs.words[w] = 1; save(); return true;
    }
    function showLabel(o, opts) {
      var l = lbl(o); if (!l.en) return;
      var fresh = l.word ? seeWord(l.word) : false;
      hs.seen[o.id] = 1;
      var art = (l.word && P.forWord(l.word, 40)) || (o.art && P.art(o.art, 40)) || '';
      api.label({ x: o.x + (o.w || 1) / 2, y: o.y - (o.tall || 0) + (o.face === 'up' ? 0.2 : 0), yb: o.y + (o.h || 1) }, l.en, l.fr, { art: (art ? '<span class="w-label-art">' + art + '</span>' : '') + (fresh ? '<span class="w-new" title="Nouveau mot dans ton Grimoire">📕+1</span>' : ''), silent: opts && opts.silent });
      save();
    }

    // ---------------------------------------------------------------- monde : personnages, bannière, objectifs
    function heroWear() { return hs.flags.dressed ? 'dressed' : 'pyjamas'; }
    function objective(ids) { api.objective(ids || []); api.progress(); }
    function banner(step, subtitle) {
      // la traduction de la bannière n'est affichée que si l'aide en français est « toujours » (sinon : 🇫🇷 dans la liste)
      var showFr = frHelp() === 'always';
      if (!step) { api.banner({ icon: '🏠', en: (U.allDone || {}).en || '', fr: showFr ? (U.allDone || {}).fr : '' }); return; }
      api.banner({ icon: step.emoji || '📜', en: step.titleEn || '', fr: showFr ? (subtitle || step.title || '') : '' });
    }
    function placeActor(id, pos, walk) {
      var a = api.actors[id]; if (!a || !pos) return;
      if (walk && a.map === api.map && pos.map === api.map && !a.hidden) { api.send(id, pos.x, pos.y, function () { if (pos.dir) a.dir = pos.dir; }); return; }
      api.place(id, pos);
    }
    function picoJoin() { var p = api.actors.pico; if (!p) return; p.follow = true; p.map = api.map; p.x = api.hero.x; p.y = api.hero.y; }
    // consigne de maman : { say (anglais), fr, frF } ou réplique { who, en, fr }
    function say(l, opts) { if (l && l.say !== undefined && l.en === undefined) l = { who: 'mum', en: l.say, fr: l.fr, frF: l.frF }; api.say(line(l), opts); }
    function tell(l, ms) { api.say(line(l), { temp: ms || 2600 }); }
    function picoSay(text, ms) { api.pico(esc(T(text)), ms || 7000); }
    var lastMistake = null;
    function oopsLine(subs) { var all = U.oops || [{ en: 'Oops!', fr: 'Oups !' }], ok = subs && subs.obj ? all : all.filter(function (x) { return !/\{obj/.test(x.en + x.fr); }); return rand(ok.length ? ok : all); }
    function mistake(qq, l, hint, o, extra) {
      qq.cur.err++; save(); lastMistake = { quest: qq.step.id, obj: o ? o.id : null, k: qq.cur.k, extra: extra || null }; S.recordTask('home', false);
      sound('wrong'); S.vibrate([40, 30, 40]);
      var subs = Object.assign(objSub(o), extra || {});
      api.say(line(l || oopsLine(subs), subs), { temp: 3400, cls: 'oops' });
      if (hint) picoSay(hint, 8000);
    }
    function good() { sound('correct'); S.recordTask('home', true); S.vibrate(25); }

    // ---------------------------------------------------------------- quêtes
    function nextI() { return S.nextStepIndex(ch.id); }
    function isQuest(i) { return steps[i] && steps[i].type === 'minigame'; }
    function refresh() {
      if (destroyed) return;
      game = null; q = null; pending = null; api.say(null); meter(null);
      var c = hs.cur;
      if (c && isQuest(c.i)) { resume(c); return; }
      hs.cur = null;
      var n = nextI();
      if (n < 0) { allDone(); return; }
      var step = steps[n];
      if (step.type === 'scene') {
        if (n === 0) { playOpening(n); return; }
        if (step.trigger) { placeActor('mum', step.mum, true); pending = { type: 'scene', i: n }; banner({ emoji: '🚪', titleEn: (U.hiddenQuest || {}).en, title: (U.hiddenQuest || {}).fr }); objective([step.trigger]); return; }
        playFinal(n); return;
      }
      offer(n);
    }
    function offer(n) {
      var step = steps[n];
      placeActor('mum', step.mum, true); banner(step);
      if (step.auto) { begin(n, false); return; }
      pending = { type: 'quest', i: n };
      objective(['npc:mum']);
      if (step.call && !calls[step.id]) { calls[step.id] = 1; later(function () { if (pending && pending.i === n) api.say(line(Object.assign({ who: 'mum' }, step.call)), { temp: 4200 }); }, 500); }
      if (U.goMum) later(function () { if (pending && pending.i === n) picoSay(U.goMum, 6000); }, 4800);
    }
    function begin(i, replay) {
      var step = steps[i], G = GAMES[step.game]; if (!G) return;
      pending = null;
      hs.cur = { i: i, sub: null, k: 0, err: 0, found: [], replay: !!replay }; save();
      var go = function () {
        if (destroyed) return;
        q = { step: step, data: step.data || {}, cur: hs.cur }; game = G;
        if (replay && G.reset) G.reset(q);
        if (G.setup) G.setup(q);
        placeActor('mum', step.mum, !replay); banner(step);
        var lines = [line(step.intro)]; if (step.introPico) lines.push({ who: 'pico', fr: T(step.introPico) });
        api.talk(lines, function () { if (!destroyed && q && q.cur === hs.cur) G.run(q); });
      };
      if (replay && step.start) teleport(step.start, go); else go();
    }
    function resume(c) {
      var step = steps[c.i], G = GAMES[step.game];
      q = { step: step, data: step.data || {}, cur: c }; game = G;
      placeActor('mum', (G.mumPos && G.mumPos(q)) || step.mum, false); banner(step);
      if (G.setup) G.setup(q);
      if (c.sub === 'practice') { later(function () { if (q && q.cur === c) startPractice(q); }, 400); return; }
      G.run(q);
    }
    function teleport(pos, done) { api.fade(function () { api.teleport(pos.map, pos.x, pos.y, pos.dir); var p = api.actors.pico; if (p && p.follow) { p.map = pos.map; p.x = pos.x + 0.5; p.y = pos.y + 0.5; } }, done); }
    function replay(i) {
      if (hs.cur) { UI.toast(U.busy || 'Termine d\'abord la quête en cours !', 'warn'); return false; }
      if (!isQuest(i) || !S.stepState(ch.id, i).done) return false;
      hideList(); begin(i, true); return true;
    }
    // fin de l'action d'une quête → « À toi de le dire » → quête cochée
    function finishAction(qq) {
      if (!qq || qq !== q) return;
      game = null; api.say(null); objective([]); meter(null);
      if ((qq.step.practice || []).length) { qq.cur.sub = 'practice'; save(); later(function () { startPractice(qq); }, 900); }
      else later(function () { complete(qq); }, 700);
    }
    function complete(qq) {
      var i = qq.cur.i, step = qq.step, err = qq.cur.err, stars = L.starsFor(err), wasReplay = qq.cur.replay;
      hs.cur = null; q = null; game = null;
      var res = ctx.complete(i, { stars: stars, mistakes: err }) || { cards: [] };
      // les mots de la leçon de la quête entrent dans le Grimoire
      var lesson = (S.lesson(step.lesson) || {}).lesson;
      if (lesson) (lesson.vocab || []).forEach(function (v) { hs.words[v.en] = 1; });
      save();
      questCard(step, res, stars, wasReplay || res.replay, function () { refresh(); });
    }

    // ---------------------------------------------------------------- scènes dans le monde
    function sceneLines(step) { return (step.lines || []).map(function (l) { return line(l); }); }
    function playOpening(i) {
      var step = steps[i];
      api.hero.hidden = !hs.flags.up;
      placeActor('mum', def.actors.mum, false);
      banner({ emoji: '⏰', titleEn: ch.titleEn, title: ch.title });
      ring(3);
      later(function () {
        api.talk(sceneLines(step), function () {
          ctx.complete(i, { stars: 0 }); save();
          picoJoin(); sound('unlock');
          refresh();
        });
      }, 900);
    }
    function playTrigger(i) {
      var step = steps[i], ask = step.ask;
      if (api.state().talking || api.state().menu) return;
      api.pico(null);
      var after = function () {
        api.talk(sceneLines(step), function () { ctx.complete(i, { stars: 0 }); save(); refresh(); });
      };
      if (!ask) { after(); return; }
      var okI = ask.options.findIndex(function (o) { return o.ok; });
      menuWant = { id: String(okI), wrong: String((okI + 1) % ask.options.length) };
      api.menu({ title: T(ask.q), options: ask.options.map(function (o, j) { return { id: String(j), en: T(o.en) }; }), cancel: U.close }, function (id) {
        if (id === null || id === undefined || id === '') return;
        var o = ask.options[+id];
        if (!o) return;
        if (o.ok) { pending = null; menuWant = null; objective([]); good(); api.say({ who: 'hero', en: T(o.en) }, { temp: 2200 }); speak(T(o.en)); later(after, 1500); }
        else { sound('wrong'); picoSay(o.why, 8000); }
      });
    }
    function playFinal(i) {
      var step = steps[i];
      placeActor('mum', { map: 'down', x: 7, y: 9, dir: 'left' }, false); api.pico(null);
      api.talk(sceneLines(step), function () {
        var res = ctx.complete(i, { stars: 0 }) || { cards: [] };
        api.setFlag('exit', 1); sound('unlock'); save();
        var door = api.object('frontdoor');
        api.goTarget('frontdoor');
        later(function () {
          api.say({ who: 'hero', fr: T(girl() && (U.ending || {}).textF ? U.ending.textF : (U.ending || {}).text || '') }, { temp: 2400 });
          api.fade(function () { api.hero.hidden = true; }, function () { if (!destroyed) ctx.finale(res, U.ending); });
        }, door ? 1900 : 600);
      });
    }
    function allDone() {
      placeActor('mum', { map: 'down', x: 7, y: 9, dir: 'left' }, true);
      if (!hs.flags.exit) api.setFlag('exit', 1);
      banner(null); objective([]);
    }
    var ringT = 0;
    function ring(n) { var k = 0; clearInterval(ringT); ringT = setInterval(function () { if (destroyed || hs.flags.alarm || k++ >= n) { clearInterval(ringT); return; } S.sound.tone(1320, 0, 0.07, 'square', 0.05); S.sound.tone(1320, 0.12, 0.07, 'square', 0.05); S.sound.tone(1320, 0.24, 0.07, 'square', 0.05); }, 900); }

    // ---------------------------------------------------------------- découverte
    function discover(qq, done) {
      var c = qq.cur, ids = (qq.data.discover || []).filter(function (id) { return c.found.indexOf(id) < 0 && api.visible(id); });
      if (!ids.length || c.replay) { qq.onDiscover = null; done(); return; }
      c.sub = 'discover'; save();
      objective(ids); banner(qq.step, U.discover ? U.discover + ' · ' + qq.step.title : qq.step.title);
      picoSay(qq.data.discoverTip || U.discoverTip, 9000);
      qq.hint = qq.data.discoverTip || U.discoverTip;
      qq.onDiscover = function (o) {
        showLabel(o);
        var k = ids.indexOf(o.id);
        if (k >= 0) {
          ids.splice(k, 1); c.found.push(o.id); save(); sound('tile');
          objective(ids);
          if (!ids.length) { qq.onDiscover = null; picoSay(U.discoverDone, 4000); banner(qq.step); later(done, 1100); }
        }
        return true;
      };
    }

    // ---------------------------------------------------------------- interactions (appelées par world.js)
    var director = {
      open: function (w) {
        api = w;
        var A = def.actors || {};
        api.addActor('mum', { def: { sprite: function (f, s) { return C.npcSvg('mum', { size: 200, facing: f, step: s, mood: 'happy' }); } }, talk: true, solid: true, speed: 3.3, size: 1.42, map: A.mum.map, x: A.mum.x + 0.5, y: A.mum.y + 0.5, dir: A.mum.dir || 'down' });
        api.addActor('pico', { def: { sprite: function () { return C.picoSvg({ size: 200, mood: 'happy' }); } }, talk: true, fly: true, size: 0.8, map: A.pico.map, x: A.pico.x + 0.5, y: A.pico.y - 0.1 });
        api.addActor('cat', { def: { sprite: function (f, s) { return P.catSprite(s === 1 ? 'walk1' : s === 2 ? 'walk2' : 'sit'); } }, talk: true, flipX: true, size: 0.78, speed: 4.6, map: A.cat.map, x: A.cat.x + 0.5, y: A.cat.y + 0.5, wander: A.cat.wander });
        if (S.stepState(ch.id, 0).done) picoJoin();
        if (!hs.flags.up) { api.hero.hidden = true; var b = def.bedSpot; if (b) api.place('hero', b); }
        api.hero.extra = heroWear();
        later(function () {
          if (typeof ctx.start === 'number' && ctx.start >= 0) { var s0 = ctx.start; ctx.start = null; if (isQuest(s0) && S.stepState(ch.id, s0).done && !hs.cur) { replay(s0); return; } if (isQuest(s0) && nextI() === s0 && !hs.cur) { refresh(); if (pending && pending.i === s0) begin(s0, false); return; } }
          refresh();
        }, 120);
      },
      interact: function (tg) {
        if (layerKind) return true;
        if (tg.type === 'npc') return talkTo(tg.id);
        var o = tg.obj;
        if (q && q.busy) return true;
        if (q && q.onDiscover && q.onDiscover(o)) return true;
        if (q && game && q.onObj && q.onObj(o)) return true;
        if (pending && pending.type === 'scene' && o.id === steps[pending.i].trigger) { playTrigger(pending.i); return true; }
        return defaultObj(o);
      },
      verb: function (tg) {
        var V = U.verbs || {};
        if (api.hero.hidden) return V.wake || '';
        if (tg.type === 'npc') return V.talk;
        var o = tg.obj;
        if (q && q.verb) { var v = q.verb(o); if (v) return v; }
        if (o.id === 'gdoor' || o.id === 'gdoor_out' || o.id === 'frontdoor') return hs.flags[o.id === 'frontdoor' ? 'exit' : 'gdoor'] ? V.look : V.open;
        return V.look;
      },
      forcedTarget: function () { if (api.hero.hidden && !hs.flags.exit) { var b = api.object('bed'); return b ? { type: 'obj', id: 'bed', obj: b } : null; } return null; },
      onWarp: function (w, from) {
        if (w.word) seeWord(w.word);
        var tag = w.to.map === 'down' && from === 'up' ? U.stairsDown : w.to.map === 'up' ? U.stairsUp : w.to.map === 'garden' ? U.goOut : from === 'garden' ? U.comeIn : null;
        if (tag) later(function () { api.say({ who: 'pico', en: tag.en, fr: tag.fr }, { temp: 1600, silent: false }); }, 150);
        if (q && q.onMap) q.onMap(w.to.map);
      },
      enterZone: function (id) { if (q && q.onZone && id) q.onZone(id); },
      idleHint: function () {
        if (layerKind) return;
        if (q && q.hint) picoSay(q.hint, 8000);
        else if (pending && pending.type === 'quest' && U.goMum) picoSay(U.goMum, 7000);
        else if (U.idle && U.idle.length) picoSay(rand(U.idle), 7000);
      },
      tick: function (dt) { if (busyT > 0) busyT -= dt; if (!meterEl.classList.contains('hidden')) { var tp = Math.round(api.topInset() + 8) + 'px'; if (meterEl.style.top !== tp) meterEl.style.top = tp; } },
      draw: null,
      state: function () { return homeState(); },
      destroy: function () {}
    };
    function talkTo(id) {
      if (id === 'mum') {
        if (!hs.words.Mum) { seeWord('Mum'); var mw = U.mumWord; if (mw) api.say({ who: 'mum', en: mw.en, fr: mw.fr }, { temp: 1200 }); }
        if (pending && pending.type === 'quest') { begin(pending.i, false); return true; }
        if (pending && pending.type === 'scene') { playTrigger(pending.i); return true; }
        if (q && q.repeat) { q.repeat(); return true; }
        if (q && q.cur.sub === 'practice') { startPractice(q); return true; }
        if (nextI() < 0) { api.talk([line(U.mumDone)]); return true; }
        api.talk([line(rand(U.mumTalk || [{ en: 'Go on!', fr: 'Vas-y !' }]))]); return true;
      }
      if (id === 'pico') { if (q && q.hint) picoSay(q.hint, 8000); else picoSay(U.picoTalk || '', 6000); sound('pet'); return true; }
      if (id === 'cat') { var c = U.catTalk || {}; var a = api.actors.cat; api.label({ x: a.x, y: a.y - 0.9 }, c.en || 'Meow!', c.fr || ''); sound('pet'); return true; }
      return false;
    }
    function defaultObj(o) {
      if (o.id === 'frontdoor') {
        if (nextI() < 0) { showLabel(o, { silent: true }); api.talk([line(U.mumDone)], function () { ctx.exit(); }); return true; }
        showLabel(o, { silent: true });
        api.talk((U.doorLocked || []).map(function (l) { return line(l); }));
        return true;
      }
      if (o.id === 'gdoor' || o.id === 'gdoor_out') { var open = !hs.flags.gdoor; api.setFlag('gdoor', open ? 1 : 0); sound(open ? 'unlock' : 'click'); showLabel(o); save(); return true; }
      showLabel(o);
      if (o.secret && !hs.secrets[o.secret] && U.secrets && U.secrets[o.secret]) {
        var sc = U.secrets[o.secret]; hs.secrets[o.secret] = 1;
        later(function () { api.say({ who: 'pico', en: sc.en, fr: T(sc.fr) }, { temp: 3600 }); sound('coin'); if (sc.gold) { S.grant({ gold: sc.gold }, {}); } save(); }, 900);
      }
      return true;
    }

    // ================================================================ mini-jeux dans le monde
    var GAMES = {};
    // petite pause après une bonne action (réaction de maman / du héros), pendant laquelle les appuis sont ignorés
    function after(qq, l, fn, ms) { qq.expect = null; qq.busy = true; objective([]); if (l) { var L0 = line(l); api.say(L0, { temp: (ms || 1700) + 600 }); if (L0.who === 'hero' && L0.en) speak(L0.en); } later(function () { qq.busy = false; if (q === qq) fn(); }, ms || (l ? 1700 : 500)); }

    // ---- quête 1 : maman donne ses consignes une à une, on va jusqu'au bon objet de la chambre
    GAMES.mum_says = {
      reset: function (qq) { api.setFlags({ awake: 0, up: 0, alarm: 0, curtains: 0, window: 0, bed: 0 }); api.hero.hidden = true; if (def.bedSpot) api.place('hero', def.bedSpot); },
      run: function (qq) {
        var d = qq.data, c = qq.cur, rel = {};
        (d.wake || []).concat(d.orders || []).forEach(function (x) { rel[x.target] = 1; }); (d.discover || []).forEach(function (id) { rel[id] = 1; });
        c.sub = c.sub || 'wake';
        qq.repeat = function () { if (qq.expect) say(qq.expect); };
        qq.verb = function (o) { return o.id === 'window' || o.id === 'alarm' ? (U.verbs || {}).use : o.id === 'bed' && hs.flags.up ? (U.verbs || {}).use : null; };
        function next() {
          if (q !== qq) return;
          if (c.sub === 'wake') {
            var w = d.wake[c.k];
            if (!w || hs.flags.up) { c.sub = 'discover'; c.k = 0; save(); return next(); }
            if (hs.flags[w.flag]) { c.k++; return next(); }
            api.hero.hidden = true; qq.expect = w; qq.hint = w.hint; say(w); objective(['bed']); return;
          }
          if (c.sub === 'discover') return discover(qq, function () { c.sub = 'orders'; c.k = 0; save(); next(); });
          var o = d.orders[c.k];
          if (!o) { if (d.myYour) picoSay(d.myYour, 7000); return finishAction(qq); }
          if (hs.flags[o.flag] && !c.replay) { c.k++; return next(); }
          if (o.flag === 'alarm') ring(2);
          qq.expect = o; qq.hint = o.hint; say(o); objective([o.target]);
        }
        function hit(e) {
          api.setFlag(e.flag, 1); good(); save();
          if (e.flag === 'up') { api.hero.hidden = false; if (def.bedSpot) api.place('hero', def.bedSpot); }
          var o = api.object(e.target); if (o && c.sub !== 'wake') showLabel(o, { silent: true });
          after(qq, e.done, function () { c.k++; save(); next(); });
        }
        qq.wrongFn = function () { var e = qq.expect; if (!e || c.sub !== 'orders') return null; var ids = Object.keys(rel).filter(function (id) { return id !== e.target; }); return ids.length ? { kind: 'goto', id: ids[0] } : null; };
        qq.onObj = function (o) {
          var e = qq.expect;
          if (c.sub === 'wake') { if (e && o.id === 'bed') hit(e); return true; }
          if (c.sub !== 'orders') return false;
          if (!e) return true;
          if (o.id === e.target) { hit(e); return true; }
          if (rel[o.id]) { showLabel(o, { silent: true }); mistake(qq, null, e.hint, o); return true; }
          return false;
        };
        next();
      }
    };

    // ---- quête 2 : suivre les directions de maman dans toute la maison (le chat a pris la chaussette)
    GAMES.house_tour = {
      mumPos: function (qq) { return qq.cur.k > 0 || qq.cur.left ? qq.data.mumGoes : null; },
      reset: function (qq) { api.setFlags({ gdoor: 0, tour_sock: 1 }); },
      setup: function (qq) { if (!qq.cur.setup) { qq.cur.setup = 1; api.setFlags({ tour_sock: 1, gdoor: 0 }); var cat = api.actors.cat; cat.wander = null; api.place('cat', { map: 'up', x: 5, y: 5, dir: 'left' }); save(); } },
      run: function (qq) {
        var d = qq.data, c = qq.cur, cat = api.actors.cat, zoneTold = {};
        cat.wander = null;
        if (!c.left) { c.left = 1; save(); api.send('mum', 7, 5, function () { api.place('mum', d.mumGoes); }); }
        qq.repeat = function () { if (qq.expect) say(qq.expect); };
        function target(g) { if (g.go) return g.go; if (g.act === 'gdoor') return api.map === 'garden' ? 'gdoor_out' : 'gdoor'; return g.act; }
        function moveCat(pos) {
          if (!pos) return;
          if (cat.map === api.map && pos.map === api.map) { api.send('cat', pos.x, pos.y); return; }
          if (cat.map === api.map && cat.map !== pos.map) {
            var ws = (def.maps[cat.map].warps || []).filter(function (w) { return w.to.map === pos.map || (pos.map === 'garden' && w.to.map === 'down'); });
            if (ws.length) { api.send('cat', ws[0].x - (ws[0].x > 6 ? 1 : 0), ws[0].y + (ws[0].y === 0 ? 1 : 0), function () { api.place('cat', pos); }); return; }
          }
          api.place('cat', pos);
        }
        function satisfied(g) {
          if (g.go && g.go.indexOf('map:') === 0) return api.map === g.go.slice(4);
          if (g.go && g.go.indexOf('zone:') === 0) return api.zone() === g.go.slice(5);
          if (g.act && g.flag) return (hs.flags[g.flag] ? 1 : 0) === (g.val ? 1 : 0) && c.k > 0 && g.act !== 'sock';
          return false;
        }
        function next() {
          if (q !== qq) return;
          var g = d.legs[c.k];
          if (!g) { api.hero.carry = null; cat.wander = def.actors.cat.wander; api.place('cat', def.actors.cat); return finishAction(qq); }
          if (g.act === 'sock' && !hs.flags.tour_sock) { c.k++; save(); return next(); }
          qq.expect = g; qq.hint = g.hint; say(g); objective([target(g)]); moveCat(g.cat);
          if (satisfied(g)) hit(g);
        }
        function hit(g) {
          if (qq.expect !== g) return;
          good(); if (g.carry) api.hero.carry = g.carry;
          after(qq, g.done, function () { c.k++; save(); next(); }, g.done ? 1700 : 900);
        }
        qq.onMap = function (m) { var g = qq.expect; if (g && g.go === 'map:' + m) hit(g); else if (g) objective([target(g)]); };
        qq.onZone = function (z) {
          var g = qq.expect; if (!g) return;
          if (g.go === 'zone:' + z) { hit(g); return; }
          if (g.go && g.go.indexOf('zone:') === 0 && g.wrongZone && g.wrongZone[z] && !zoneTold[c.k + z]) { zoneTold[c.k + z] = 1; picoSay(g.wrongZone[z], 6000); }
        };
        qq.wrongFn = function () { var g = qq.expect; var k0 = g && g.decoys ? Object.keys(g.decoys)[0] : null; return k0 ? { kind: 'goto', id: k0 } : null; };
        qq.verb = function (o) { var g = qq.expect; return g && g.act === 'sock' && o.id === 'sock' ? (U.verbs || {}).take : null; };
        qq.onObj = function (o) {
          var g = qq.expect; if (!g) return false;
          var isDoor = o.id === 'gdoor' || o.id === 'gdoor_out';
          if (g.act && (o.id === g.act || (g.act === 'gdoor' && isDoor))) {
            if (g.flag) api.setFlag(g.flag, g.val ? 1 : 0);
            if (isDoor) sound(g.val ? 'unlock' : 'click');
            showLabel(o, { silent: true }); save(); hit(g); return true;
          }
          if (g.decoys && g.decoys[o.id]) { showLabel(o, { silent: true }); mistake(qq, g.decoys[o.id], g.hint, o); return true; }
          return false;
        };
        next();
      }
    };

    // ---- quête 5 : ramasser les objets qui traînent et les porter au bon endroit
    GAMES.tidy_up = {
      reset: function (qq) { qq.cur.messed = 0; },
      setup: function (qq) {
        var d = qq.data, c = qq.cur;
        if (!c.messed) { var f = { toys: 0, books: 0, dirty: 0 }; (d.mess || []).forEach(function (k) { f[k] = 1; }); api.setFlags(f); c.messed = 1; c.placed = 0; c.g = 0; c.carry = null; save(); api.place('cat', { map: 'up', x: 3, y: 2, dir: 'down' }); }
        if (c.carry) { var o = api.object(c.carry); api.hero.carry = o ? o.art : null; }
      },
      run: function (qq) {
        var d = qq.data, c = qq.cur, total = 0, dests = {};
        d.groups.forEach(function (g) { total += g.items.length; dests[g.dest] = 1; });
        qq.repeat = function () { var g = d.groups[c.g]; if (g) say(g); };
        qq.verb = function (o) { var g = d.groups[c.g]; if (!g) return null; if (!c.carry && o.kind === 'item' && /^[tbd]_/.test(o.id)) return (U.verbs || {}).take; if (c.carry && dests[o.id]) return (U.verbs || {}).put; return null; };
        function bar() { meter({ en: (U.mess || {}).en, fr: (U.mess || {}).fr, pct: c.placed / total }); }
        function next() {
          if (q !== qq) return;
          var g = d.groups[c.g]; bar();
          if (!g) { if (d.cleanWord) seeWord(d.cleanWord); return finishAction(qq); }
          var left = g.items.filter(function (id) { return api.visible(id); });
          if (!c.carry && !left.length) { c.g++; save(); return next(); }
          qq.hint = g.hint; say(g); objective(c.carry ? [g.dest] : left);
        }
        qq.wrongFn = function () {
          var g = d.groups[c.g]; if (!g) return null;
          if (c.carry) { var other = Object.keys(dests).filter(function (x) { return x !== g.dest; })[0]; return { kind: 'goto', id: other }; }
          for (var i = 0; i < d.groups.length; i++) if (i !== c.g) { var it = d.groups[i].items.filter(function (id) { return api.visible(id); })[0]; if (it) return { kind: 'goto', id: it }; }
          return null;
        };
        function groupOf(id) { for (var i = 0; i < d.groups.length; i++) if (d.groups[i].items.indexOf(id) >= 0) return i; return -1; }
        qq.onObj = function (o) {
          var g = d.groups[c.g]; if (!g) return false;
          if (c.sub === 'discover') return false;
          var gi = groupOf(o.id);
          if (!c.carry) {
            if (gi === c.g) {
              api.setFlag(o.if, 0); c.carry = o.id; api.hero.carry = o.art; good(); showLabel(o);
              if (d.carried) later(function () { api.say(line(d.carried, objSub(o)), { temp: 3000 }); }, 900);
              objective([g.dest]); save(); return true;
            }
            if (gi >= 0) { showLabel(o, { silent: true }); mistake(qq, d.notYet, d.notYetPico, o); return true; }
            return false;
          }
          if (o.id === g.dest) {
            var n = (hs.flags[g.flag] || 0) + 1; api.setFlag(g.flag, n); c.carry = null; api.hero.carry = null; c.placed++; good(); showLabel(o, { silent: true }); save(); bar();
            later(next, 500); return true;
          }
          if (dests[o.id]) { showLabel(o, { silent: true }); mistake(qq, g.wrongDest, g.hint, o); return true; }
          return false;
        };
        bar();
        discover(qq, function () { c.sub = 'groups'; save(); next(); });
      }
    };

    // ---- quête 6 : aller chercher au placard ce que maman demande et le poser sur la table
    GAMES.lay_table = {
      reset: function (qq) { api.setFlags({ table: 0, breakfast: 0 }); },
      setup: function (qq) { var c = qq.cur; if (c.carry) api.hero.carry = (qq.data.items[c.carry] || {}).art || null; },
      run: function (qq) {
        var d = qq.data, c = qq.cur;
        qq.repeat = function () { var a = d.asks[c.k]; if (a) say(a); };
        qq.verb = function (o) { if (o.id === d.from && !c.carry) return (U.verbs || {}).open; if (o.id === d.to && c.carry) return (U.verbs || {}).put; return null; };
        function next() {
          if (q !== qq) return;
          var a = d.asks[c.k];
          if (!a) return finishAction(qq);
          if (!c.carry && (hs.flags.table || 0) > c.k) { c.k++; return next(); }
          qq.hint = a.hint; say(a); objective(c.carry ? [d.to] : [d.from]);
        }
        function place() {
          api.setFlag('table', c.k + 1); c.carry = null; api.hero.carry = null; good(); c.k++; save();
          var t = api.object(d.to); if (t) showLabel(t, { silent: true });
          later(next, 700);
        }
        qq.onObj = function (o) {
          if (c.sub === 'discover') return false;
          var a = d.asks[c.k]; if (!a) return false;
          if (o.id === d.from) {
            if (c.carry) { if (d.carried) api.say(line(d.carried, { objFr: d.items[c.carry].fr }), { temp: 2600 }); return true; }
            showLabel(o, { silent: true });
            menuWant = { id: a.item, wrong: a.options.filter(function (x) { return x !== a.item; })[0] };
            api.menu({ title: T(d.menuTitle), cancel: U.close, options: a.options.map(function (id) { var it = d.items[id]; return { id: id, en: it.en, html: P.art(it.art, 64) }; }) }, function (id) {
              if (!id || q !== qq) return;
              var it = d.items[id];
              if (id === a.item) { c.carry = id; api.hero.carry = it.art; good(); if (d.carried) api.say(line(d.carried, { objFr: it.fr }), { temp: 2600 }); objective([d.to]); save(); }
              else mistake(qq, d.wrongItem, a.hint, null, { obj: it.en, objFr: it.fr });
            });
            return true;
          }
          if (o.id === d.to) {
            if (!c.carry) { showLabel(o); return true; }
            if (a.side) {
              menuWant = { id: a.side, wrong: a.side === 'left' ? 'right' : 'left' };
              api.menu({ title: T(d.sides.title), cancel: U.close, options: [{ id: 'left', en: d.sides.left.en, html: '<span class="emoji w-opt-ico">⬅️</span>' }, { id: 'right', en: d.sides.right.en, html: '<span class="emoji w-opt-ico">➡️</span>' }] }, function (id) {
                if (!id || q !== qq) return;
                if (id === a.side) place(); else mistake(qq, d.sideOops, d.sideHint);
              });
              return true;
            }
            place(); return true;
          }
          return false;
        };
        discover(qq, function () { c.sub = 'asks'; save(); next(); });
      }
    };

    // ---- quêtes en gros plan : découverte, puis on va jusqu'à l'objet qui ouvre le mini-jeu
    function closeupGame(open) {
      return {
        run: function (qq) {
          var d = qq.data, c = qq.cur;
          qq.verb = function (o) { return (d.at || []).indexOf(o.id) >= 0 ? (U.verbs || {}).use : null; };
          qq.onObj = function (o) {
            if (c.sub !== 'at') return false;
            if ((d.at || []).indexOf(o.id) >= 0) { open(qq); return true; }
            return false;
          };
          qq.repeat = function () { if (!d.at) { open(qq); return; } if (c.sub === 'at') { say(qq.step.intro); picoSay(d.atHint, 6000); } };
          if (!d.at) { c.sub = 'at'; open(qq); return; }
          discover(qq, function () { var m = Math.floor(d.at.length / 2); c.sub = 'at'; save(); qq.hint = d.atHint; objective(d.at.slice(m, m + 1)); picoSay(d.atHint, 7000); });
        }
      };
    }

    // ================================================================ gros plans
    function portrait(who) {
      if (who === 'mum') return C.npcSvg('mum', { bust: true, size: 64, mood: 'happy' });
      if (who === 'pico') return C.svg(C.PICO_LOOK, { bust: true, size: 64, mood: 'happy' });
      if (who === 'hero') return C.heroSvg(st, { bust: true, size: 64, mood: 'happy', wear: heroWear() });
      return '<span class="emoji">📖</span>';
    }
    function nameOf(who) { return who === 'mum' ? ((C.npc('mum') || {}).name || 'Mum') : who === 'pico' ? 'Pico' : who === 'hero' ? (st.hero.name || '') : ''; }
    function bubble(l, cls) {
      if (!l) return '';
      var help = frHelp(), fr = l.fr && help !== 'never' ? '<div class="cu-fr' + (help === 'always' ? '' : ' hidden') + '" data-role="fr">' + esc(l.fr) + '</div>' : '';
      return '<div class="cu-bub who-' + esc(l.who) + (cls ? ' ' + cls : '') + '"><div class="cu-face">' + portrait(l.who) + '</div><div class="cu-bub-body"><div class="cu-name">' + esc(nameOf(l.who)) + '</div>' +
        (l.en ? '<div class="cu-en" lang="en">' + esc(l.en) + '</div>' + fr : '<div class="cu-frtext">' + esc(l.fr || '') + '</div>') + '</div>' +
        (l.en ? '<div class="cu-tools"><button class="cu-tool" data-mg="speak" data-text="' + esc(l.en) + '" aria-label="' + esc(U.listen || 'Écouter') + '">' + SPEAKER + '</button>' + (l.fr && help === 'tap' ? '<button class="cu-tool" data-mg="fr" aria-label="' + esc(U.frBtn || 'Traduction') + '"><span class="emoji">🇫🇷</span></button>' : '') + '</div>' : '') + '</div>';
    }
    function openLayer(kind, html) {
      layerKind = kind; layerEl.className = 'mg-layer on mg-' + kind; layerEl.innerHTML = html; layerEl.scrollTop = 0;
      api.pause(); hideList();
      if (FX && FX.once && layerEl.firstChild) FX.once(layerEl.firstChild, 'w-pop', 400);
      return layerEl;
    }
    function closeLayer() {
      if (cu && cu.stop) cu.stop(); cu = null;
      if (player) { try { player.destroy(); } catch (e) { /* ignore */ } player = null; }
      layerKind = null; layerEl.className = 'mg-layer hidden'; layerEl.innerHTML = '';
      if (!destroyed) api.resume();
    }
    // Squelette d'un gros plan : fond illustré, titre, bulle de consigne, scène, plateau d'objets, bulle de Pico.
    function closeup(qq, bg, cls) {
      var step = qq.step;
      var el = openLayer('cu', '<div class="cu ' + (cls || '') + '"><div class="cu-bg">' + C.backdrop(bg) + '</div>' +
        '<div class="cu-top"><button class="cu-x" data-mg="close" aria-label="' + esc(U.close || 'Fermer') + '"><svg viewBox="0 0 28 28" aria-hidden="true"><path d="M7 7l14 14M21 7 7 21" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/></svg></button><div class="cu-title"><span class="emoji">' + esc(step.emoji || '') + '</span><b lang="en">' + esc(step.titleEn) + '</b></div><div class="cu-err" data-role="err"></div></div>' +
        '<div class="cu-say" data-role="say"></div><div class="cu-pico hidden" data-role="pico" data-mg="pico-close"></div><div class="cu-stage" data-role="stage"></div><div class="cu-tray" data-role="tray"></div></div>');
      var R = function (r) { return el.querySelector('[data-role="' + r + '"]'); };
      var o = { el: el, say: R('say'), stage: R('stage'), tray: R('tray'), pico: R('pico'), err: R('err'), sayT: 0, picoT: 0, sayLine: null, handlers: {}, stopFns: [] };
      o.setSay = function (l, opts) { opts = opts || {}; clearTimeout(o.sayT); if (!l) { o.say.innerHTML = ''; return; } if (!opts.temp) o.sayLine = l; o.say.innerHTML = bubble(l, opts.cls); if (FX && FX.once && o.say.firstChild) FX.once(o.say.firstChild, opts.cls === 'oops' ? 'w-shake' : 'w-pop', 400); if (l.en && !opts.silent) speak(l.en); if (opts.temp) o.sayT = setTimeout(function () { if (cu === o && o.sayLine) o.say.innerHTML = bubble(o.sayLine); }, opts.temp); };
      o.setPico = function (text, ms) { clearTimeout(o.picoT); if (!text) { o.pico.classList.add('hidden'); return; } o.pico.innerHTML = '<div class="cu-pico-face">' + C.svg(C.PICO_LOOK, { bust: true, size: 52, mood: 'happy' }) + '</div><div class="cu-pico-txt">' + esc(T(text)) + '</div>'; o.pico.classList.remove('hidden'); if (FX && FX.once) FX.once(o.pico, 'w-pop', 400); o.picoT = setTimeout(function () { o.pico.classList.add('hidden'); }, ms || 7000); };
      o.oops = function (l, hint, subs) { qq.cur.err++; save(); lastMistake = { quest: qq.step.id, closeup: o.kind, subs: subs || null }; S.recordTask('home', false); sound('wrong'); S.vibrate([40, 30, 40]); o.setSay(line(l || oopsLine(subs), subs || {}), { temp: 3200, cls: 'oops' }); if (hint) o.setPico(hint, 8000); o.err.innerHTML = UI.stars(L.starsFor(qq.cur.err), 'mini'); if (FX && FX.wrong) try { FX.wrong(o.stage, false); } catch (e) { /* ignore */ } };
      o.stop = function () { clearTimeout(o.sayT); clearTimeout(o.picoT); o.stopFns.forEach(function (f) { try { f(); } catch (e) { /* ignore */ } }); o.stopFns = []; };
      o.err.innerHTML = UI.stars(L.starsFor(qq.cur.err), 'mini');
      o.later = function (fn, ms) { later(function () { if (cu === o) fn(); }, ms); };
      cu = o; o.qq = qq;
      return o;
    }
    function trayHtml(ids, items, opts) {
      opts = opts || {};
      return '<div class="cu-picktitle">' + esc(opts.title || U.pickTitle || '') + '</div><div class="cu-items n' + ids.length + '">' + ids.map(function (id) { var it = items[id] || {}; var on = opts.on && opts.on[id]; return '<button class="cu-item' + (on ? ' on' : '') + '" data-mg="pick" data-id="' + esc(id) + '"' + (on ? ' disabled' : '') + '><span class="cu-item-art">' + (P.art(it.art, 64) || '<span class="emoji">' + esc(it.emoji || '❔') + '</span>') + '</span><b lang="en">' + esc(it.en || id) + '</b>' + (on ? '<i class="cu-tick">✓</i>' : '') + '</button>'; }).join('') + '</div>';
    }
    // Geste au doigt sur un « pavé » : frotter (rub), glisser (swipe), verser vers le bas (pour), toucher (tap). Jamais de minuteur.
    function gesture(o, g, artHtml, done) {
      var pad = document.createElement('div');
      pad.className = 'cu-pad kind-' + (g.kind || 'rub') + ' zone-' + (g.zone || 'x');
      pad.setAttribute('data-role', 'pad');
      pad.innerHTML = '<svg class="cu-ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="6"/><circle class="cu-ring-on" cx="50" cy="50" r="46" fill="none" stroke="#F5B833" stroke-width="7" stroke-linecap="round" stroke-dasharray="289" stroke-dashoffset="289" transform="rotate(-90 50 50)"/></svg><div class="cu-pad-art">' + artHtml + '</div><div class="cu-fx" aria-hidden="true"></div><div class="cu-hand emoji" aria-hidden="true">👆</div>';
      var cue = document.createElement('div'); cue.className = 'cu-cue'; cue.textContent = T(g.cue || U.gesture || '');
      o.stage.appendChild(pad); o.stage.appendChild(cue);
      var need = Math.max(1, g.n || 6), p = 0, last = null, fin = false, fx = pad.querySelector('.cu-fx'), ring = pad.querySelector('.cu-ring-on'), parts = 0;
      var unit = g.kind === 'tap' ? 1 : 70;
      function bump(v, x, y) {
        if (fin) return;
        p = Math.min(need, p + v);
        ring.setAttribute('stroke-dashoffset', String(Math.round(289 * (1 - p / need))));
        pad.classList.add('active'); pad.querySelector('.cu-hand').classList.add('hidden');
        if (x !== undefined && parts < 60 && Math.random() < 0.5) {
          var b = document.createElement('i'); b.className = 'cu-part p-' + (g.zone || 'x'); b.style.left = x + 'px'; b.style.top = y + 'px'; fx.appendChild(b); parts++;
          setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); parts--; }, 900);
        }
        if (p >= need) { fin = true; pad.classList.add('done'); sound('combo'); S.vibrate(40); if (o.pad === pad) o.pad = null; setTimeout(function () { if (cu === o) done(); }, FX && FX.reduced() ? 100 : 550); }
      }
      function pos(e) { var r = pad.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
      pad.addEventListener('pointerdown', function (e) { e.preventDefault(); try { pad.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ } last = pos(e); sound('tile'); bump(g.kind === 'tap' ? 1 : 0.35, last.x, last.y); });
      pad.addEventListener('pointermove', function (e) {
        if (!last || g.kind === 'tap') return; var c = pos(e), dx = c.x - last.x, dy = c.y - last.y, d;
        if (g.kind === 'pour') d = Math.max(0, dy) + Math.abs(dx) * 0.25; else if (g.kind === 'swipe') d = Math.abs(dx) + Math.abs(dy) * 0.4; else d = Math.sqrt(dx * dx + dy * dy);
        last = c; if (d > 0.5) bump(d / unit, c.x, c.y);
      });
      var up = function () { last = null; pad.classList.remove('active'); };
      pad.addEventListener('pointerup', up); pad.addEventListener('pointercancel', up);
      pad.addEventListener('keydown', function (e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); bump(g.kind === 'tap' ? 1 : 1.2); } });
      pad.tabIndex = 0;
      o.pad = pad; o.gestureLeft = function () { return need - p; }; o.bump = bump;
      return pad;
    }
    function clearStage(o) { o.stage.innerHTML = ''; o.tray.innerHTML = ''; o.pad = null; }

    // ---- quête 3 : la routine au lavabo
    function openRoutine(qq) {
      var d = qq.data, c = qq.cur, o = closeup(qq, 'bathroom', 'cu-routine');
      var k = 0, picked = false;
      o.kind = 'routine';
      function mirror(mood, extra) { return '<div class="cu-mirror' + (extra ? ' ' + extra : '') + '">' + C.heroSvg(st, { size: 170, bust: true, mood: mood || 'neutral', wear: heroWear() }) + '</div>'; }
      function artFor(zone, item) {
        if (zone === 'teeth') return P.art('teeth', 150);
        if (zone === 'hands') return P.art('hands', 150);
        if (zone === 'brush') return P.art('toothpaste', 130) + P.art('toothbrush', 90, 'cu-mini');
        return C.heroSvg(st, { size: 160, bust: true, mood: 'happy', wear: heroWear() });
      }
      function show() {
        var s = d.steps[k];
        if (!s) { o.setSay(null); return finish(); }
        clearStage(o); picked = !s.pick; o.expect = s;
        o.setSay(line(Object.assign({ who: 'mum' }, { en: s.say, fr: s.fr })));
        o.stage.innerHTML = mirror();
        if (s.pick) o.tray.innerHTML = trayHtml(s.options, d.items);
        else startGesture(s);
      }
      function startGesture(s) {
        o.tray.innerHTML = '';
        o.stage.innerHTML = mirror('happy', 'small');
        gesture(o, s.gesture, artFor(s.gesture.zone), function () {
          good(); o.stage.innerHTML = mirror('happy', 'shine');
          var dl = line(s.done); if (dl) { o.setSay(dl, { temp: 1900 }); }
          o.later(function () { k++; show(); }, dl ? 1900 : 900);
        });
      }
      o.handlers.pick = function (id) {
        var s = d.steps[k]; if (!s || picked) return;
        if (id === s.pick) { picked = true; good(); var it = d.items[id]; o.setSay({ who: 'mum', en: it.en, fr: it.fr }, { temp: 1200 }); o.later(function () { startGesture(s); }, 650); return; }
        var w = (s.wrong && s.wrong[id]) || null, it2 = d.items[id] || {};
        o.oops(w, s.hint, { obj: it2.en, objFr: it2.fr });
      };
      o.expectFn = function () { var s = d.steps[k]; if (!s) return null; if (!picked) return { kind: 'pick', id: s.pick, wrong: s.options.filter(function (x) { return x !== s.pick; })[0] }; return { kind: 'gesture', g: s.gesture.kind, n: s.gesture.n }; };
      function finish() { closeLayer(); finishAction(qq); }
      show();
    }

    // ---- quête 4 : s'habiller devant l'armoire
    function openDress(qq) {
      var d = qq.data, c = qq.cur, o = closeup(qq, 'bedroom', 'cu-dress');
      var k = 0, wear = 'pyjamas', order = ['pyjamas', 'tshirt', 'trousers', 'socks', 'shoes'];
      o.kind = 'dress';
      function hero(pop) { return '<div class="cu-hero' + (pop ? ' pop' : '') + '">' + C.heroSvg(st, { size: 250, mood: k >= d.steps.length ? 'happy' : 'neutral', wear: wear }) + '</div>'; }
      function show(pop) {
        var s = d.steps[k];
        o.stage.innerHTML = '<div class="cu-wardrobe" aria-hidden="true"></div>' + hero(pop);
        var on = {}; d.steps.slice(0, k).forEach(function (x) { on[x.pick] = 1; });
        var ids = order.filter(function (id) { return id !== 'pyjamas' || k === 0; });
        o.tray.innerHTML = s ? trayHtml(ids, d.items, { on: on }) : '';
        if (!s) return finish();
        o.expect = s;
        o.setSay(line({ who: 'mum', en: s.say, fr: s.fr }));
      }
      o.handlers.pick = function (id) {
        var s = d.steps[k]; if (!s) return;
        if (id === s.pick) {
          good(); wear = s.wear || wear; k++;
          var dl = line(s.done); if (dl) { o.setSay(dl, { temp: 1800 }); if (dl.who === 'hero' && dl.en) speak(dl.en); }
          show(true);
          return;
        }
        var it = d.items[id] || {};
        var tr = d.trap, before = tr ? d.steps.map(function (x) { return x.pick; }).indexOf(tr.before) : -1;
        if (tr && id === tr.pick && k <= before) { o.oops(tr.say, tr.pico, {}); return; }
        o.oops(null, s.hint, { obj: it.en, objFr: it.fr });
      };
      o.expectFn = function () { var s = d.steps[k]; return s ? { kind: 'pick', id: s.pick, wrong: s.pick === 'socks' ? 'shoes' : (s.pick === 'pyjamas' ? 'socks' : 'pyjamas') } : null; };
      function finish() {
        o.later(function () { api.setFlag('dressed', 1); api.hero.extra = 'dressed'; api.refreshHero(); save(); closeLayer(); finishAction(qq); }, 1500);
      }
      show();
    }

    // ---- quête 7 : le petit déjeuner avec maman (choisir le bon mot, puis le geste)
    function openRecipe(qq) {
      var d = qq.data, c = qq.cur, o = closeup(qq, 'kitchen', 'cu-recipe');
      var k = 0, chosen = false;
      o.kind = 'recipe';
      function gap(s) { var re = new RegExp('\\b' + s.blank.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b'), m = re.exec(s.en); if (!m) return { a: s.en, b: '' }; return { a: s.en.slice(0, m.index), b: s.en.slice(m.index + s.blank.length) }; }
      function show() {
        var s = d.steps[k];
        if (!s) return finish();
        chosen = false; o.expect = s; clearStage(o);
        var g = gap(s);
        o.setSay(line({ who: 'mum', en: g.a + '…' + g.b, fr: s.fr }), { silent: true });
        o.stage.innerHTML = '<div class="cu-mum">' + C.npcSvg('mum', { size: 150, mood: 'happy' }) + '</div><div class="cu-food">' + P.art(s.art, 150) + '</div>';
        o.tray.innerHTML = '<div class="cu-picktitle">' + esc(U.blankTitle || '') + '</div><div class="cu-words">' + s.options.map(function (w) { return '<button class="cu-word" data-mg="word" data-id="' + esc(w) + '" lang="en">' + esc(w) + '</button>'; }).join('') + '</div>';
      }
      o.handlers.word = function (w) {
        var s = d.steps[k]; if (!s || chosen) return;
        if (w === s.blank) {
          chosen = true; good();
          var wb = o.tray.querySelector('[data-mg="word"][data-id="' + w + '"]'); if (wb) wb.classList.add('ok');
          o.setSay(line({ who: 'mum', en: s.en, fr: s.fr }));
          o.later(function () {
            o.tray.innerHTML = '';
            var food = o.stage.querySelector('.cu-food'); if (food) food.parentNode.removeChild(food);
            gesture(o, s.gesture, P.art(s.art, 150), function () {
              good();
              var pad = o.stage.querySelector('.cu-pad'); if (pad && s.after) pad.querySelector('.cu-pad-art').innerHTML = P.art(s.after, 150);
              var dl = line(s.done); if (dl) { o.setSay(dl, { temp: 1900 }); if (dl.who === 'hero' && dl.en) speak(dl.en); }
              o.later(function () { k++; show(); }, dl ? 2000 : 1100);
            });
          }, 1100);
          return;
        }
        o.oops((s.wrong && s.wrong[w]) || null, s.hint, { obj: w, objFr: w });
      };
      o.expectFn = function () { var s = d.steps[k]; if (!s) return null; if (!chosen) return { kind: 'word', id: s.blank, wrong: s.options.filter(function (x) { return x !== s.blank; })[0] }; return { kind: 'gesture', g: s.gesture.kind, n: s.gesture.n }; };
      function finish() { api.setFlag('breakfast', 1); save(); closeLayer(); finishAction(qq); }
      show();
    }

    // ---- quête 8 : remettre la journée dans l'ordre, sur le canapé avec maman
    function openDay(qq) {
      var d = qq.data, c = qq.cur, o = closeup(qq, 'living_room', 'cu-day');
      var r = 0, pos = 0, order = [];
      o.kind = 'day';
      function shuffled(n) { var a = [], i; for (i = 0; i < n; i++) a.push(i); for (var t = 0; t < 8; t++) { a = E.shuffle(a, Math.random); if (a.some(function (x, j) { return x !== j; })) break; } return a; }
      function cardArt(cd) { return P.forWord(cd.en, 54) || '<span class="emoji">' + esc(cd.emoji || '⭐') + '</span>'; }
      function show() {
        var R0 = d.rounds[r];
        if (!R0) return end();
        pos = 0; order = shuffled(R0.cards.length);
        o.setSay(line({ who: 'mum', en: R0.say, fr: R0.fr }));
        render();
      }
      function render() {
        var R0 = d.rounds[r];
        o.stage.innerHTML = '<div class="cu-round"><span class="emoji">' + esc(R0.icon) + '</span><b lang="en">' + esc(R0.title.en) + '</b>' + (frHelp() !== 'never' ? '<small>' + esc(R0.title.fr) + '</small>' : '') + '</div><ol class="cu-slots">' + R0.cards.map(function (cd, i) { return '<li class="cu-slot' + (i < pos ? ' on' : '') + '"><span class="cu-slot-n">' + (i + 1) + '</span>' + (i < pos ? '<span class="cu-slot-art">' + cardArt(cd) + '</span><b lang="en">' + esc(cd.en) + '</b>' : '') + '</li>'; }).join('') + '</ol>';
        o.tray.innerHTML = '<div class="cu-picktitle">' + esc(U.orderTitle || '') + '</div><div class="cu-cards">' + order.map(function (i) { var cd = R0.cards[i]; return '<button class="cu-card' + (i < pos ? ' used' : '') + '" data-mg="card" data-id="' + i + '"' + (i < pos ? ' disabled' : '') + '><span class="cu-card-art">' + cardArt(cd) + '</span><b lang="en">' + esc(cd.en) + '</b></button>'; }).join('') + '</div>';
      }
      o.handlers.card = function (id) {
        var R0 = d.rounds[r], i = +id; if (!R0 || i < pos) return;
        if (i === pos) {
          var cd = R0.cards[i]; pos++; good(); seeWord(cd.en);
          o.setSay({ who: 'hero', en: cd.line, fr: cd.lineFr }, { temp: 2200 });
          render();
          if (pos >= R0.cards.length) { o.busy = true; o.later(function () { o.busy = false; r++; show(); }, 2300); }
          return;
        }
        var prev = pos > 0 ? R0.cards[pos - 1].en : null;
        o.oops(d.wrong, prev ? sub(d.wrongPico, { prev: prev }) : d.wrongFirst, {});
      };
      o.expectFn = function () { var R0 = d.rounds[r]; if (!R0 || o.busy) return { kind: 'wait' }; return { kind: 'card', id: String(pos), wrong: String((pos + 1) % R0.cards.length) }; };
      function end() {
        o.stage.innerHTML = '<div class="cu-night"><span class="emoji">🌙</span>' + C.heroSvg(st, { size: 150, mood: 'happy', wear: heroWear() }) + C.npcSvg('mum', { size: 170, mood: 'happy' }) + '</div>';
        o.tray.innerHTML = '';
        o.setSay(line(d.end));
        o.later(function () { o.setSay(line(d.joke)); o.later(function () { closeLayer(); finishAction(qq); }, 2600); }, 2400);
      }
      show();
    }

    // ---- le câlin : garder le doigt appuyé sur maman, puis un bisou, puis « I love you, Mum! »
    function openHug(qq) {
      var d = qq.data, c = qq.cur, o = closeup(qq, 'hallway', 'cu-hug');
      var p = 0, holding = false, phase = 'hold', raf = 0, lastT = 0, lvl = -1, hearts = 0, hugged = false;
      o.kind = 'hug';
      function figures() {
        return '<div class="cu-pair' + (hugged ? ' hugging' : '') + '" data-role="pair"><div class="cu-hugmum" data-role="mum">' + C.npcSvg('mum', { size: 300, mood: 'happy', hug: hugged }) + '<button class="cu-kiss hidden" data-mg="kiss" aria-label="Bisou"><span class="emoji">💋</span></button></div><div class="cu-hughero">' + C.heroSvg(st, { size: 200, mood: 'happy', wear: heroWear(), hug: hugged }) + '</div><div class="cu-hearts" data-role="hearts" aria-hidden="true"></div></div>';
      }
      o.stage.innerHTML = figures() + '<div class="cu-gauge" data-role="gauge"><div class="cu-gauge-h">' + [0, 1, 2, 3].map(function (i) { return '<span class="emoji" data-h="' + i + '">🤍</span>'; }).join('') + '</div><div class="cu-gauge-lbl" data-role="lvl"></div></div>';
      o.setSay(line({ who: 'mum', en: d.hold.say, fr: d.hold.fr }));
      o.setPico(d.hold.cue, 9000);
      var Q = function (r) { return o.stage.querySelector('[data-role="' + r + '"]'); };
      function heart() {
        var h = Q('hearts'); if (!h || hearts > 30) return; var b = document.createElement('i'); b.className = 'cu-heart emoji'; b.textContent = Math.random() < 0.3 ? '💖' : '❤️'; b.style.left = (25 + Math.random() * 50) + '%'; b.style.animationDuration = (1.4 + Math.random()) + 's'; h.appendChild(b); hearts++;
        setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); hearts--; }, 2400);
      }
      function setP(v) {
        p = Math.min(1, v);
        var n = Math.floor(p * 4 + 0.0001);
        Array.prototype.forEach.call(o.stage.querySelectorAll('[data-h]'), function (e, i) { e.textContent = i < n ? '❤️' : '🤍'; e.classList.toggle('on', i < n); });
        var L0 = Math.min(3, Math.floor(p * 4)); if (p > 0.02 && L0 !== lvl) { lvl = L0; Q('lvl').textContent = T(d.levels[L0] || ''); sound('tile'); }
        if (p >= 1 && phase === 'hold') kissPhase();
      }
      function loop(t) {
        raf = 0; if (cu !== o || destroyed) return;
        var dt = Math.min(0.05, (t - lastT) / 1000 || 0.016); lastT = t;
        if (holding && phase === 'hold') { setP(p + dt * 1000 / (d.hold.ms || 3000)); if (Math.random() < 0.35) heart(); S.vibrate(8); }
        raf = requestAnimationFrame(loop);
      }
      function setHug(v) {
        if (hugged === v) return; hugged = v;
        var pair = Q('pair'); if (!pair) return;
        pair.classList.toggle('hugging', v);
        pair.querySelector('.cu-hugmum').innerHTML = C.npcSvg('mum', { size: 300, mood: 'happy', hug: v }) + '<button class="cu-kiss' + (phase === 'kiss' ? '' : ' hidden') + '" data-mg="kiss" aria-label="Bisou"><span class="emoji">💋</span></button>';
        pair.querySelector('.cu-hughero').innerHTML = C.heroSvg(st, { size: 200, mood: 'happy', wear: heroWear(), hug: v });
      }
      function down(e) { if (phase !== 'hold') return; if (e && e.target && e.target.closest && e.target.closest('[data-mg]')) return; if (e && e.preventDefault) e.preventDefault(); holding = true; setHug(true); o.setPico(null); if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(loop); } }
      function upH() { holding = false; }
      var pairEl = o.stage;
      pairEl.addEventListener('pointerdown', down); window.addEventListener('pointerup', upH); window.addEventListener('pointercancel', upH);
      var keyD = function (e) { if ((e.key === ' ' || e.key === 'Enter') && phase === 'hold') { e.preventDefault(); down(); } }, keyU = function (e) { if (e.key === ' ' || e.key === 'Enter') upH(); };
      document.addEventListener('keydown', keyD); document.addEventListener('keyup', keyU);
      o.stopFns.push(function () { if (raf) cancelAnimationFrame(raf); raf = 0; window.removeEventListener('pointerup', upH); window.removeEventListener('pointercancel', upH); document.removeEventListener('keydown', keyD); document.removeEventListener('keyup', keyU); });
      function kissPhase() {
        phase = 'kiss'; holding = false; sound('fanfare');
        for (var i = 0; i < 10; i++) setTimeout(heart, i * 90);
        var kb = o.stage.querySelector('.cu-kiss'); if (kb) kb.classList.remove('hidden');
        o.setSay(line({ who: 'mum', en: d.kiss.say, fr: d.kiss.fr }));
        o.setPico(d.kiss.cue, 9000);
      }
      o.handlers.kiss = function () {
        if (phase !== 'kiss') return;
        phase = 'love'; good(); sound('spell'); var gg = o.stage.querySelector('.cu-gauge'); if (gg) gg.classList.add('hidden'); o.el.classList.add('choosing');
        var kb = o.stage.querySelector('.cu-kiss'); if (kb) { kb.classList.add('kissed'); kb.innerHTML = '<span class="emoji">😘</span>'; }
        for (var i = 0; i < 6; i++) setTimeout(heart, i * 120);
        o.setPico(null);
        o.later(function () {
          var lv = d.love;
          o.tray.innerHTML = '<div class="cu-picktitle">' + esc(T(lv.q)) + '</div><div class="cu-replies">' + lv.options.map(function (x, j) { return '<button class="cu-reply" data-mg="love" data-id="' + j + '" lang="en">' + esc(T(x.en)) + '</button>'; }).join('') + '</div>';
        }, 900);
      };
      o.handlers.love = function (id) {
        if (phase !== 'love') return;
        var x = d.love.options[+id]; if (!x) return;
        if (!x.ok) { sound('wrong'); o.setSay(line(d.love.wrong || d.wrong || { who: 'mum', en: 'Hmm?', fr: 'Hmm ?' }), { temp: 2600 }); o.setPico(x.why, 8000); return; }
        phase = 'end'; good(); o.tray.innerHTML = '';
        o.setSay({ who: 'hero', en: T(x.en) });
        for (var i = 0; i < 16; i++) setTimeout(heart, i * 70);
        o.later(function () { o.setSay(line(d.reply)); sound('crystal'); o.later(function () { closeLayer(); finishAction(qq); }, 3200); }, 1900);
      };
      o.expectFn = function () {
        if (phase === 'hold') return { kind: 'hold', ms: d.hold.ms };
        if (phase === 'kiss') return { kind: 'kiss' };
        if (phase === 'love') { var j = d.love.options.findIndex(function (x) { return x.ok; }); return o.tray.querySelector('.cu-reply') ? { kind: 'love', id: String(j), wrong: String((j + 1) % d.love.options.length) } : { kind: 'wait' }; }
        return { kind: 'wait' };
      };
      o.holdP = function () { return p; };
    }
    GAMES.routine = closeupGame(openRoutine);
    GAMES.dress_up = closeupGame(openDress);
    GAMES.recipe = closeupGame(openRecipe);
    GAMES.day_order = closeupGame(openDay);
    GAMES.big_hug = closeupGame(openHug);

    // ================================================================ « À toi de le dire » (lecteur de leçon, mode court)
    function buildPractice(step) {
      var info = S.lesson(step.lesson); if (!info) return [];
      var lesson = info.lesson, meta = function (x, l) { return Object.assign({}, x, { _unit: ch.id, _lesson: (l || lesson).id }); };
      var vocabPool = [], sentPool = [];
      (ch.lessons || []).forEach(function (l) { (l.vocab || []).forEach(function (v) { vocabPool.push(meta(v, l)); }); (l.sentences || []).forEach(function (s) { sentPool.push(meta(s, l)); }); });
      var tts = S.tts.available(), out = [];
      (step.practice || []).forEach(function (p, i) {
        var type = { image: 'select_image', meaning: 'select_meaning', listen: tts ? 'listen_word' : 'select_meaning', build: 'translate_bank', blank: 'fill_blank' }[p.t] || 'select_meaning';
        var w = p.w ? (lesson.vocab || []).filter(function (v) { return v.en === p.w; })[0] : null, s = p.s ? (lesson.sentences || []).filter(function (x) { return x.en === p.s; })[0] : null;
        if (!w && !s) return;
        var ex = null;
        try { ex = E.buildSet({ rng: Math.random, opts: { tts: tts, typing: false }, level: 1, vocab: w ? [meta(w)] : [], sentences: s ? [meta(s)] : [], vocabPool: vocabPool, sentencePool: sentPool, plan: [type], keepOrder: true })[0]; } catch (e) { ex = null; }
        if (ex) { ex.id = String(ex.id || 'ex') + '-h' + i; out.push(ex); }
      });
      return out;
    }
    function startPractice(qq) {
      if (destroyed || layerKind) return;
      var ex = buildPractice(qq.step);
      if (!ex.length) { complete(qq); return; }
      qq.cur.sub = 'practice'; save(); objective([]); api.say(null);
      var el = openLayer('practice', '');
      var session = { kind: 'lesson', banner: (U.sayIt || {}).title || 'À toi de le dire !', title: qq.step.titleEn, exercises: ex };
      player = new L.Player(session, {
        speak: function (t, slow) { S.tts.speak(t, slow ? { slow: true } : null); }, sound: sound, vibrate: S.vibrate,
        ttsAvailable: function () { return S.tts.available(); }, isNewWord: function (en) { return !st.wordStrength[en]; },
        onQuitAsk: function () { closeLayer(); objective(['npc:mum']); qq.hint = U.practiceAgain; if (U.practiceAgain) picoSay(U.practiceAgain, 7000); },
        onListenOff: function () {}, replaceListening: function (x) { return E.replaceListening(x, S.COURSE, { typing: false }); },
        onComplete: function (result) { player = null; S.bumpWords(result); qq.cur.err += result.mistakes || 0; save(); closeLayer(); complete(qq); }
      });
      player.mount(el);
      if (U.sayIt && U.sayIt.sub) { var b = el.querySelector('.lesson-banner'); if (b) b.setAttribute('title', U.sayIt.sub); }
    }

    // ================================================================ quête cochée
    var doneNext = null;
    function questCard(step, res, stars, wasReplay, done) {
      var cards = res.cards || [], outro = line(step.outro), SC = window.Screens;
      openLayer('done', '<div class="qd"><canvas class="confetti" aria-hidden="true"></canvas><div class="qd-card">' +
        '<div class="qd-kicker">' + esc(T(step.kicker || U.questDone || '')) + '</div>' +
        '<div class="qd-row"><span class="qd-check" aria-hidden="true">✔</span><span class="emoji qd-ico">' + esc(step.emoji || '') + '</span><span class="grow"><b lang="en">' + esc(step.titleEn) + '</b>' + (frHelp() !== 'never' ? '<small>' + esc(step.title) + '</small>' : '') + '</span></div>' +
        UI.stars(stars, 'big') + '<p class="qd-sub">' + esc((U.stars || [])[stars] || '') + '</p>' +
        (outro ? bubble(outro) : '') +
        (cards.length ? '<div class="loots">' + cards.map(SC.rewardCard).join('') + '</div>' : '') +
        (wasReplay ? '<p class="qd-note">' + esc(U.questReplay || '') + '</p>' : '') +
        '</div><div class="qd-foot"><button class="btn btn-gold btn-lg btn-block" data-mg="done-next">' + esc(U.continue || 'Continuer') + '</button></div></div>');
      doneNext = function () { closeLayer(); done(); };
      sound('fanfare'); if (outro && outro.en) later(function () { if (layerKind === 'done') speak(outro.en); }, 700);
      var cv = layerEl.querySelector('canvas.confetti'), stopC = cv && !FX.reduced() ? UI.confetti(cv, { count: 90 }) : null;
      if (stopC) cu = { stop: stopC, kind: 'done' };
      Array.prototype.forEach.call(layerEl.querySelectorAll('[data-count]'), function (e, i) { FX.countUp(e, parseInt(e.getAttribute('data-count'), 10), { ms: 700, delay: 300 + i * 150 }); });
    }

    // ================================================================ la liste de maman (parchemin à cocher)
    function showList() {
      if (layerKind || destroyed) return;
      var n = nextI(), rows = '', hq = U.hiddenQuest || {};
      var trig = steps.some(function (s, i) { return s.trigger && S.stepState(ch.id, i).done; });
      steps.forEach(function (s, i) {
        if (s.type !== 'minigame') return;
        var ss = S.stepState(ch.id, i), active = hs.cur && hs.cur.i === i;
        var hidden = s.game === 'big_hug' && !ss.done && !trig && !active;
        var state = ss.done ? 'done' : (active || n === i) ? 'now' : 'locked';
        var en = hidden ? hq.en : s.titleEn, fr = hidden ? hq.fr : s.title;
        rows += '<li class="ql ' + state + '"><span class="ql-box" aria-hidden="true">' + (ss.done ? '✔' : '') + '</span><span class="emoji ql-ico">' + (hidden ? '❓' : esc(s.emoji || '')) + '</span><span class="grow"><b lang="en">' + esc(en) + '</b>' + (frHelp() !== 'never' ? '<small class="ql-fr' + (frHelp() === 'always' || hidden ? '' : ' hidden') + '">' + esc(fr) + '</small>' : '') + '</span>' +
          (hidden ? '' : '<button class="ql-say" data-mg="speak" data-text="' + esc(en) + '" aria-label="' + esc(U.listen || 'Écouter') + '">' + SPEAKER + '</button>') +
          (ss.done ? '<span class="ql-end">' + UI.stars(ss.stars, 'mini') + '<button class="ql-replay" data-mg="replay" data-id="' + i + '">' + esc(U.replay || 'Rejouer') + '</button></span>' : state === 'now' ? '<span class="ql-now">' + esc(U.now || '') + '</span>' : '<span class="ql-lock emoji" aria-label="' + esc(U.locked || '') + '">🔒</span>') + '</li>';
      });
      var qs = U.quests || {};
      listEl.innerHTML = '<div class="ql-card" role="dialog" aria-label="' + esc(qs.fr || '') + '"><div class="ql-head"><span class="emoji ql-scroll">📜</span><div class="grow"><h2 lang="en">' + esc(qs.en || '') + '</h2>' + (frHelp() !== 'never' ? '<small>' + esc(qs.fr || '') + '</small>' : '') + '</div>' +
        (frHelp() === 'tap' ? '<button class="ql-tool" data-mg="list-fr" aria-label="' + esc(U.frBtn || 'Traduction') + '"><span class="emoji">🇫🇷</span></button>' : '') +
        '<button class="ql-tool ql-x" data-mg="list-close" aria-label="' + esc(U.close || 'Fermer') + '"><svg viewBox="0 0 28 28" aria-hidden="true"><path d="M7 7l14 14M21 7 7 21" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/></svg></button></div><ol class="ql-rows">' + rows + '</ol></div>';
      listEl.className = 'mg-list on'; api.pause(); sound('page');
      if (FX && FX.once) FX.once(listEl.firstChild, 'w-pop', 400);
    }
    function hideList() { if (!listEl.classList.contains('on')) return; listEl.className = 'mg-list hidden'; listEl.innerHTML = ''; if (!layerKind && !destroyed) api.resume(); }
    function meter(m) {
      if (!m) { meterEl.className = 'mg-meter hidden'; meterEl.innerHTML = ''; return; }
      meterEl.className = 'mg-meter';
      meterEl.innerHTML = '<span class="emoji">🤢</span><span class="mt-bar"><i style="width:' + Math.round(m.pct * 100) + '%"></i></span><span class="emoji">✨</span><small lang="en">' + esc(m.en || '') + '</small>';
    }
    function abortCloseup() {
      var qq = cu && cu.qq; closeLayer();
      if (qq && q === qq) { var d = qq.data; if (d.at) { objective(d.at.slice(Math.floor(d.at.length / 2), Math.floor(d.at.length / 2) + 1)); qq.hint = d.atHint; } else { objective(['npc:mum']); } }
    }
    hroot.addEventListener('click', function (e) {
      if (e.target === listEl) { hideList(); return; }
      var a = e.target.closest('[data-mg]'); if (!a) return;
      var act = a.getAttribute('data-mg'), id = a.getAttribute('data-id');
      if (act === 'speak') { e.stopPropagation(); speak(a.getAttribute('data-text')); a.classList.add('playing'); setTimeout(function () { a.classList.remove('playing'); }, 600); return; }
      if (act === 'fr') { var bb = a.closest('.cu-bub'), f = bb && bb.querySelector('[data-role="fr"]'); if (f) f.classList.toggle('hidden'); markFr(); return; }
      if (act === 'list-fr') { Array.prototype.forEach.call(listEl.querySelectorAll('.ql-fr'), function (x) { x.classList.toggle('hidden'); }); markFr(); return; }
      if (act === 'list-close') { hideList(); return; }
      if (act === 'replay') { replay(+id); return; }
      if (act === 'pico-close') { a.classList.add('hidden'); return; }
      if (act === 'done-next') { if (doneNext) { var f2 = doneNext; doneNext = null; sound('click'); f2(); } return; }
      if (act === 'close') { sound('click'); abortCloseup(); return; }
      if (cu && cu.handlers && cu.handlers[act]) cu.handlers[act](id);
    });
    function markFr() { if (!st.flags.frSeen) { st.flags.frSeen = true; save(); } }

    // ================================================================ état et aides de test
    var menuWant = null;
    function homeState() {
      var c = hs.cur;
      return { next: nextI(), quest: c && steps[c.i] ? { i: c.i, id: steps[c.i].id, game: steps[c.i].game, sub: c.sub, k: c.k, err: c.err, replay: !!c.replay } : null,
        pending: pending ? { type: pending.type, i: pending.i, id: steps[pending.i].id } : null, layer: layerKind, closeup: cu ? cu.kind : null, list: listEl.classList.contains('on'),
        words: Object.keys(hs.words).length, flags: Object.assign({}, hs.flags), carry: api.hero.carry, wear: api.hero.extra, lastMistake: lastMistake };
    }
    function expect() {
      if (destroyed) return null;
      if (listEl.classList.contains('on')) return { kind: 'list' };
      if (layerKind === 'done') return { kind: 'done' };
      if (layerKind === 'practice') return { kind: 'practice' };
      if (layerKind === 'cu' && cu && cu.expectFn) return cu.expectFn() || { kind: 'wait' };
      if (layerKind) return { kind: 'wait' };
      var w = api.state();
      if (w.talking) return { kind: 'talk' };
      if (w.menu) return menuWant ? { kind: 'menu', id: menuWant.id, wrong: menuWant.wrong } : { kind: 'menu', id: w.menu[0] };
      if (api.hero.hidden) return { kind: 'a' };
      if (w.locked) return { kind: 'wait' };
      if (q && q.busy) return { kind: 'wait' };
      if (w.objective.length) return { kind: 'goto', id: w.objective[0], all: w.objective.slice() };
      return { kind: 'wait' };
    }
    function wrong() {
      var e = expect(); if (!e) return null;
      if (e.wrong !== undefined) return { kind: e.kind, id: e.wrong };
      if (q && q.wrongFn) return q.wrongFn();
      return null;
    }

    // ================================================================ ouverture du monde
    api = window.World.open(worldEl, {
      def: def, save: hs,
      ui: { back: U.back, aLabel: U.action, talk: (U.verbs || {}).talk, look: (U.verbs || {}).look, frLabel: U.frBtn, listen: U.listen },
      hero: { sprite: function (f, s, extra) { return C.heroSvg(st, { size: 200, facing: f, step: s, wear: extra === 'dressed' ? 'dressed' : 'pyjamas', mood: 'happy' }); } },
      portraits: { mum: function () { return portrait('mum'); }, pico: function () { return portrait('pico'); }, hero: function () { return portrait('hero'); }, narrator: function () { return portrait('narrator'); } },
      names: { mum: (C.npc('mum') || {}).name || 'Mum', pico: 'Pico', hero: st.hero.name || '', narrator: '' },
      spriteCtx: function () { return { skin: C.SKIN[st.hero.skin], hairC: C.HAIR[st.hero.hairColor] }; },
      hooks: {
        speak: speak, stopSpeak: function () { S.tts.stop(); }, sound: sound, vibrate: S.vibrate,
        frHelp: frHelp, reduced: function () { return FX.reduced(); }, persist: save, flush: function () { S.flush(); },
        onBack: function () { ctx.exit(); }, onList: showList, onWord: seeWord, onFr: markFr
      },
      director: director
    });

    var session = {
      get api() { return api; }, get layer() { return layerKind; }, get closeup() { return cu; }, get player() { return player; },
      state: homeState, expect: expect, wrong: wrong, refresh: refresh, replay: replay, showList: showList, hideList: hideList, startPractice: function () { if (q) startPractice(q); },
      destroy: function () {
        if (destroyed) return;
        destroyed = true; timers.forEach(clearTimeout); timers = []; clearInterval(ringT);
        if (cu && cu.stop) try { cu.stop(); } catch (e) { /* ignore */ }
        cu = null; if (player) try { player.destroy(); } catch (e2) { /* ignore */ } player = null;
        try { api.destroy(); } catch (e3) { /* ignore */ }
        S.tts.stop(); save();
        if (cur === session) cur = null;
      }
    };
    cur = session;
    return session;
  }

  window.MiniGames = {
    open: open,
    get current() { return cur; },
    state: function () { return cur ? cur.state() : null; },
    debug: {
      expect: function () { return cur ? cur.expect() : null; },
      wrong: function () { return cur ? cur.wrong() : null; },
      holdProgress: function () { return cur && cur.closeup && cur.closeup.holdP ? cur.closeup.holdP() : null; }
    }
  };
})();
