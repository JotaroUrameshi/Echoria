/* Echoria — lesson.js : lecteur de leçon repris de Parlo (8 types d'exercices, bandeau de feedback),
   habillé en « entraînement de Wordkeeper » : pas de cœurs, des étoiles selon les erreurs. Exposé via window.Lesson. */
(function () {
  'use strict';
  var E = window.Engine, UI = window.UI, esc = UI.esc, icon = UI.icon;

  var PRAISE = ['Excellent !', 'Bien joué !', 'Super !', 'Parfait !', 'Génial !', 'Bravo !', 'Well done!', 'Great!'];
  // 3 étoiles sans erreur, 2 avec ≤ 2 erreurs, 1 sinon (SPEC §3).
  function starsFor(mistakes) { return mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1; }
  var OOPS = ['Oups !', 'Pas tout à fait…', 'Presque, mais non.', 'Ce n\'est pas ça.'];
  function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function el(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
  function qsa(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }

  // ---------------------------------------------------------------- rendu des exercices
  // Chaque renderer renvoie un contrôleur : { html, mount(root), ready() -> bool, check() -> {ok, almost, match}, reveal(result), autoFill(correct), selectIndex(i), removeLast(), focus() }
  function wordSpan(text) {
    return E.wordsOf(text).map(function (w) { return '<span class="word" data-action="speak" data-text="' + esc(w) + '">' + esc(w) + '</span>'; }).join(' ');
  }
  function bubbleHtml(text, isEn) {
    return '<div class="speech">' + UI.pico({ mood: 'happy', size: 84 }) + '<div class="bubble">' + (isEn ? UI.speakBtn(text) + '<span>' + wordSpan(text) + '</span>' : '<span>' + esc(text) + '</span>') + '</div></div>';
  }
  function optionsHtml(items, labelFn, cls) {
    return '<div class="options" role="listbox">' + items.map(function (it, i) { return '<button class="opt ' + (cls || '') + '" role="option" aria-selected="false" data-idx="' + i + '"><span class="num">' + (i + 1) + '</span><span class="grow">' + labelFn(it, i) + '</span></button>'; }).join('') + '</div>';
  }

  function makeSelect(ex, ctx, html, correctIdx, labelOf) {
    var root, selected = -1, buttons = [];
    return {
      html: html,
      mount: function (r) {
        root = r; buttons = qsa(root, '[data-idx]');
        buttons.forEach(function (b) { b.addEventListener('click', function () { if (ctx.locked()) return; select(parseInt(b.getAttribute('data-idx'), 10)); }); });
      },
      ready: function () { return selected >= 0; },
      selectIndex: function (i) { if (i >= 0 && i < buttons.length) select(i); },
      check: function () { return { ok: selected === correctIdx, almost: false, match: labelOf(correctIdx) }; },
      reveal: function (res) { buttons.forEach(function (b, i) { b.disabled = true; if (i === correctIdx) b.classList.add('correct'); else if (i === selected && !res.ok) b.classList.add('wrong'); }); },
      autoFill: function (correct) { select(correct ? correctIdx : (correctIdx + 1) % buttons.length); }
    };
    function select(i) { selected = i; buttons.forEach(function (b, k) { b.classList.toggle('selected', k === i); b.setAttribute('aria-selected', k === i ? 'true' : 'false'); }); ctx.onReady(true); }
  }

  var R = {};
  R.select_meaning = function (ex, ctx) {
    var correctIdx = ex.options.indexOf(ex.answer);
    var html = (ctx.isNewWord(ex.word.en) ? '<div class="new-word">✨ Nouveau mot</div>' : '') + '<h2 class="ex-prompt">Que signifie <span class="ex-word">« ' + esc(ex.word.en) + ' »</span> ? ' + (ctx.tts ? UI.speakBtn(ex.word.en) : '') + '</h2>' + (ex.word.emoji ? '<div class="emoji" style="font-size:56px;margin:-6px 0 14px">' + esc(ex.word.emoji) + '</div>' : '') + optionsHtml(ex.options, function (o) { return esc(o); });
    return makeSelect(ex, ctx, html, correctIdx, function (i) { return ex.options[i]; });
  };
  R.select_image = function (ex, ctx) {
    var correctIdx = ex.options.findIndex(function (o) { return o.en === ex.answer; });
    var html = '<h2 class="ex-prompt">Lequel est <span class="ex-word">« ' + esc(ex.word.fr) + ' »</span> ?</h2><div class="img-grid" role="listbox">' + ex.options.map(function (o, i) { return '<button class="img-card" role="option" aria-selected="false" data-idx="' + i + '" aria-label="' + esc(o.en) + '"><span class="emoji">' + esc(o.emoji) + '</span><span>' + esc(o.en) + '</span><span class="num">' + (i + 1) + '</span></button>'; }).join('') + '</div>';
    var c = makeSelect(ex, ctx, html, correctIdx, function (i) { return ex.options[i].en; });
    var baseMount = c.mount;
    c.mount = function (r) { baseMount(r); qsa(r, '.img-card').forEach(function (b, i) { b.addEventListener('click', function () { if (ctx.tts) ctx.speak(ex.options[i].en); }); }); };
    return c;
  };
  R.listen_word = function (ex, ctx) {
    var correctIdx = ex.options.indexOf(ex.answer);
    var html = '<h2 class="ex-prompt">' + esc(ex.prompt) + '</h2><div class="listen-box"><button class="speaker-btn" data-action="speak" data-text="' + esc(ex.tts) + '" aria-label="Écouter">' + icon('speaker') + '</button><button class="speaker-btn small" data-action="speak" data-text="' + esc(ex.tts) + '" data-slow="1" aria-label="Écouter lentement"><span class="emoji" style="font-size:30px">🐢</span></button></div>' + optionsHtml(ex.options, function (o) { return esc(o); }) + '<div class="center" style="margin-top:16px"><button class="cant-listen" data-action="cant-listen">Je ne peux pas écouter pour l\'instant</button></div>';
    var c = makeSelect(ex, ctx, html, correctIdx, function (i) { return ex.options[i]; });
    c.autoplay = ex.tts;
    return c;
  };
  R.fill_blank = function (ex, ctx) {
    var correctIdx = ex.options.indexOf(ex.answer);
    var html = '<h2 class="ex-prompt">' + esc(ex.prompt) + '</h2><div class="fill-sentence">' + esc(ex.before) + '<span class="gap" data-role="gap" aria-label="mot manquant">&nbsp;</span>' + esc(ex.after) + '</div><div class="fill-hint">' + esc(ex.hint) + '</div><div class="fill-options" role="listbox">' + ex.options.map(function (o, i) { return '<button class="tile" role="option" aria-selected="false" data-idx="' + i + '">' + esc(o) + '</button>'; }).join('') + '</div>';
    var c = makeSelect(ex, ctx, html, correctIdx, function (i) { return ex.options[i]; });
    var baseMount = c.mount, baseReveal = c.reveal;
    var gap;
    c.mount = function (r) { baseMount(r); gap = r.querySelector('[data-role="gap"]'); qsa(r, '.tile').forEach(function (b, i) { b.addEventListener('click', function () { if (ctx.locked()) return; gap.textContent = ex.options[i]; gap.classList.add('filled'); }); }); };
    var baseAuto = c.autoFill;
    c.autoFill = function (ok) { baseAuto(ok); var i = ok ? correctIdx : (correctIdx + 1) % ex.options.length; gap.textContent = ex.options[i]; gap.classList.add('filled'); };
    var baseSel = c.selectIndex;
    c.selectIndex = function (i) { baseSel(i); if (i >= 0 && i < ex.options.length) { gap.textContent = ex.options[i]; gap.classList.add('filled'); } };
    c.reveal = function (res) { baseReveal(res); gap.classList.add(res.ok ? 'correct' : 'wrong'); if (!res.ok) { gap.textContent = ex.answer; gap.classList.remove('wrong'); gap.classList.add('correct'); } };
    return c;
  };
  R.translate_bank = function (ex, ctx) {
    var root, answerEl, bankEl, chosen = []; // indices dans ex.tokens
    var html = '<h2 class="ex-prompt">' + esc(ex.prompt) + '</h2>' + bubbleHtml(ex.source, false) + '<div class="bank-answer" data-role="answer" aria-label="Ta réponse"></div><div class="bank" data-role="bank">' + ex.tokens.map(function (t, i) { return '<button class="tile" data-tok="' + i + '">' + esc(t) + '</button>'; }).join('') + '</div>';
    function redraw(origin) {
      var mutate = function () {
        answerEl.innerHTML = chosen.map(function (i) { return '<button class="tile" data-pick="' + i + '">' + esc(ex.tokens[i]) + '</button>'; }).join('');
        qsa(bankEl, '[data-tok]').forEach(function (b) { b.classList.toggle('used', chosen.indexOf(parseInt(b.getAttribute('data-tok'), 10)) >= 0); });
        ctx.onReady(chosen.length > 0);
      };
      if (!window.FX || !root) return mutate();
      var origins = {}; if (origin && origin.el) origins[origin.key] = origin.el.getBoundingClientRect();
      FX.flipTiles(root, '.bank-answer [data-pick], .bank [data-tok]:not(.used)', function (t) { return t.hasAttribute('data-pick') ? 'p' + t.getAttribute('data-pick') : 't' + t.getAttribute('data-tok'); }, mutate, origins);
    }
    function text() { return chosen.map(function (i) { return ex.tokens[i]; }).join(' '); }
    return {
      html: html,
      mount: function (r) {
        root = r; answerEl = root.querySelector('[data-role="answer"]'); bankEl = root.querySelector('[data-role="bank"]');
        bankEl.addEventListener('click', function (e) { var b = e.target.closest('[data-tok]'); if (!b || ctx.locked()) return; var i = parseInt(b.getAttribute('data-tok'), 10); if (chosen.indexOf(i) < 0) { chosen.push(i); ctx.sound('tile'); if (ctx.tts) ctx.speak(ex.tokens[i]); redraw({ key: 'p' + i, el: b }); } });
        answerEl.addEventListener('click', function (e) { var b = e.target.closest('[data-pick]'); if (!b || ctx.locked()) return; var i = parseInt(b.getAttribute('data-pick'), 10); chosen = chosen.filter(function (k) { return k !== i; }); ctx.sound('tile'); redraw({ key: 't' + i, el: b }); });
      },
      ready: function () { return chosen.length > 0; },
      removeLast: function () { if (chosen.length && !ctx.locked()) { var i = chosen.pop(); redraw({ key: 't' + i, el: answerEl.querySelector('[data-pick="' + i + '"]') }); } },
      check: function () { var r = E.compare(text(), ex.accepted, { exact: true }); r.match = r.match || ex.answer; r.given = text(); return r; },
      reveal: function (res) { qsa(answerEl, '.tile').forEach(function (t) { t.classList.add(res.ok ? 'correct' : 'wrong'); t.disabled = true; }); },
      autoFill: function (correct) {
        chosen = [];
        if (correct) {
          var used = {};
          ex.answerTokens.forEach(function (w) { for (var i = 0; i < ex.tokens.length; i++) if (!used[i] && ex.tokens[i] === w) { used[i] = true; chosen.push(i); return; } });
        } else { var wrongIdx = ex.tokens.findIndex(function (t, i) { return ex.answerTokens.indexOf(t) < 0; }); chosen = [wrongIdx >= 0 ? wrongIdx : 0]; }
        redraw();
      }
    };
  };
  function makeTyping(ex, ctx, html) {
    var ta;
    return {
      html: html,
      mount: function (r) {
        ta = r.querySelector('textarea');
        ta.addEventListener('input', function () { ctx.onReady(ta.value.trim().length > 0); });
        ta.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); ctx.enter(); } });
      },
      focus: function () { try { ta.focus(); } catch (e) { /* ignore */ } },
      ready: function () { return !!(ta && ta.value.trim()); },
      check: function () { var r = E.compare(ta.value, ex.accepted, { blank: ex.blank }); r.match = r.match || ex.answer; r.given = ta.value; return r; },
      reveal: function (res) { ta.disabled = true; ta.classList.add(res.ok ? 'correct' : 'wrong'); },
      autoFill: function (correct) { ta.value = correct ? ex.answer : 'zzz'; ctx.onReady(true); },
      setText: function (t) { ta.value = t; ctx.onReady(t.trim().length > 0); }
    };
  }
  R.translate_type = function (ex, ctx) {
    var html = '<h2 class="ex-prompt">' + esc(ex.prompt) + '</h2>' + bubbleHtml(ex.source, ex.dir === 'fr' && ctx.tts) + '<textarea class="type-input" rows="3" placeholder="' + (ex.dir === 'fr' ? 'Écris en français' : 'Écris en anglais') + '" aria-label="Ta réponse" autocapitalize="sentences" autocomplete="off" spellcheck="false" lang="' + ex.lang + '"></textarea>';
    var c = makeTyping(ex, ctx, html);
    if (ex.dir === 'fr' && ctx.tts) c.autoplay = ex.source;
    return c;
  };
  R.listen_type = function (ex, ctx) {
    var html = '<h2 class="ex-prompt">' + esc(ex.prompt) + '</h2><div class="listen-box"><button class="speaker-btn" data-action="speak" data-text="' + esc(ex.tts) + '" aria-label="Écouter">' + icon('speaker') + '</button><button class="speaker-btn small" data-action="speak" data-text="' + esc(ex.tts) + '" data-slow="1" aria-label="Écouter lentement"><span class="emoji" style="font-size:30px">🐢</span></button></div><textarea class="type-input" rows="3" placeholder="Écris en anglais" aria-label="Ta réponse" autocomplete="off" spellcheck="false" lang="en"></textarea><div class="center" style="margin-top:16px"><button class="cant-listen" data-action="cant-listen">Je ne peux pas écouter pour l\'instant</button></div>';
    var c = makeTyping(ex, ctx, html);
    c.autoplay = ex.tts;
    return c;
  };
  R.match_pairs = function (ex, ctx) {
    var root, selL = -1, selR = -1, matched = 0, done = false, busy = false;
    var html = '<h2 class="ex-prompt">' + esc(ex.prompt) + '</h2><div class="pairs" role="group" aria-label="Paires">' + ex.left.map(function (w, i) { return '<button class="pair-tile" data-side="l" data-i="' + i + '" lang="en">' + esc(w) + '</button><button class="pair-tile" data-side="r" data-i="' + i + '" lang="fr">' + esc(ex.right[i]) + '</button>'; }).join('') + '</div>';
    function frOf(en) { var p = ex.pairs.filter(function (p) { return p.en === en; })[0]; return p ? p.fr : ''; }
    function tile(side, i) { return root.querySelector('[data-side="' + side + '"][data-i="' + i + '"]'); }
    function tryMatch() {
      if (selL < 0 || selR < 0) return;
      var l = tile('l', selL), r = tile('r', selR);
      var ok = frOf(ex.left[selL]) === ex.right[selR];
      busy = true;
      if (ok) {
        l.classList.remove('selected'); r.classList.remove('selected'); l.classList.add('matched'); r.classList.add('matched'); l.disabled = true; r.disabled = true; matched++;
        ctx.sound('click'); busy = false; selL = selR = -1;
        if (matched === ex.pairs.length) { done = true; ctx.onReady(true); if (window.FX) FX.pairsDone(root); setTimeout(function () { ctx.autoCheck(); }, 450); }
      } else {
        l.classList.add('wrong'); r.classList.add('wrong'); ctx.sound('wrong'); ctx.vibrate(80);
        setTimeout(function () { l.classList.remove('wrong', 'selected'); r.classList.remove('wrong', 'selected'); selL = selR = -1; busy = false; }, 450);
      }
    }
    return {
      html: html,
      mount: function (r) {
        root = r;
        root.querySelector('.pairs').addEventListener('click', function (e) {
          var b = e.target.closest('.pair-tile'); if (!b || busy || done || b.disabled || ctx.locked()) return;
          var side = b.getAttribute('data-side'), i = parseInt(b.getAttribute('data-i'), 10);
          if (side === 'l') { if (selL >= 0) tile('l', selL).classList.remove('selected'); selL = i; if (ctx.tts) ctx.speak(ex.left[i]); } else { if (selR >= 0) tile('r', selR).classList.remove('selected'); selR = i; }
          b.classList.add('selected'); tryMatch();
        });
      },
      ready: function () { return done; },
      noHearts: true,
      check: function () { return { ok: true, almost: false, match: '' }; },
      reveal: function () {},
      autoFill: function () { ex.left.forEach(function (en, i) { var fr = frOf(en); var j = ex.right.indexOf(fr); var l = tile('l', i), r = tile('r', j); l.classList.add('matched'); r.classList.add('matched'); l.disabled = true; r.disabled = true; }); matched = ex.pairs.length; done = true; ctx.onReady(true); }
    };
  };

  // ---------------------------------------------------------------- lecteur
  function Player(session, hooks) {
    this.session = session; this.hooks = hooks;
    this.queue = session.exercises.slice();
    this.initialTotal = this.queue.length;
    this.index = 0; this.correct = 0; this.mistakes = 0; this.combo = 0; this.maxCombo = 0;
    this.answers = []; this.failedIds = {}; this.startTime = Date.now();
    this.phase = 'question'; this.ctrl = null; this.ex = null; this.destroyed = false;
    this.timeLeft = session.timed ? session.timed.seconds : 0;
  }
  Player.prototype.mount = function (root) {
    var self = this; this.root = root;
    root.innerHTML = '<div class="screen lesson" data-kind="' + esc(this.session.kind) + '"><div class="lesson-banner"><span class="emoji">🎓</span> ' + esc(this.session.banner || 'Entraînement de Wordkeeper') + (this.session.title ? ' · <b>' + esc(this.session.title) + '</b>' : '') + '</div><div class="screen-top"><button class="close" data-action="lesson-quit" aria-label="Quitter">' + icon('close') + '</button><div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span style="width:0%"></span></div><div data-role="status"></div></div><div class="screen-body"><div class="screen-inner" data-role="exercise"></div></div><div class="screen-foot"><div class="foot-inner"><button class="btn btn-white btn-skip" data-action="lesson-skip">Passer</button><button class="btn btn-green btn-check" data-action="lesson-check" disabled>Vérifier</button></div></div><div data-role="feedback"></div></div>';
    this.exEl = root.querySelector('[data-role="exercise"]');
    this.fbEl = root.querySelector('[data-role="feedback"]');
    this.checkBtn = root.querySelector('.btn-check');
    this.statusEl = root.querySelector('[data-role="status"]');
    this.progEl = root.querySelector('.progress');
    root.querySelector('.screen').addEventListener('click', function (e) {
      var a = e.target.closest('[data-action]'); if (!a) return;
      var act = a.getAttribute('data-action');
      if (act === 'lesson-check') self.check();
      else if (act === 'lesson-continue') self.next();
      else if (act === 'lesson-skip') self.skip();
      else if (act === 'lesson-quit') self.hooks.onQuitAsk(self);
      else if (act === 'speak') { self.hooks.speak(a.getAttribute('data-text'), !!a.getAttribute('data-slow')); a.classList.add('playing'); setTimeout(function () { a.classList.remove('playing'); }, 700); }
      else if (act === 'cant-listen') self.cantListen();
    });
    this.keyHandler = function (e) { self.onKey(e); };
    document.addEventListener('keydown', this.keyHandler);
    if (this.session.timed) this.startTimer();
    this.renderStatus(); this.show();
  };
  Player.prototype.startTimer = function () {
    var self = this;
    this.timer = setInterval(function () {
      if (self.phase === 'done' || self.destroyed) return;
      self.timeLeft -= 1; self.renderStatus();
      if (self.timeLeft <= 0) { clearInterval(self.timer); self.finish(); }
    }, 1000);
  };
  Player.prototype.renderStatus = function () {
    var s = this.session;
    if (s.timed) this.statusEl.innerHTML = '<span class="timer' + (this.timeLeft <= 10 ? ' low' : '') + '" aria-live="polite">⏱ ' + Math.max(0, this.timeLeft) + ' s</span>';
    else this.statusEl.innerHTML = UI.stars(starsFor(this.mistakes), 'mini');
    var pct = Math.min(100, Math.round(this.correct / Math.max(1, this.initialTotal) * 100));
    this.progEl.querySelector('span').style.width = pct + '%'; this.progEl.setAttribute('aria-valuenow', pct);
  };
  Player.prototype.show = function () {
    var self = this;
    if (this.index >= this.queue.length) { if (this.session.timed && this.hooks.moreExercises) { var more = this.hooks.moreExercises(); if (more && more.length) { this.queue = this.queue.concat(more); } } }
    if (this.index >= this.queue.length) return this.finish();
    this.ex = this.queue[this.index]; this.phase = 'question'; this.locked = false;
    var ex = this.ex;
    var ctx = {
      tts: this.hooks.ttsAvailable(), speak: this.hooks.speak, sound: this.hooks.sound, vibrate: this.hooks.vibrate, isNewWord: this.hooks.isNewWord || function () { return false; },
      onReady: function (ok) { var was = self.checkBtn.disabled; self.checkBtn.disabled = !ok; if (was && ok && window.FX) FX.ready(self.checkBtn); }, locked: function () { return self.locked; },
      enter: function () { if (self.phase === 'question' && !self.checkBtn.disabled) self.check(); },
      autoCheck: function () { if (self.phase === 'question') self.check(); }
    };
    var renderer = R[ex.type] || R.select_meaning;
    this.ctrl = renderer(ex, ctx);
    this.exEl.innerHTML = this.ctrl.html;
    this.ctrl.mount(this.exEl);
    if (window.FX) FX.exerciseIn(this.root);
    this.checkBtn.disabled = !this.ctrl.ready();
    var skipBtn = this.root.querySelector('.btn-skip'); if (skipBtn) skipBtn.classList.toggle('hidden', !!this.ctrl.noHearts);
    this.fbEl.innerHTML = '';
    reserveFeedbackSpace(this.root, this.fbEl);
    this.root.querySelector('.screen-body').scrollTop = 0;
    if (this.ctrl.autoplay && ctx.tts) { var ctrlNow = this.ctrl; setTimeout(function () { if (!self.destroyed && self.ctrl === ctrlNow) self.hooks.speak(ctrlNow.autoplay, false); }, 250); }
    if (this.ctrl.focus && window.innerWidth >= 700) this.ctrl.focus();
  };
  Player.prototype.check = function (force) {
    if (this.phase !== 'question' || !this.ctrl || this.destroyed) return null;
    if (!force && !this.ctrl.ready()) return null;
    var res = this.ctrl.check();
    this.locked = true; this.phase = 'feedback';
    this.ctrl.reveal(res);
    var ex = this.ex;
    var baseId = ex.baseId || ex.id;
    var firstTry = !this.failedIds[baseId];
    this.answers.push({ ex: ex, ok: res.ok, almost: res.almost, firstTry: firstTry, given: res.given });
    if (res.ok) {
      this.correct++; this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo);
      if (this.session.timed) this.timeLeft += 1;
      this.hooks.sound('correct'); this.hooks.vibrate(30);
      if (this.combo >= 5 && this.combo % 5 === 0) this.comboPop();
    } else {
      this.combo = 0; this.mistakes++;
      this.failedIds[baseId] = true;
      // réinjection en fin de file
      var clone = Object.assign({}, ex, { id: baseId + '-r' + this.mistakes, baseId: baseId });
      this.queue.push(clone);
      this.hooks.sound('wrong'); this.hooks.vibrate([60, 40, 60]);
      this.hooks.onMistake && this.hooks.onMistake(ex);
    }
    this.renderStatus();
    this.renderFeedback(res);
    if (window.FX) { if (res.ok) FX.correct(this.root); else FX.wrong(this.root, !!res.heartLost); }
    return res;
  };
  function removeComboPops() { qsa(document.body, '.combo-pop').forEach(function (p) { if (p.parentNode) p.parentNode.removeChild(p); }); }
  Player.prototype.comboPop = function () {
    if (this.index >= this.queue.length - 1) return; // dernier exercice : le récap arrive, pas de pop par-dessus
    removeComboPops();
    var p = el('<div class="combo-pop"><span class="emoji">🔥</span> Combo ×' + this.combo + '</div>');
    document.body.appendChild(p); this.hooks.sound('combo'); if (window.FX) FX.combo(this.root); setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 1300);
  };
  Player.prototype.renderFeedback = function (res) {
    var ex = this.ex, cls = res.ok ? 'ok' : 'ko', title, body = '';
    if (res.ok && res.almost) { title = 'Presque ! Attention à l\'orthographe'; body = '<div class="fb-answer">Bonne réponse : <b>' + esc(res.match) + '</b></div>'; }
    else if (res.ok) { title = rand(PRAISE); if (ex.hint && (ex.type === 'listen_type' || ex.type === 'listen_word')) body = '<div class="fb-answer">' + esc(ex.hint) + '</div>'; }
    else { title = rand(OOPS); body = '<div class="fb-answer">Bonne réponse : <b>' + esc(res.match || ex.answer) + '</b></div>' + (ex.note ? '<div class="fb-note">💡 ' + esc(ex.note) + '</div>' : ''); }
    // réécouter la phrase (ou le mot) en anglais après avoir répondu
    var enText = ex.sentence ? ex.sentence.en : (ex.word ? ex.word.en : ''), hear = enText && this.hooks.ttsAvailable() ? UI.speakBtn(enText, 'fb-say') : '';
    this.fbEl.innerHTML = '<div class="feedback ' + cls + '" role="alert"><div class="fb-inner"><div class="fb-head grow"><div class="fb-icon">' + (res.ok ? icon('check') : icon('close')) + '</div><div class="grow"><h3>' + title + '</h3>' + body + '</div>' + hear + '</div><button class="btn btn-block" data-action="lesson-continue">Continuer</button></div></div>';
    reserveFeedbackSpace(this.root, this.fbEl);
    var btn = this.fbEl.querySelector('.btn'); if (btn && window.innerWidth >= 700) try { btn.focus(); } catch (e) { /* ignore */ }
  };
  // Le bandeau recouvre le bas de l'écran : on réserve sa hauteur sous le contenu pour pouvoir
  // faire défiler jusqu'à la réponse révélée (et on y amène la vue si elle est cachée).
  function reserveFeedbackSpace(root, fbEl) {
    var body = root.querySelector('.screen-body'), fb = fbEl.firstChild; if (!body) return;
    if (!fb) { body.style.paddingBottom = ''; return; }
    var h = fb.offsetHeight || 0;
    body.style.paddingBottom = (h + 16) + 'px';
    var target = body.querySelector('.correct, .type-input, .bank-answer');
    // haut du bandeau une fois son animation d'entrée terminée (il glisse depuis le bas : pas de getBoundingClientRect)
    var fbTop = root.querySelector('.screen').getBoundingClientRect().bottom - h;
    if (target) { var tr = target.getBoundingClientRect(); if (tr.bottom > fbTop) body.scrollTop += tr.bottom - fbTop + 12; }
  }
  Player.prototype.next = function () {
    if (this.phase !== 'feedback' || this.destroyed) return;
    var s = this.session;
    this.index++;
    this.show();
  };
  Player.prototype.resume = function () { if (this.phase === 'paused' && !this.destroyed) { this.renderStatus(); this.index++; this.show(); } };
  Player.prototype.skip = function () { // « Passer » = réponse fausse volontaire (comme Duolingo), sans remplir de réponse factice
    if (this.phase !== 'question' || !this.ctrl) return;
    this.check(true);
  };
  Player.prototype.autoAnswer = function (correct) {
    if (this.phase !== 'question' || !this.ctrl) return null;
    this.ctrl.autoFill(correct !== false);
    return this.check();
  };
  Player.prototype.cantListen = function () {
    var self = this;
    this.hooks.onListenOff();
    this.queue = this.queue.map(function (ex, i) { return i >= self.index && /^listen_/.test(ex.type) ? self.hooks.replaceListening(ex) : ex; });
    this.show();
  };
  Player.prototype.onKey = function (e) {
    if (this.destroyed || UI.isModalOpen()) return;
    var tag = (e.target && e.target.tagName) || '';
    var typing = tag === 'TEXTAREA' || tag === 'INPUT';
    if (e.key === 'Enter') { if (this.phase === 'feedback') { e.preventDefault(); this.next(); } else if (this.phase === 'question' && !typing && !this.checkBtn.disabled) { e.preventDefault(); this.check(); } return; }
    if (typing) return;
    if (this.phase !== 'question' || !this.ctrl) return;
    if (/^[1-9]$/.test(e.key) && this.ctrl.selectIndex) { this.ctrl.selectIndex(parseInt(e.key, 10) - 1); }
    else if (e.key === 'Backspace' && this.ctrl.removeLast) { e.preventDefault(); this.ctrl.removeLast(); }
  };
  Player.prototype.finish = function () {
    if (this.phase === 'done') return;
    this.phase = 'done';
    if (this.timer) clearInterval(this.timer);
    var timeMs = Date.now() - this.startTime;
    var firstTryCorrect = this.answers.filter(function (a) { return a.ok && a.firstTry; }).length;
    var result = { kind: this.session.kind, total: this.initialTotal, correct: this.correct, firstTryCorrect: firstTryCorrect, mistakes: this.mistakes, maxCombo: this.maxCombo, timeMs: timeMs, accuracy: this.answers.length ? Math.round(firstTryCorrect / Math.max(1, this.answers.filter(function (a) { return a.firstTry; }).length) * 100) : 100, answers: this.answers, perfect: this.mistakes === 0, session: this.session };
    this.destroy();
    this.hooks.onComplete(result);
  };
  Player.prototype.destroy = function () { this.destroyed = true; if (this.timer) clearInterval(this.timer); document.removeEventListener('keydown', this.keyHandler); removeComboPops(); };

  window.Lesson = { Player: Player, renderers: R, PRAISE: PRAISE, starsFor: starsFor };
})();
