/* Echoria — main.js : routage (#map, #hero, #grimoire, #shop, #training), enchaînement des étapes
   (scène → leçon → dialogue → combat → récompenses), actions de l'interface, démarrage.
   Expose window.Echoria pour les tests. */
(function () {
  'use strict';
  var E = window.Engine, UI = window.UI, C = window.Chars, S = window.Store, SC = window.Screens, L = window.Lesson, ST = window.Story, FX = window.FX;
  var esc = UI.esc, T = ST.T;
  var TAB_IDS = ['map', 'hero', 'grimoire', 'shop', 'training'];
  var $ = function (id) { return document.getElementById(id); };
  var ui = { tab: 'map', grimSub: 'words', grimQ: '', chapter: null, creator: null, overlayType: null, settingsFrom: null };
  var current = null;      // étape ou séance en cours : { kind, chId, i, step, ch, player, handle, ... } ; kind 'home' = la maison explorable (niveau 1)
  var home = null;         // session MiniGames de la maison
  var queue = [];          // écrans de bilan à enchaîner
  var queueDone = null, stopConfetti = null, listenOff = false;
  var guardUntil = 0;      // anti double appui : juste après un changement d'écran, on ignore « Continuer » et le lancement d'une étape
  function guard(ms) { guardUntil = Date.now() + (ms || 300); }
  function st() { return S.state; }

  // ---------------------------------------------------------------- réglages d'affichage
  function applySettings() {
    var cl = document.documentElement.classList, s = st().settings;
    cl.toggle('rm', !!s.reducedMotion); cl.toggle('ts-l', s.textSize === 'l'); cl.toggle('ts-xl', s.textSize === 'xl');
  }

  // ---------------------------------------------------------------- routage par onglets
  function tabFromHash() { var h = String(location.hash || '').replace('#', ''); return TAB_IDS.indexOf(h) >= 0 ? h : 'map'; }
  function go(tab) {
    if (TAB_IDS.indexOf(tab) < 0) tab = 'map';
    var changed = ui.tab !== tab; ui.tab = tab;
    if (changed) UI.clearToasts();
    try { if (location.hash !== '#' + tab) location.hash = tab; } catch (e) { /* cadre sandboxé */ }
    render(changed || tab === 'map');
  }
  function render(resetScroll) {
    applySettings();
    var v = $('view'), tab = ui.tab;
    $('top').innerHTML = SC.hud(tab);
    $('nav').innerHTML = SC.nav(tab);
    v.className = 'view view-' + tab;
    if (tab === 'map') v.innerHTML = SC.map();
    else if (tab === 'hero') v.innerHTML = SC.hero();
    else if (tab === 'grimoire') v.innerHTML = SC.grimoire(ui.grimSub, ui.grimQ);
    else if (tab === 'shop') v.innerHTML = SC.shop();
    else v.innerHTML = SC.training();
    if (resetScroll) { if (tab === 'map') scrollMap(); else v.scrollTop = 0; }
  }
  function scrollMap() {
    var v = $('view'), node = v.querySelector('.map-node.current') || v.querySelector('.map-node.open'), done = v.querySelectorAll('.map-node.done');
    if (!node && done.length) node = done[done.length - 1];
    if (!node) { v.scrollTop = v.scrollHeight; return; }
    var wrap = node.parentNode;
    v.scrollTop = Math.max(0, wrap.offsetTop - v.clientHeight * 0.58);
  }

  // ---------------------------------------------------------------- overlay plein écran
  function openOverlay(html, cls, type) {
    var o = $('overlay');
    if (stopConfetti) { stopConfetti(); stopConfetti = null; }
    if (ui.overlayType !== (type || cls || 'page')) UI.clearToasts(); // un message ne doit pas survivre à l'écran qui l'a fait naître
    o.className = 'active ' + (cls || ''); o.innerHTML = html; o.scrollTop = 0; ui.overlayType = type || cls || 'page';
    document.body.classList.add('has-overlay');
    return o;
  }
  function closeOverlay() {
    var o = $('overlay');
    if (stopConfetti) { stopConfetti(); stopConfetti = null; }
    if (ui.overlayType) UI.clearToasts();
    o.className = ''; o.innerHTML = ''; ui.overlayType = null;
    document.body.classList.remove('has-overlay');
  }

  // ---------------------------------------------------------------- titre & création du héros
  function showTitle() { openOverlay(SC.title(), 'ov-stage', 'title'); }
  function showCreator() {
    var h = st().hero;
    ui.creator = { name: h.created ? h.name : '', gender: h.gender, skin: h.skin, hair: h.hair, hairColor: h.hairColor, outfit: h.outfit };
    openOverlay(SC.creator(ui.creator), 'ov-page', 'creator');
  }
  function creatorSet(k, v) {
    var o = $('overlay'), d = ui.creator; if (!d) return;
    var inp = o.querySelector('[data-role="cr-name"]'); if (inp) d.name = inp.value;
    d[k] = v;
    var form = o.querySelector('.creator-form'), sc = form ? form.scrollTop : 0, osc = o.scrollTop;
    o.innerHTML = SC.creator(d);
    form = o.querySelector('.creator-form'); if (form) form.scrollTop = sc; o.scrollTop = osc;
    S.sound.play('click');
  }
  function creatorDone() {
    var o = $('overlay'), d = ui.creator, inp = o.querySelector('[data-role="cr-name"]'); if (!d) return;
    var name = (inp ? inp.value : d.name || '').replace(/[{}<>]/g, '').trim().slice(0, 16);
    if (!name) { if (inp) { inp.classList.add('need'); try { inp.focus(); } catch (e) { /* ignore */ } } UI.toast('Écris ton prénom pour commencer ✍️', 'warn'); return; }
    var h = st().hero;
    h.name = name; h.gender = d.gender; h.skin = d.skin; h.hair = d.hair; h.hairColor = d.hairColor; h.outfit = d.outfit; h.created = true; h.createdAt = Date.now();
    ui.creator = null;
    S.save(); S.flush(); S.sound.play('unlock');
    closeOverlay(); go('map');
    var first = S.CHAPTERS[0];
    if (first && S.nextStepIndex(first.id) === 0) startStep(first.id, 0);
  }

  // ---------------------------------------------------------------- chapitre & étapes
  function openChapter(chId) {
    var ch = S.chapter(chId);
    if (!ch) { UI.toast('Ce chapitre arrive bientôt ! ⏳', 'warn'); return false; }
    if (S.isHome(chId)) { openHome(chId, null); return true; }
    if (!S.isChapterUnlocked(chId)) {
      var ri = S.regionIndexOfChapter(chId);
      UI.toast(S.isRegionUnlocked(ri) ? '🔒 Termine d\'abord le chapitre précédent.' : '🔒 Cette région est encore dans le brouillard.', 'warn');
      return false;
    }
    ui.chapter = chId; st().lastChapter = chId;
    openOverlay(SC.chapter(chId), 'ov-page', 'chapter');
    if (S.nextStepIndex(chId) >= 3) { var sec = $('overlay').querySelector('.steps'); if (sec) $('overlay').scrollTop = Math.max(0, sec.offsetTop - 70); }
    return true;
  }
  function startStep(chId, i) {
    var ch = S.chapter(chId), step = ch && ch.steps[i];
    if (!step) return null;
    if (S.isHome(chId)) { if (!S.isStepUnlocked(chId, i)) { UI.toast('🔒 Termine d\'abord les quêtes précédentes.', 'warn'); return null; } return openHome(chId, i); }
    if (!S.isStepUnlocked(chId, i)) { UI.toast('🔒 Termine d\'abord les étapes précédentes.', 'warn'); return null; }
    UI.clearToasts(); UI.closeModal();
    ui.chapter = chId;
    current = { kind: step.type, chId: chId, i: i, step: step, ch: ch, replay: S.stepState(chId, i).done };
    if (step.type === 'scene') runScene();
    else if (step.type === 'lesson') showLessonIntro();
    else if (step.type === 'dialogue') runDialogue();
    else runCombat();
    return current;
  }
  function askQuit() {
    UI.showModal({ pico: { mood: 'sad' }, title: 'Tu veux t\'arrêter ?', text: 'Cette étape ne sera pas enregistrée. Tu pourras la reprendre quand tu veux.', actions: [{ label: 'Je continue', cls: 'btn-green', act: 'close-modal' }, { label: 'Quitter', cls: 'btn-parch', act: 'quit-confirm' }] });
  }
  // ---------------------------------------------------------------- niveau 1 : la maison explorable (world.js + minigames.js)
  // L'écran du chapitre c0 EST la maison : on y revient où on en était. startI : étape à lancer (ou quête à rejouer).
  function openHome(chId, startI) {
    var ch = S.chapter(chId);
    if (!ch || !window.MiniGames || !window.World) { UI.toast('La maison n\'est pas disponible.', 'warn'); return null; }
    UI.clearToasts(); UI.closeModal(); S.tts.stop();
    if (home) { try { home.destroy(); } catch (e) { /* ignore */ } home = null; }
    ui.chapter = chId; st().lastChapter = chId;
    var cur = current = { kind: 'home', chId: chId, i: -1, ch: ch };
    var o = openOverlay('', 'ov-home', 'home');
    home = window.MiniGames.open(o, {
      ch: ch, start: typeof startI === 'number' ? startI : null,
      complete: function (i, result) { return S.completeStep(chId, i, result); },
      finale: function (res, ending) { homeFinale(cur, res || { cards: [] }, ending || {}); },
      exit: function () { closeHome(); }
    });
    cur.home = home;
    S.save();
    return cur;
  }
  function closeHome() {
    if (home) { try { home.destroy(); } catch (e) { /* ignore */ } home = null; }
    if (current && current.kind === 'home') current = null;
    S.save(); closeOverlay(); render(); guard(400);
  }
  function homeFinale(cur, res, ending) {
    if (home) { try { home.destroy(); } catch (e) { /* ignore */ } home = null; }
    if (current === cur) current = null;
    var cards = res.cards || [], screens = [];
    screens.push(function () { S.sound.play('unlock'); openOverlay(SC.result({ cls: 'scene-reward home-reward', art: '<div class="cd-art">' + C.npcSvg('mum', { size: 120, mood: 'happy' }) + C.heroSvg(st(), { size: 120, mood: 'happy' }) + '</div>', kicker: esc(T(ending.kicker || '')), title: rewardTitle(cards), cards: cards.filter(function (c) { return c.kind !== 'gold'; }), confetti: true }), 'ov-page', 'result'); });
    if (res.chapterDone) screens.push(function () { S.sound.play('fanfare'); openOverlay(SC.chapterDone(cur.ch), 'ov-page', 'chapter-done'); });
    if (cards.some(function (c) { return c.kind === 'level'; })) setTimeout(function () { S.sound.play('levelup'); }, 500);
    showQueue(screens, function () {
      closeOverlay(); go('map'); guard(700);
      var next = S.CHAPTERS.filter(function (c) { return !S.isHome(c.id); })[0];
      if (res.chapterDone && next && S.isChapterUnlocked(next.id)) UI.toast('🔓 Nouveau : ' + esc(next.title) + ' !', 'ok', 3200);
    });
  }

  function abortCurrent() {
    var cur = current; current = null; queue = [];
    S.tts.stop(); UI.closeModal();
    if (cur && cur.kind === 'home') { current = cur; closeHome(); return; }
    if (cur) {
      try { if (cur.player && cur.player.destroy) cur.player.destroy(); } catch (e) { /* ignore */ }
      try { if (cur.handle && cur.handle.destroy) cur.handle.destroy(); } catch (e2) { /* ignore */ }
    }
    var root = $('combat-root'); root.className = ''; root.innerHTML = '';
    S.save();
    if (cur && cur.kind === 'training') { closeOverlay(); render(); }
    else if (ui.chapter && S.chapter(ui.chapter) && S.isChapterUnlocked(ui.chapter)) { render(); openChapter(ui.chapter); }
    else { closeOverlay(); render(); }
  }

  // ---- scène
  function runScene() {
    var cur = current, p = new ST.Scene(cur.step, { chapter: cur.ch, onDone: function () { finishStep(cur, { stars: 0 }); }, onQuit: askQuit });
    cur.player = p; openOverlay('', 'ov-stage', 'scene'); p.mount($('overlay'));
  }
  // ---- dialogue
  function runDialogue() {
    var cur = current, d = new ST.Dialogue(cur.step, { chapter: cur.ch, onDone: function (r) { finishStep(cur, r); }, onQuit: askQuit });
    cur.player = d; openOverlay('', 'ov-stage', 'dialogue'); d.mount($('overlay'));
  }
  // ---- leçon (lecteur de Parlo)
  function lessonHooks(cur, onComplete) {
    return {
      speak: function (t, slow) { S.tts.speak(t, slow ? { slow: true } : null); }, sound: function (n) { S.sound.play(n); }, vibrate: S.vibrate,
      ttsAvailable: function () { return S.tts.available() && !listenOff; }, isNewWord: function (en) { return !st().wordStrength[en]; },
      onQuitAsk: askQuit,
      onListenOff: function () { listenOff = true; UI.toast('D\'accord : plus d\'exercices d\'écoute pour cette fois.', ''); },
      replaceListening: function (ex) { return E.replaceListening(ex, S.COURSE, { typing: S.typingOn(cur.chId || S.currentChapterId()) }); },
      onComplete: onComplete
    };
  }
  function showLessonIntro() {
    var cur = current, info = S.lesson(cur.step.lesson);
    if (!info) { UI.toast('Leçon introuvable.', 'warn'); current = null; return; }
    openOverlay(SC.lessonIntro(cur.ch, info.lesson, cur.replay), 'ov-page', 'lesson-intro');
  }
  function runLesson() {
    var cur = current; if (!cur || cur.kind !== 'lesson') return null;
    var info = S.lesson(cur.step.lesson), exercises = S.lessonExercises(cur.step.lesson);
    if (!exercises.length) { UI.toast('Pas d\'exercice disponible pour le moment.', 'warn'); return null; }
    var session = { kind: 'lesson', lessonId: cur.step.lesson, title: info.lesson.title, exercises: exercises };
    var player = new L.Player(session, lessonHooks(cur, function (result) {
      var newWords = S.bumpWords(result);
      finishStep(cur, { stars: L.starsFor(result.mistakes), lesson: result, newWords: newWords });
    }));
    cur.player = player; openOverlay('', 'ov-lesson', 'lesson'); player.mount($('overlay'));
    return player;
  }

  // ---------------------------------------------------------------- combat
  function round1(n) { return Math.round(n * 10) / 10; }
  // Construit l'objet opts de Combat.start (SPEC §6) à partir de l'état.
  function combatOpts(cur) {
    var s = st(), step = cur.step, hs = S.heroStats(), w = S.item(s.equip.weapon) || S.item('stick') || { id: 'stick', name: 'Stick', atk: 6, reach: 46, wkind: 'staff' };
    var key = S.stepKey(cur.chId, cur.i);
    return {
      arena: step.arena, intro: T(step.intro || ''), waves: step.waves || [], boss: step.boss || null,
      hero: {
        name: s.hero.name || 'Wordkeeper', svg: C.heroSvg(s, { size: 200 }), maxHp: hs.maxHp, hp: hs.maxHp, atk: hs.atk, speed: hs.speed,
        weapon: { id: w.id, name: w.name, atk: w.atk, reach: w.reach, kind: w.wkind || 'sword', bonus: w.bonus || null },
        dashCd: hs.dashCd, level: hs.level, baseAtk: hs.baseAtk, regen: hs.regen, attackSpeed: hs.attackSpeed, slowOnHit: hs.slowOnHit
      },
      pet: { svg: C.picoSvg({ size: 200 }), rate: hs.petRate },
      spells: s.spellsEquipped.map(function (id) { var sp = S.spell(id); return { id: sp.id, name: sp.name, fr: sp.fr, emoji: sp.emoji, cooldown: round1(sp.cooldown * hs.cdMul), power: 1, effect: sp.effect }; }),
      potions: s.potions,
      quiz: S.makeQuiz(cur.chId),
      onQuiz: function (q, correct) { S.onQuiz(q, correct); },
      difficulty: (s.flags.easy || cur.easy) ? 0.7 : 1,
      sound: function (name) { S.sound.play(name); }, vibrate: function (ms) { S.vibrate(ms); }, speak: function (text) { S.tts.speak(text); },
      reducedMotion: FX.reduced(),
      tutorial: !s.flags.combatTuto,   // mini-tutoriel illustré au tout premier combat (rejouable depuis les réglages)
      onTutorial: function () { st().flags.combatTuto = true; S.save(); },
      onEnd: function (r) { combatEnd(cur, r, key); }
    };
  }
  function runCombat() {
    var cur = current, s = st(), step = cur.step;
    (step.waves || []).forEach(function (wv) { (wv || []).forEach(function (g) { if (g && g.enemy && s.bestiary.indexOf(g.enemy) < 0) s.bestiary.push(g.enemy); }); });
    if (step.boss && s.bestiary.indexOf(step.boss) < 0) s.bestiary.push(step.boss);
    var opts = combatOpts(cur), root = $('combat-root'), handle = null;
    cur.opts = opts; cur.ended = false; cur.sim = false;
    S.tts.stop(); closeOverlay();
    root.innerHTML = ''; root.className = 'active'; document.body.classList.add('has-overlay');
    var engine = !api.forceSim && window.Combat && typeof window.Combat.start === 'function' ? window.Combat : null;
    if (engine) { try { handle = engine.start(root, opts); } catch (e) { handle = null; root.innerHTML = ''; if (window.console && console.warn) console.warn('Echoria : moteur de combat indisponible, simulateur de secours.', e); } }
    if (!handle) { cur.sim = true; handle = CombatSim.start(root, opts); }
    cur.handle = handle;
    S.save();
  }
  function combatEnd(cur, r, key) {
    if (current !== cur || cur.ended) return;
    cur.ended = true; r = r || {};
    var s = st(), root = $('combat-root'), handle = cur.handle;
    root.className = ''; document.body.classList.remove('has-overlay');
    setTimeout(function () { try { if (handle && handle.destroy) handle.destroy(); } catch (e) { /* ignore */ } if (!current || current.handle === handle) root.innerHTML = ''; }, 0);
    var tries = Math.max(0, Math.round(+r.tries || 0)); // défaites encaissées dans le moteur avant ce résultat
    if (r.win) {
      s.potions -= E.clamp(Math.round(+r.potionsUsed || 0), 0, s.potions); // une défaite ne coûte rien, pas même les potions
      s.stats.combatsLost += tries; delete s.losses[key];
      finishStep(cur, { stars: E.clamp(Math.round(+r.stars || 1), 1, 3), combat: r }); return;
    }
    if (r.quit) { s.stats.combatsLost += tries; S.save(); abortCurrent(); return; } // « Quitter » choisi dans le moteur : retour au chapitre
    s.stats.combatsLost++; s.losses[key] = (s.losses[key] || 0) + 1; S.save();
    var many = s.losses[key] >= 2 && !s.flags.easy;
    openOverlay('<div class="page result defeat"><div class="result-body"><div class="cd-art">' + C.pico({ size: 120, mood: 'sad' }) + '</div><div class="res-kicker">Combat</div><h1>Pas cette fois…</h1><p class="res-sub">Tu ne perds rien : ni or, ni objets. Respire, et retente ta chance !' + (many ? ' Tu peux aussi essayer le <b>mode facile</b>.' : '') + '</p><div class="tip-line"><span class="emoji">💡</span> Roule pour esquiver quand le sol devient rouge, et garde tes sorts pour les groupes.</div></div><div class="page-foot col"><button class="btn btn-gold btn-lg btn-block" data-act="combat-retry">Réessayer</button>' + (many ? '<button class="btn btn-green btn-block" data-act="combat-retry-easy">Réessayer en mode facile</button>' : '') + '<button class="btn btn-parch btn-block" data-act="quit-confirm">Retour au chapitre</button></div></div>', 'ov-page', 'defeat');
    S.sound.play('wrong');
  }
  function retryCombat(easy) {
    var cur = current; if (!cur || cur.kind !== 'combat') return;
    current = { kind: 'combat', chId: cur.chId, i: cur.i, step: cur.step, ch: cur.ch, replay: cur.replay, easy: !!easy || cur.easy };
    runCombat();
  }
  // Simulateur de secours : 3 questions quiz() puis onEnd. Sert tant que window.Combat n'existe pas (ou s'il plante au démarrage).
  var CombatSim = {
    start: function (container, opts) {
      var n = 0, ok = 0, TOTAL = 3, done = false, t0 = Date.now(), q = null, timer = null, locked = false;
      var foes = []; (opts.waves || []).forEach(function (w) { (w || []).forEach(function (g) { if (foes.indexOf(g.enemy) < 0) foes.push(g.enemy); }); }); if (opts.boss) foes.push(opts.boss);
      var kills = 0; (opts.waves || []).forEach(function (w) { (w || []).forEach(function (g) { kills += g.n || 1; }); }); if (opts.boss) kills++;
      container.innerHTML = '<div class="sim"><div class="stage-bg">' + C.backdrop(opts.arena) + '</div><div class="sim-card"><div class="sim-tag">Combat simulé</div><div class="sim-vs"><div class="sim-hero">' + opts.hero.svg + '</div><span class="emoji">⚔️</span><div class="sim-foes">' + foes.slice(0, 3).map(function (f) { return C.enemySvg(f, 84); }).join('') + '</div></div><p class="sim-intro">' + esc(opts.intro || '') + '</p><div class="sim-prog" data-role="prog"></div><div class="sim-q" data-role="q"></div></div></div>';
      var qEl = container.querySelector('[data-role="q"]'), pEl = container.querySelector('[data-role="prog"]');
      function ask() {
        if (done) return;
        if (n >= TOTAL) return end(ok >= 2);
        q = opts.quiz(); locked = false;
        pEl.innerHTML = 'Rune de Mot ' + (n + 1) + ' / ' + TOTAL + (ok ? ' · ' + '✨'.repeat(ok) : '');
        qEl.innerHTML = '<div class="sim-prompt">' + (q.hint ? '<span class="emoji">' + esc(q.hint) + '</span> ' : '') + esc(q.prompt) + (q.sub ? '<small>' + esc(q.sub) + '</small>' : '') + '</div><div class="sim-opts">' + q.options.map(function (o, i) { return '<button class="btn btn-parch btn-block sim-opt" data-sim="' + i + '" lang="en">' + esc(o) + '</button>'; }).join('') + '</div>';
      }
      function answer(i) {
        if (done || locked || !q) return;
        locked = true; n++;
        var correct = i === q.answer, btns = qEl.querySelectorAll('[data-sim]');
        if (btns[q.answer]) btns[q.answer].classList.add('correct'); if (!correct && btns[i]) btns[i].classList.add('wrong');
        if (correct) { ok++; opts.sound('spell'); if (q.say) opts.speak(q.say); } else opts.sound('wrong');
        try { opts.onQuiz(q, correct); } catch (e) { /* ignore */ }
        timer = setTimeout(ask, opts.reducedMotion ? 250 : 650);
      }
      function end(win) {
        if (done) return; done = true; clearTimeout(timer);
        opts.onEnd({ win: !!win, hpLeft: win ? Math.round(opts.hero.maxHp * (0.4 + 0.2 * ok)) : 0, maxHp: opts.hero.maxHp, time: Math.round((Date.now() - t0) / 1000), kills: win ? kills : 0, quizOk: ok, quizTotal: n, potionsUsed: 0, stars: ok >= 3 ? 3 : ok === 2 ? 2 : 1, simulated: true });
      }
      var clickH = function (e) { var b = e.target.closest('[data-sim]'); if (b) answer(parseInt(b.getAttribute('data-sim'), 10)); };
      container.addEventListener('click', clickH);
      ask();
      return {
        destroy: function () { done = true; clearTimeout(timer); container.removeEventListener('click', clickH); }, pause: function () {}, resume: function () {},
        debugWin: function () { ok = Math.max(ok, 3); end(true); }, debugLose: function () { end(false); },
        answer: answer, get quiz() { return q; },
        get state() { return { simulated: true, asked: n, ok: ok, done: done }; }
      };
    }
  };

  // ---------------------------------------------------------------- fin d'étape : récompenses & bilans
  function showQueue(screens, done) { queue = screens.slice(); queueDone = done; nextResult(); }
  function nextResult() {
    var fn = queue.shift();
    if (!fn) { var d = queueDone; queueDone = null; if (stopConfetti) { stopConfetti(); stopConfetti = null; } if (d) d(); return; }
    fn(); guard(300);
    var o = $('overlay'), canvas = o.querySelector('canvas.confetti');
    if (canvas) stopConfetti = UI.confetti(canvas, { count: 120 });
    Array.prototype.forEach.call(o.querySelectorAll('[data-count]'), function (el, i) { FX.countUp(el, parseInt(el.getAttribute('data-count'), 10), { ms: 700, delay: 300 + i * 150 }); });
  }
  function showEnding() { st().flags.ended = true; S.save(); S.sound.play('crystal'); openOverlay(SC.ending(), 'ov-page', 'ending'); }
  function rewardTitle(cards) {
    var sp = cards.filter(function (c) { return c.kind === 'spell'; })[0], it = cards.filter(function (c) { return c.kind === 'item'; })[0];
    if (sp) return 'Nouveau sort : <span lang="en">' + esc(sp.spell.name) + '</span> ' + esc(sp.spell.emoji);
    if (it) return 'Objet obtenu : ' + esc(it.item.fr) + ' ' + esc(it.item.emoji);
    return 'Bravo !';
  }
  function finishStep(cur, result) {
    if (current !== cur) return;
    current = null;
    var res = S.completeStep(cur.chId, cur.i, result), cards = res.cards, screens = [], kind = cur.kind;
    var special = cards.filter(function (c) { return c.kind === 'spell' || c.kind === 'item' || c.kind === 'crystal' || c.kind === 'level' || c.kind === 'potion'; });
    var equipMsg = cards.filter(function (c) { return c.kind === 'item' && c.equipped; }).map(function (c) { return c.item.fr; });
    if (kind === 'scene') {
      if (special.length) screens.push(function () { S.sound.play('unlock'); openOverlay(SC.result({ cls: 'scene-reward', art: '<div class="cd-art">' + C.pico({ size: 120, mood: 'party', cls: 'party' }) + '</div>', kicker: 'Scène terminée', title: rewardTitle(cards), cards: cards.filter(function (c) { return c.kind !== 'gold' && c.kind !== 'xp'; }), replay: false, confetti: true }), 'ov-page', 'result'); });
    } else if (kind === 'lesson') {
      var lr = result.lesson || {};
      screens.push(function () { S.sound.play('fanfare'); openOverlay(SC.result({ art: '<div class="cd-art">' + C.pico({ size: 120, mood: 'party', cls: 'party' }) + '</div>', kicker: 'Entraînement de Wordkeeper', title: result.stars === 3 ? 'Sans faute !' : 'Entraînement réussi !', stars: result.stars, sub: (lr.firstTryCorrect || 0) + ' / ' + (lr.total || 0) + ' du premier coup' + (result.newWords ? ' · ' + UI.plural(result.newWords, 'nouveau mot', 'nouveaux mots') + ' dans ton Grimoire' : ''), cards: cards, replay: res.replay, confetti: true }), 'ov-page', 'result'); });
    } else if (kind === 'dialogue') {
      var npc = C.npc(cur.step.npc) || { name: '', look: {} };
      screens.push(function () { S.sound.play('fanfare'); openOverlay(SC.result({ art: '<div class="cd-art">' + C.npcSvg(cur.step.npc, { size: 120, mood: 'happy' }) + C.heroSvg(st(), { size: 120, mood: 'happy' }) + '</div>', kicker: 'Dialogue avec ' + esc(npc.name), title: 'Conversation réussie !', stars: result.stars, sub: result.mistakes ? UI.plural(result.mistakes, 'erreur') + ' corrigée' + (result.mistakes > 1 ? 's' : '') + ' avec Pico. On apprend en se trompant !' : 'Tu as tout dit en anglais sans une seule erreur !', cards: cards, replay: res.replay, confetti: true }), 'ov-page', 'result'); });
    } else if (kind === 'combat') {
      var cr = result.combat || {};
      screens.push(function () { S.sound.play('fanfare'); openOverlay(SC.result({ cls: 'loot-screen', art: '<div class="cd-art chest"><span class="emoji chest-ico">🎁</span>' + C.heroSvg(st(), { size: 120, mood: 'happy' }) + '</div>', kicker: cur.step.boss ? 'Boss vaincu' : 'Combat gagné', title: 'Victoire !', stars: result.stars, sub: (cr.quizTotal ? 'Runes de Mot : ' + (cr.quizOk || 0) + ' / ' + cr.quizTotal + ' réussies' : 'Les Mumblins font « pouf » !') + (cr.simulated ? ' · combat simulé' : ''), cards: cards, replay: res.replay, confetti: true }), 'ov-page', 'result'); });
    }
    cards.filter(function (c) { return c.kind === 'crystal'; }).forEach(function (c) {
      var ri = S.REGIONS.indexOf(c.region), nextR = S.REGIONS[ri + 1] || null;
      screens.push(function () { S.sound.play('crystal'); openOverlay(SC.crystalScene(c.region, nextR), 'ov-page', 'crystal'); FX.celebrate($('overlay').querySelector('.cs-gem'), [c.region.crystal.color, '#fff', '#FFE58A']); });
    });
    if (res.chapterDone) screens.push(function () { S.sound.play('fanfare'); openOverlay(SC.chapterDone(cur.ch), 'ov-page', 'chapter-done'); });
    // dernier chapitre terminé avec les cinq cristaux : écran de fin du jeu
    if (res.chapterDone && cur.chId === S.CHAPTERS[S.CHAPTERS.length - 1].id && st().crystals.length >= S.REGIONS.length && S.REGIONS.length) screens.push(showEnding);
    var xpToast = null;
    if (kind === 'scene' && !special.length) { var xp = cards.filter(function (c) { return c.kind === 'xp'; })[0]; if (xp && !res.chapterDone) xpToast = '+' + xp.n + ' XP ✨'; }
    if (cards.some(function (c) { return c.kind === 'level'; })) setTimeout(function () { S.sound.play('levelup'); }, 500);
    showQueue(screens, function () {
      render(); guard(700);   // les appuis en rafale de la fin d'étape ne doivent pas lancer (ou relancer) une étape par accident
      if (res.chapterDone) { closeOverlay(); go('map'); }
      else openChapter(cur.chId);
      if (xpToast) UI.toast(xpToast, 'ok', 1400);
      if (equipMsg.length) UI.toast('🛡️ ' + esc(equipMsg.join(', ')) + ' : équipé automatiquement !', 'ok', 3200);
    });
  }

  // ---------------------------------------------------------------- entraînement (révision espacée) & défi du jour
  function startTraining(mode) {
    var s = st(), today = E.dayKey(Date.now());
    if (mode === 'daily' && s.daily.date === today && s.daily.done) { UI.toast('Défi déjà réussi aujourd\'hui. À demain ! 🌞', 'ok'); return null; }
    var gen = S.practice(mode);
    if (!gen || !gen.exercises || !gen.exercises.length) { UI.toast('Pas d\'exercice disponible pour le moment.', 'warn'); return null; }
    var cur = { kind: 'training', mode: mode };
    var session = { kind: 'practice', mode: mode, banner: 'Terrain d\'entraînement', title: mode === 'daily' ? 'Défi du jour' : mode === 'mistakes' ? 'Réparer mes erreurs' : 'Mots à renforcer', exercises: gen.exercises };
    var player = new L.Player(session, lessonHooks(cur, function (result) { trainingDone(cur, result); }));
    current = cur; cur.player = player; UI.clearToasts();
    openOverlay('', 'ov-lesson', 'lesson'); player.mount($('overlay'));
    return player;
  }
  function trainingDone(cur, result) {
    if (current !== cur) return;
    current = null;
    var s = st(), today = E.dayKey(Date.now()), newWords = S.bumpWords(result), stars = L.starsFor(result.mistakes), reward;
    if (cur.mode === 'daily') { reward = { gold: 25, xp: 10 }; s.daily = { date: today, done: true }; }
    else reward = { gold: 10 + (result.mistakes === 0 ? 5 : 0), xp: 5 };
    s.stats.trainings++;
    var cards = S.grant(reward, {});
    S.touchStreak(); S.save();
    showQueue([function () { S.sound.play('fanfare'); openOverlay(SC.result({ art: '<div class="cd-art">' + C.pico({ size: 120, mood: 'party', cls: 'party' }) + '</div>', kicker: cur.mode === 'daily' ? 'Défi du jour' : 'Terrain d\'entraînement', title: cur.mode === 'daily' ? 'Défi réussi !' : 'Bien entraîné' + (s.hero.gender === 'f' ? 'e' : '') + ' !', stars: stars, sub: (result.firstTryCorrect || 0) + ' / ' + (result.total || 0) + ' du premier coup' + (newWords ? ' · ' + UI.plural(newWords, 'mot renforcé', 'mots renforcés') : '') + ' · série : ' + UI.plural(s.streak, 'jour') + ' 🔥', cards: cards, confetti: true }), 'ov-page', 'result'); }], function () { closeOverlay(); render(); });
  }

  // ---------------------------------------------------------------- réglages, parents
  function showSettings() { ui.settingsFrom = ui.overlayType === 'chapter' ? 'chapter' : null; openOverlay(SC.settings(), 'ov-page', 'settings'); bindParentLock(); }
  function refreshSettings() { var o = $('overlay'), sc = o.querySelector('.page-body'), top = sc ? sc.scrollTop : 0; o.innerHTML = SC.settings(); sc = o.querySelector('.page-body'); if (sc) sc.scrollTop = top; bindParentLock(); }
  function showParents() { openOverlay(SC.parents(), 'ov-page', 'parents'); }
  function bindParentLock() {
    var b = $('overlay').querySelector('[data-role="parent-lock"]'); if (!b) return;
    var timer = null;
    var start = function (e) { if (e && e.preventDefault && e.type !== 'keydown') e.preventDefault(); if (timer) return; b.classList.add('holding'); timer = setTimeout(function () { timer = null; b.classList.remove('holding'); S.sound.play('unlock'); showParents(); }, 2000); };
    var stop = function () { clearTimeout(timer); timer = null; b.classList.remove('holding'); };
    b.addEventListener('pointerdown', start); b.addEventListener('pointerup', stop); b.addEventListener('pointerleave', stop); b.addEventListener('pointercancel', stop);
    b.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') start(e); }); b.addEventListener('keyup', stop);
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    b.addEventListener('click', function () { if (!timer) UI.toast('Garde le doigt appuyé 2 secondes sur le cadenas 🔒', '', 1800); });
  }
  function copySave() {
    var ta = $('overlay').querySelector('[data-role="save-json"]'); if (!ta) return;
    ta.value = S.exportJson();
    var done = function (ok) { UI.toast(ok ? 'Sauvegarde copiée 📋' : 'Sélectionne le texte et copie-le à la main.', ok ? 'ok' : 'warn'); };
    try { ta.focus(); ta.select(); } catch (e) { /* ignore */ }
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(ta.value).then(function () { done(true); }, function () { var ok = false; try { ok = document.execCommand('copy'); } catch (e2) { ok = false; } done(ok); }); return; } } catch (e3) { /* ignore */ }
    var ok2 = false; try { ok2 = document.execCommand('copy'); } catch (e4) { ok2 = false; } done(ok2);
  }
  function importSave() {
    var ta = $('overlay').querySelector('[data-role="save-json"]'); if (!ta) return;
    if (S.importJson(ta.value)) { applySettings(); render(true); refreshSettings(); UI.toast('Sauvegarde importée ✓', 'ok'); }
    else UI.toast('Ce texte n\'est pas une sauvegarde Echoria valide.', 'warn');
  }

  // ---------------------------------------------------------------- boutique, équipement, sorts, compétences
  function buy(id) {
    var s = st(), it = S.item(id); if (!it || !it.price) return;
    if (it.kind !== 'potion' && s.items.indexOf(id) >= 0) return;
    if (s.gold < it.price) { UI.toast('Il te manque ' + (it.price - s.gold) + ' pièces d\'or 🪙', 'warn'); S.sound.play('wrong'); return; }
    s.gold -= it.price;
    if (it.kind === 'potion') { s.potions = Math.min(99, s.potions + 1); UI.toast('🧪 Potion achetée ! Tu en as ' + s.potions + '.', 'ok'); }
    else { s.items.push(id); var eq = S.autoEquip(it); UI.toast(esc(it.emoji) + ' ' + esc(it.fr) + (eq ? ' : acheté et équipé !' : ' : acheté ! Tu peux l\'équiper dans ta fiche Héros.'), 'ok', 3000); }
    S.sound.play('coin'); S.save(); render();
    var purse = $('view').querySelector('.purse'); if (purse) FX.once(purse, 'bump', 500);
  }
  function equipSet(kind, id) {
    var s = st();
    if (id) { var it = S.item(id); if (!it || it.kind !== kind || s.items.indexOf(id) < 0) return; }
    else if (kind !== 'trinket') return;
    s.equip[kind] = id || ''; S.save(); S.sound.play('click'); UI.closeModal(); render();
  }
  function spellToggle(id) {
    var s = st(), i = s.spellsEquipped.indexOf(id);
    if (s.spells.indexOf(id) < 0) return;
    if (i >= 0) s.spellsEquipped.splice(i, 1);
    else if (s.spellsEquipped.length >= 3) { UI.toast('3 sorts au maximum : retire-en un d\'abord.', 'warn'); return; }
    else s.spellsEquipped.push(id);
    S.save(); S.sound.play('click'); render();
  }
  function skillAdd(id) {
    var s = st(); if (S.skillPoints() <= 0 || s.skills[id] === undefined) return;
    s.skills[id]++; S.save(); S.sound.play('unlock'); render();
  }

  // ---------------------------------------------------------------- actions (délégation data-act)
  var ACT = {
    'noop': function () {},
    'go': function (a) { go(a.getAttribute('data-tab')); },
    'settings': showSettings,
    'close-overlay': function () { var t = ui.overlayType; closeOverlay(); if (t === 'settings' && ui.settingsFrom === 'chapter' && ui.chapter) { render(); openChapter(ui.chapter); } else render(t === 'chapter'); },
    'close-modal': function () { UI.closeModal(); },
    'close-modal-backdrop': function (a, e) { if (e.target === a) UI.closeModal(); },
    'title-continue': function () { S.sound.play('unlock'); closeOverlay(); render(true); },
    'title-new': function () { if (st().hero.created) UI.showModal({ pico: { mood: 'think' }, title: 'Commencer une nouvelle partie ?', text: 'Ta partie actuelle sera effacée pour toujours.', actions: [{ label: 'Non, je garde ma partie', cls: 'btn-green', act: 'close-modal' }, { label: 'Oui, tout recommencer', cls: 'btn-red', act: 'new-confirm' }] }); else showCreator(); },
    'new-confirm': function () { UI.closeModal(); S.reset(); applySettings(); render(true); showCreator(); },
    'cr-set': function (a) { creatorSet(a.getAttribute('data-k'), a.getAttribute('data-v')); },
    'cr-done': creatorDone,
    'chapter': function (a) { openChapter(a.getAttribute('data-id')); },
    'step': function (a) { startStep(a.getAttribute('data-ch'), parseInt(a.getAttribute('data-i'), 10)); },
    'tips': function (a) { var ch = S.chapter(a.getAttribute('data-id')); if (ch) UI.showModal({ cls: 'modal-tips', title: '📜 Astuces de Pico', html: SC.tipsHtml(ch), actions: [{ label: 'Compris !', cls: 'btn-green', act: 'close-modal' }] }); },
    'lesson-go': function () { runLesson(); },
    'quit-step': function () { abortCurrent(); },
    'quit-confirm': function () { abortCurrent(); },
    'result-next': function () { S.sound.play('click'); nextResult(); },
    'combat-retry': function () { retryCombat(false); },
    'combat-retry-easy': function () { retryCombat(true); },
    'equip-open': function (a) { var k = a.getAttribute('data-kind'); UI.showModal({ title: 'Choisis ton ' + (k === 'weapon' ? 'arme' : k === 'armor' ? 'armure' : 'talisman'), html: SC.equipPicker(k), actions: [{ label: 'Fermer', cls: 'btn-parch', act: 'close-modal' }] }); },
    'equip-set': function (a) { equipSet(a.getAttribute('data-kind'), a.getAttribute('data-id')); },
    'spell-toggle': function (a) { spellToggle(a.getAttribute('data-id')); },
    'skill-add': function (a) { skillAdd(a.getAttribute('data-id')); },
    'buy': function (a) { buy(a.getAttribute('data-id')); },
    'grim': function (a) { ui.grimSub = a.getAttribute('data-sub'); render(); $('view').scrollTop = 0; },
    'train': function (a) { startTraining(a.getAttribute('data-mode')); },
    'set-toggle': function (a) { var k = a.getAttribute('data-key'), s = st().settings; s[k] = !s[k]; S.save(); applySettings(); refreshSettings(); if (k === 'sound' && s[k]) S.sound.play('correct'); if (k === 'vibrate' && s[k]) S.vibrate(60); },
    'set-choice': function (a) { var k = a.getAttribute('data-key'), v = a.getAttribute('data-v'), s = st().settings; s[k] = k === 'rate' ? parseFloat(v) : v; S.save(); applySettings(); refreshSettings(); if (k === 'voice' || k === 'rate') S.tts.speak('Hello, Wordkeeper!'); },
    'save-copy': copySave, 'save-import': importSave,
    'ending': function () { showQueue([showEnding], function () { closeOverlay(); render(); }); },
    'tuto-replay': function () {
      var root = $('combat-root');
      if (!(window.Combat && typeof window.Combat.tutorial === 'function')) { UI.toast('Tu reverras l\'explication au prochain combat.', 'ok'); st().flags.combatTuto = false; S.save(); return; }
      root.innerHTML = ''; root.className = 'active tuto';
      window.Combat.tutorial(root, { sound: function (n) { S.sound.play(n); }, onDone: function () { root.className = ''; root.innerHTML = ''; } });
    },
    'reset-ask': function () { UI.showModal({ pico: { mood: 'sad' }, title: 'Tout recommencer ?', text: 'Ton héros, tes mots, ton or et tes cristaux seront effacés pour toujours.', actions: [{ label: 'Non, je garde ma partie', cls: 'btn-green', act: 'close-modal' }, { label: 'Oui, tout effacer', cls: 'btn-red', act: 'reset-confirm' }] }); },
    'reset-confirm': function () { UI.closeModal(); S.reset(); ui.chapter = null; ui.grimQ = ''; ui.grimSub = 'words'; applySettings(); go('map'); showTitle(); },
    'parents-close': function () { showSettings(); },
    'unlock-all': function () { var f = st().flags; f.unlockAll = !f.unlockAll; S.save(); render(true); var o = $('overlay'), sc = o.querySelector('.page-body'), top = sc ? sc.scrollTop : 0; o.innerHTML = SC.parents(); sc = o.querySelector('.page-body'); if (sc) sc.scrollTop = top; UI.toast(f.unlockAll ? 'Tous les chapitres sont débloqués.' : 'Progression normale rétablie.', 'ok'); },
    'easy-mode': function () { var f = st().flags; f.easy = !f.easy; S.save(); var o = $('overlay'), sc = o.querySelector('.page-body'), top = sc ? sc.scrollTop : 0; o.innerHTML = SC.parents(); sc = o.querySelector('.page-body'); if (sc) sc.scrollTop = top; }
  };
  function onClick(e) {
    var t = e.target; if (!t || !t.closest) return;
    var sp = t.closest('[data-action="speak"]');
    if (sp && !t.closest('.screen.lesson')) { S.tts.speak(sp.getAttribute('data-text'), sp.getAttribute('data-slow') ? { slow: true } : null); sp.classList.add('playing'); setTimeout(function () { sp.classList.remove('playing'); }, 600); return; }
    var a = t.closest('[data-act]'); if (!a || a.disabled) return;
    if (a.getAttribute('aria-disabled') === 'true') { var act0 = a.getAttribute('data-act'); if (act0 === 'chapter') openChapter(a.getAttribute('data-id')); else if (act0 === 'step') UI.toast('🔒 Termine d\'abord les étapes précédentes.', 'warn'); return; }
    var act = a.getAttribute('data-act');
    if ((act === 'result-next' || act === 'step' || act === 'chapter') && Date.now() < guardUntil) return;
    var fn = ACT[act]; if (fn) fn(a, e);
  }
  function onInput(e) {
    var t = e.target; if (!t || !t.getAttribute) return;
    if (t.getAttribute('data-role') === 'grim-q') { ui.grimQ = t.value; var list = $('view').querySelector('[data-role="grim-list"]'); if (list) list.innerHTML = SC.wordRows(SC.filterWords(ui.grimQ)); }
    else if (t.getAttribute('data-role') === 'cr-name') { if (ui.creator) ui.creator.name = t.value; t.classList.remove('need'); }
  }

  // ---------------------------------------------------------------- démarrage
  var api = {
    get state() { return S.state; }, get current() { return current; }, get player() { return current && (current.player || (current.home && current.home.player)); }, get home() { return home; }, get combat() { return current && current.handle; }, get usingSim() { return !!(current && current.sim); },
    get ui() { return ui; }, forceSim: false, store: S,
    save: function () { S.save(); S.flush(); }, go: go, render: render, startStep: startStep, openChapter: openChapter, openHome: openHome, closeHome: closeHome, runLesson: runLesson, startTraining: startTraining, quitStep: abortCurrent,
    showTitle: showTitle, showCreator: showCreator, showSettings: showSettings, showParents: showParents, nextResult: nextResult, combatOpts: combatOpts, CombatSim: CombatSim
  };
  window.Echoria = api;

  function boot() {
    S.tts.init(); S.startClock();
    try { E.checkStreak(st(), Date.now()); } catch (e) { /* ignore */ }
    S.on('remote', function () { applySettings(); render(true); if (ui.overlayType === 'title') showTitle(); });
    S.on('sync', function () { var el = document.querySelector('.sync-indicator'); if (el) el.textContent = S.cloud.label(); });
    S.cloud.init();
    ui.tab = tabFromHash();
    document.addEventListener('click', onClick);
    document.addEventListener('input', onInput);
    // Échap (clavier) et « retour » du téléphone (historique) : ferme la fenêtre du dessus, propose de quitter l'étape, met le combat en pause.
    function goBack(fromKey) {
      if (UI.isModalOpen()) { if (UI.isModalDismissable()) UI.closeModal(); return true; }
      if (current && current.kind === 'combat') { if (fromKey) return true; if (current.handle && current.handle.pause) try { current.handle.pause(); } catch (e) { /* ignore */ } return true; } // Échap : le moteur ouvre lui-même sa pause
      if (current && current.kind !== 'training' && ui.overlayType === 'lesson-intro') { abortCurrent(); return true; }
      if (current && current.kind === 'home') { if (home && home.state().list) { home.hideList(); return true; } if (fromKey && home && home.layer) return true; closeHome(); return true; }
      if (current) { askQuit(); return true; }
      var back = ui.overlayType && $('overlay').querySelector('.back-btn, [data-act="parents-close"]');
      if (back) { back.click(); return true; }
      return false;
    }
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !e.defaultPrevented) goBack(true); });
    window.addEventListener('hashchange', function () {
      var t = tabFromHash(); if (t === ui.tab) return;
      if ((ui.overlayType && ui.overlayType !== 'title') || current || UI.isModalOpen()) { goBack(false); try { if (location.hash !== '#' + ui.tab) location.hash = ui.tab; } catch (e) { /* cadre sandboxé */ } return; }
      ui.tab = t; UI.clearToasts(); render(true);
    });
    // Onglet caché : on sauvegarde et le combat se met en pause ; au retour il RESTE en pause (bouton « Reprendre »), l'enfant repart quand il est prêt.
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') { S.flush(); try { S.cloud.flush(); } catch (e) { /* ignore */ } S.tts.stop(); if (current && current.handle && current.handle.pause) try { current.handle.pause(); } catch (e2) { /* ignore */ } } });
    window.addEventListener('pagehide', function () { S.flush(); });
    render(true);
    showTitle();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
