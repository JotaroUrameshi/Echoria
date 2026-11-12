/* Echoria — story.js : lecteur de scènes (visual novel) et lecteur de dialogues (SPEC §5).
   Exposé via window.Story = { Scene, Dialogue, T }. */
(function () {
  'use strict';
  var E = window.Engine, UI = window.UI, C = window.Chars, S = window.Store, L = window.Lesson, esc = UI.esc;
  function qsa(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }
  function reduced() { return window.FX ? window.FX.reduced() : false; }

  // Jetons de texte : {hero} = prénom ; {e} = « e » si le héros est une fille.
  function T(text) {
    var h = S.state.hero;
    return String(text === undefined || text === null ? '' : text).replace(/\{hero\}/g, h.name || 'Wordkeeper').replace(/\{e\}/g, h.gender === 'f' ? 'e' : '');
  }
  function placeOf(id) { var p = (S.CAT.places || {})[id]; return p || { name: '', bg: id }; }
  function moodFromText(t) { return /!/.test(t) ? 'happy' : /\?/.test(t) ? 'surprised' : 'neutral'; }
  // Une réplique sans aucune lettre (« … ») est un silence : pas de voix, pas de traduction.
  function isSilent(t) { return !/[A-Za-zÀ-ÿ0-9]/.test(String(t || '')); }
  function lenClass(t, a, b) { var n = String(t || '').length; return n > b ? ' xlong' : n > a ? ' long' : ''; }
  function actorSvg(who, mood, size) {
    if (who === 'hero') return C.heroSvg(S.state, { size: size, mood: mood });
    if (who === 'pico') return C.picoSvg({ size: Math.round(size * 0.8), mood: mood });
    if (!C.npc(who)) return '<span class="emoji" style="font-size:' + Math.round(size * 0.6) + 'px">🙂</span>';
    return C.npcSvg(who, { size: size, mood: mood });
  }
  function actorName(who) {
    if (who === 'hero') return S.state.hero.name || 'Toi';
    if (who === 'pico') return 'Pico';
    var n = C.npc(who); return n ? n.name : who;
  }

  // Tant que l'enfant n'a jamais touché 🇫🇷, le bouton clignote doucement et Pico le signale une fois par séance.
  var frTipShown = false, FR_TIP = 'Tu ne comprends pas tout ? Touche <span class="emoji">🇫🇷</span> pour voir la phrase en français.';
  function frHintCls(noToast) {
    if (S.state.flags.frSeen) return '';
    if (!frTipShown && !noToast) { frTipShown = true; setTimeout(function () { if (!S.state.flags.frSeen) UI.toast(FR_TIP, '', 4200); }, 900); }
    return ' fr-hint';
  }
  function frUsed(btn) { if (btn) btn.classList.remove('fr-hint'); if (!S.state.flags.frSeen) { S.state.flags.frSeen = true; S.save(); } }

  // ================================================================ SCÈNE
  function Scene(step, ctx) {
    this.step = step; this.ctx = ctx || {}; this.i = -1; this.typing = false; this.destroyed = false; this.leftWho = null; this.heroShown = false; this.timer = null;
  }
  Scene.prototype.mount = function (root) {
    var self = this, place = placeOf(this.step.place); this.root = root;
    root.innerHTML = '<div class="stage scene"><div class="stage-bg">' + C.backdrop(place.bg) + '</div>' +
      '<div class="stage-top"><button class="stage-btn" data-s="quit" aria-label="Quitter la scène">' + UI.icon('close') + '</button><div class="place-tag"><span class="emoji">📍</span> ' + esc(place.name || '') + '</div><button class="stage-skip" data-s="skip">Passer <span aria-hidden="true">»</span></button></div>' +
      '<div class="actors"><div class="actor left" data-role="left"></div><div class="actor right" data-role="right"></div></div>' +
      '<div class="textbox" data-s="next" role="button" tabindex="0" aria-live="polite"><div class="tb-name" data-role="name"></div><div class="tb-text" data-role="text"></div><div class="tb-fr hidden" data-role="fr"></div><div class="tb-tools" data-role="tools"></div><div class="tb-next' + (S.state.stats.scenes === 0 ? ' first' : '') + '" aria-hidden="true">' + (S.state.stats.scenes === 0 ? 'Touche pour continuer ' : '') + '▼</div></div></div>';
    this.el = { left: root.querySelector('[data-role="left"]'), right: root.querySelector('[data-role="right"]'), name: root.querySelector('[data-role="name"]'), text: root.querySelector('[data-role="text"]'), fr: root.querySelector('[data-role="fr"]'), tools: root.querySelector('[data-role="tools"]'), box: root.querySelector('.textbox') };
    this.clickH = function (e) {
      var a = e.target.closest('[data-s]'); if (!a || self.destroyed) return;
      var act = a.getAttribute('data-s');
      if (act === 'quit') { if (self.ctx.onQuit) self.ctx.onQuit(self); }
      else if (act === 'skip') self.finish(true);
      else if (act === 'say') { e.stopPropagation(); S.tts.speak(a.getAttribute('data-text')); }
      else if (act === 'fr') { e.stopPropagation(); self.el.fr.classList.toggle('hidden'); frUsed(a); }
      else if (act === 'next') self.next();
    };
    root.firstChild.addEventListener('click', this.clickH);
    this.keyH = function (e) { if (self.destroyed || UI.isModalOpen()) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); self.next(); } };
    document.addEventListener('keydown', this.keyH);
    this.el.right.innerHTML = actorSvg('hero', 'neutral', 190); this.el.right.classList.add('dim'); this.heroShown = true;
    this.next();
  };
  Scene.prototype.next = function () {
    if (this.destroyed) return;
    if (this.typing) { this.finishTyping(); return; }
    this.i++;
    if (this.i >= this.step.lines.length) return this.finish(false);
    S.sound.play('page');
    this.show(this.step.lines[this.i]);
  };
  Scene.prototype.show = function (line) {
    var who = line.who, el = this.el, isNpc = who !== 'narrator' && who !== 'pico' && who !== 'hero';
    var text = T(isNpc ? line.en : line.fr), mood = moodFromText(text), silent = isSilent(text);
    if (silent) { text = '…'; mood = 'neutral'; }
    if (isNpc && silent) isNpc = false;
    el.box.className = 'textbox who-' + (who === 'narrator' ? 'narrator' : who === 'hero' ? 'hero' : who === 'pico' ? 'pico' : isNpc ? 'npc' : 'npc-silent') + (silent ? ' silent' : '') + lenClass(text, isNpc ? 70 : 120, isNpc ? 110 : 165);
    if (who === 'hero') { el.right.innerHTML = actorSvg('hero', mood, 190); this.heroShown = true; }
    else if (who !== 'narrator') { el.left.innerHTML = actorSvg(who, mood, 190); this.leftWho = who; }
    el.left.classList.toggle('on', who !== 'narrator' && who !== 'hero'); el.right.classList.toggle('on', who === 'hero');
    el.left.classList.toggle('dim', !(who !== 'narrator' && who !== 'hero')); el.right.classList.toggle('dim', who !== 'hero');
    if (who !== 'narrator' && window.FX) FX.once(who === 'hero' ? el.right : el.left, 'pop', 400);
    el.name.textContent = who === 'narrator' ? '' : actorName(who);
    el.name.classList.toggle('hidden', who === 'narrator');
    el.text.setAttribute('lang', isNpc ? 'en' : 'fr');
    var help = S.state.settings.frHelp;
    el.fr.textContent = isNpc ? T(line.fr) : '';
    el.fr.classList.toggle('hidden', !(isNpc && help === 'always'));
    el.tools.innerHTML = isNpc ? '<button class="tb-tool" data-s="say" data-text="' + esc(text) + '" aria-label="Réécouter">' + UI.icon('speaker') + '</button>' + (help === 'tap' ? '<button class="tb-tool fr' + frHintCls() + '" data-s="fr" aria-label="Voir la traduction en français"><span class="emoji">🇫🇷</span></button>' : '') : '';
    if (isNpc) S.tts.speak(text);
    el.text.scrollTop = 0;
    this.type(text);
  };
  Scene.prototype.type = function (text) {
    var self = this, el = this.el.text, n = 0;
    clearInterval(this.timer);
    this.full = text;
    if (reduced()) { el.textContent = text; this.typing = false; this.el.box.classList.add('ready'); return; }
    this.typing = true; el.textContent = ''; this.el.box.classList.remove('ready');
    this.timer = setInterval(function () {
      n += 2; el.textContent = text.slice(0, n);
      if (n >= text.length) self.finishTyping();
    }, 24);
  };
  Scene.prototype.finishTyping = function () { clearInterval(this.timer); this.typing = false; this.el.text.textContent = this.full; this.el.box.classList.add('ready'); };
  Scene.prototype.finish = function (skipped) {
    if (this.destroyed) return;
    this.destroy();
    if (this.ctx.onDone) this.ctx.onDone({ skipped: !!skipped, stars: 0 });
  };
  Scene.prototype.destroy = function () { this.destroyed = true; clearInterval(this.timer); document.removeEventListener('keydown', this.keyH); S.tts.stop(); };

  // ================================================================ DIALOGUE
  var HMM = ['Hmm?', 'Sorry?', 'Pardon?', 'What?'];
  function Dialogue(step, ctx) {
    this.step = step; this.ctx = ctx || {}; this.turn = -1; this.mistakes = 0; this.turnMistakes = 0; this.phase = 'ask'; this.destroyed = false; this.ctrl = null; this.timers = [];
    this.npcId = step.npc; this.npc = C.npc(step.npc) || { name: step.npc, look: {} };
  }
  Dialogue.prototype.stars = function () { return L.starsFor(this.mistakes); };
  Dialogue.prototype.later = function (fn, ms) { var self = this; var t = setTimeout(function () { if (!self.destroyed) fn(); }, ms); this.timers.push(t); return t; };
  Dialogue.prototype.mount = function (root) {
    var self = this, place = placeOf(this.step.place); this.root = root;
    root.innerHTML = '<div class="stage dialogue"><div class="stage-bg">' + C.backdrop(place.bg) + '</div>' +
      '<div class="stage-top"><button class="stage-btn" data-d="quit" aria-label="Quitter la conversation">' + UI.icon('close') + '</button><div class="trust" role="progressbar" aria-label="Confiance" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="trust-ico emoji">🤝</span><div class="trust-bar"><span data-role="trust" style="width:0%"></span></div></div><div class="dlg-stars" data-role="stars">' + UI.stars(3, 'mini') + '</div></div>' +
      '<div class="dlg-scene"><div class="npc-bubble" data-role="bubble"></div><div class="dlg-row"><div class="npc-wrap"><div class="npc-portrait" data-role="npc"></div><div class="npc-name">' + esc(this.npc.name) + '</div><div class="npc-hmm hidden" data-role="hmm"></div></div><div class="hero-say hidden" data-role="herosay"></div></div></div>' +
      '<div class="dlg-panel"><div class="dlg-goal"><span class="emoji">🎯</span> ' + esc(T(this.step.goal || 'Réponds en anglais.')) + '</div><div class="dlg-pico hidden" data-role="pico"></div><div class="dlg-task" data-role="task"></div></div></div>';
    var q = function (r) { return root.querySelector('[data-role="' + r + '"]'); };
    this.el = { bubble: q('bubble'), npc: q('npc'), hmm: q('hmm'), herosay: q('herosay'), task: q('task'), pico: q('pico'), trust: q('trust'), stars: q('stars'), panel: root.querySelector('.dlg-panel'), trustWrap: root.querySelector('.trust') };
    this.clickH = function (e) {
      var a = e.target.closest('[data-d]'); if (!a || self.destroyed) return;
      var act = a.getAttribute('data-d');
      if (act === 'quit') { if (self.ctx.onQuit) self.ctx.onQuit(self); }
      else if (act === 'say') S.tts.speak(a.getAttribute('data-text'), a.getAttribute('data-slow') ? { slow: true } : null);
      else if (act === 'fr') { var fr = self.el.bubble.querySelector('.nb-fr'); if (fr) fr.classList.toggle('hidden'); frUsed(a); }
      else if (act === 'opt') { if (!a.disabled && self.phase === 'ask') self.onOption(parseInt(a.getAttribute('data-i'), 10), a); }
      else if (act === 'check') self.checkBuilt();
      else if (act === 'continue') self.advance();
    };
    root.firstChild.addEventListener('click', this.clickH);
    this.keyH = function (e) {
      if (self.destroyed || UI.isModalOpen()) return;
      var typing = e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT');
      if (e.key === 'Enter') { e.preventDefault(); if (self.phase === 'feedback') self.advance(); else if (self.ctrl) self.checkBuilt(); }
      else if (!typing && /^[1-3]$/.test(e.key) && self.phase === 'ask') { var b = self.el.task.querySelectorAll('[data-d="opt"]')[parseInt(e.key, 10) - 1]; if (b) b.click(); }
    };
    document.addEventListener('keydown', this.keyH);
    this.setNpc('neutral');
    this.nextTurn();
  };
  Dialogue.prototype.setNpc = function (mood) { this.el.npc.innerHTML = actorSvg(this.npcId, mood, 200); };
  Dialogue.isSilent = isSilent;
  Dialogue.prototype.npcSay = function (line, speak) {
    var help = S.state.settings.frHelp, en = T(line.en), fr = T(line.fr);
    var silent = isSilent(en);
    if (silent) this.el.bubble.innerHTML = '<div class="nb-body"><div class="nb-en silent">…</div></div>';
    else this.el.bubble.innerHTML = '<button class="nb-say" data-d="say" data-text="' + esc(en) + '" aria-label="Réécouter">' + UI.icon('speaker') + '</button><div class="nb-body"><div class="nb-en' + lenClass(en, 56, 88) + '" lang="en">' + esc(en) + '</div><div class="nb-fr' + (help === 'always' ? '' : ' hidden') + '">' + esc(fr) + '</div></div>' + (help === 'tap' ? '<button class="nb-frbtn' + frHintCls(true) + '" data-d="fr" aria-label="Voir la traduction en français"><span class="emoji">🇫🇷</span></button>' : '');
    if (window.FX) FX.once(this.el.bubble, 'pop', 400);
    if (speak !== false && !silent) S.tts.speak(en, speak === 'queue' ? { queue: true } : null);
  };
  Dialogue.prototype.nextTurn = function () {
    this.turn++; this.turnMistakes = 0; this.ctrl = null;
    if (this.turn >= this.step.turns.length) return this.finish();
    var t = this.step.turns[this.turn];
    this.phase = 'ask';
    this.el.herosay.classList.add('hidden'); this.el.pico.classList.add('hidden'); this.el.hmm.classList.add('hidden'); this.el.panel.classList.remove('has-pico');
    this.setNpc(moodFromText(t.npc.en) === 'happy' ? 'happy' : 'neutral');
    this.npcSay(t.npc);
    this.renderTask(t.task);
    if (this.turn === 0 && !frTipShown && !S.state.flags.frSeen && S.state.settings.frHelp === 'tap' && !isSilent(T(t.npc.en))) {
      frTipShown = true;
      this.el.pico.className = 'dlg-pico tip'; this.el.pico.innerHTML = C.pico({ size: 56, mood: 'happy' }) + '<div class="dp-text"><b>Pico :</b> ' + FR_TIP + '</div>';
    }
    this.el.panel.scrollTop = 0;
  };
  // ---------------------------------------------------------------- rendu de la tâche
  Dialogue.prototype.renderTask = function (task) {
    var self = this, el = this.el.task, k = task.kind, h = '';
    if (k === 'type' && !S.typingOn(this.ctx.chapter ? this.ctx.chapter.id : S.currentChapterId())) { // réglage « écriture » désactivé → banque de mots
      var inAns = {}, pool = []; E.wordsOf(T(task.en)).forEach(function (w) { inAns[E.normalize(w)] = 1; });
      this.step.turns.forEach(function (t) { var src = [t.npc && t.npc.en, t.after && t.after.en, t.task.en].concat((t.task.options || []).map(function (o) { return o && o.en; })); src.forEach(function (x) { if (typeof x === 'string') E.wordsOf(T(x)).forEach(function (w) { if (!inAns[E.normalize(w)] && w.length > 1) pool.push(w.toLowerCase()); }); }); });
      task = { kind: 'bank', fr: task.fr, en: task.en, alts: task.alts, extra: E.pickN(E.uniqueBy(pool, function (w) { return w; }), 3, Math.random) }; k = 'bank';
    }
    this.task = task; this.kind = k;
    if (k === 'choice') {
      this.order = E.shuffle(task.options.map(function (o, i) { return i; }), Math.random);
      this.correctPos = this.order.findIndex(function (i) { return task.options[i].ok; });
      h = '<div class="task-q">Que réponds-tu ?</div><div class="replies">' + this.order.map(function (oi, p) { return '<button class="reply" data-d="opt" data-i="' + p + '" lang="en"><span class="reply-n">' + (p + 1) + '</span><span class="grow">' + esc(T(task.options[oi].en)) + '</span></button>'; }).join('') + '</div>';
    } else if (k === 'meaning') {
      this.order = E.shuffle(task.options.map(function (o, i) { return i; }), Math.random);
      this.correctPos = this.order.indexOf(task.answer);
      h = '<div class="task-q"><span class="emoji">🤔</span> ' + esc(T(task.q)) + '</div><div class="replies">' + this.order.map(function (oi, p) { return '<button class="reply fr" data-d="opt" data-i="' + p + '"><span class="reply-n">' + (p + 1) + '</span><span class="grow">' + esc(T(task.options[oi])) + '</span></button>'; }).join('') + '</div>';
    } else if (k === 'blank') {
      var en = T(task.en), re = new RegExp('(^|[^A-Za-z\'’])(' + String(task.blank).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?![A-Za-z\'’])'), m = re.exec(en) || new RegExp(String(task.blank).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').exec(en);
      var start = m ? (m.length > 2 ? m.index + m[1].length : m.index) : 0, len = m ? (m.length > 2 ? m[2].length : m[0].length) : 0;
      this.words = E.shuffle([task.blank].concat((task.distractors || []).slice(0, 3)), Math.random);
      this.correctPos = this.words.indexOf(task.blank);
      h = '<div class="task-q">Complète ta réponse :</div><div class="fill-sentence" lang="en">' + esc(en.slice(0, start)) + '<span class="gap" data-role="gap">&nbsp;</span>' + esc(en.slice(start + len)) + '</div><div class="fill-hint">' + esc(T(task.fr)) + '</div><div class="fill-options">' + this.words.map(function (w, p) { return '<button class="tile" data-d="opt" data-i="' + p + '" lang="en">' + esc(w) + '</button>'; }).join('') + '</div>';
    } else if (k === 'bank' || k === 'type') {
      var answer = T(task.en), accepted = [answer].concat((task.alts || []).map(T));
      var lctx = {
        tts: S.tts.available(), speak: function (t) { S.tts.speak(t); }, sound: function (n) { S.sound.play(n); }, vibrate: S.vibrate, isNewWord: function () { return false; },
        onReady: function (ok) { var b = el.querySelector('[data-d="check"]'); if (b) { var was = b.disabled; b.disabled = !ok; if (ok && was) { try { var pr = b.getBoundingClientRect(), pp = self.el.panel.getBoundingClientRect(); if (pr.bottom > pp.bottom - 4) self.el.panel.scrollBy({ top: pr.bottom - pp.bottom + 12, behavior: 'smooth' }); } catch (e) { /* ignore */ } } } }, locked: function () { return self.phase !== 'ask'; },
        enter: function () { self.checkBuilt(); }, autoCheck: function () {}
      };
      if (k === 'bank') {
        var tokens = E.wordsOf(answer), ex = { type: 'translate_bank', id: 'dlg-bank-' + this.turn, prompt: '', source: '', tokens: E.shuffle(tokens.concat((task.extra || []).map(T)), Math.random), answerTokens: tokens, accepted: accepted, answer: answer };
        this.ctrl = L.renderers.translate_bank(ex, lctx);
        h = '<div class="task-q">' + esc(T(task.fr)) + '</div><div class="bank-answer" data-role="answer" aria-label="Ta réponse" lang="en"></div><div class="bank" data-role="bank" lang="en">' + ex.tokens.map(function (t, i) { return '<button class="tile" data-tok="' + i + '">' + esc(t) + '</button>'; }).join('') + '</div><button class="btn btn-green btn-block dlg-check" data-d="check" disabled>Dire ma phrase</button>';
      } else {
        var ext = { type: 'translate_type', id: 'dlg-type-' + this.turn, prompt: '', source: '', dir: 'en', lang: 'en', accepted: accepted, answer: answer };
        this.ctrl = L.renderers.translate_type(ext, lctx);
        h = '<div class="task-q">' + esc(T(task.fr)) + '</div><textarea class="type-input" rows="2" placeholder="Écris ta réponse en anglais" aria-label="Ta réponse" autocapitalize="sentences" autocomplete="off" spellcheck="false" lang="en"></textarea><button class="btn btn-green btn-block dlg-check" data-d="check" disabled>Dire ma phrase</button>';
      }
    }
    el.innerHTML = h;
    if (this.ctrl) this.ctrl.mount(el);
    if (window.FX) FX.retrigger(el, 'fx-task-in');
  };
  // ---------------------------------------------------------------- réponses
  Dialogue.prototype.onOption = function (pos, btn) {
    var task = this.task, ok = pos === this.correctPos, why = '', said = '';
    if (this.kind === 'choice') { var opt = task.options[this.order[pos]]; why = opt.why ? T(opt.why) : ''; said = T(task.options[this.order[this.correctPos]].en); }
    else if (this.kind === 'meaning') { var npc = this.step.turns[this.turn].npc; why = 'Écoute encore : « ' + T(npc.en) + ' » veut dire « ' + T(npc.fr) + ' ».'; }
    else if (this.kind === 'blank') {
      var gap = this.el.task.querySelector('[data-role="gap"]'); if (gap) { gap.textContent = this.words[pos]; gap.classList.add('filled'); gap.classList.toggle('wrong', !ok); gap.classList.toggle('correct', ok); }
      why = 'Tu veux dire : « ' + T(task.fr) + ' » Essaie un autre mot !'; said = T(task.en);
    }
    if (ok) { btn.classList.add('correct'); this.right(said, this.kind === 'meaning' ? T(task.options[task.answer]) : (this.kind === 'blank' ? T(task.fr) : '')); }
    else { btn.classList.add('wrong'); btn.disabled = true; this.wrong(why); }
  };
  Dialogue.prototype.checkBuilt = function () {
    if (this.phase !== 'ask' || !this.ctrl || !this.ctrl.ready()) return;
    var task = this.task, res = this.ctrl.check(), answer = T(task.en);
    if (res.ok) this.right(res.match || answer, frOf(T(task.fr)), res.almost);
    else {
      var zone = this.el.task.querySelector('.bank-answer, .type-input'); if (zone && window.FX) FX.once(zone, 'shake', 500);
      this.wrong(this.kind === 'bank' ? 'Presque ! La bonne phrase : « ' + answer + ' » Remets les mots dans l\'ordre.' : 'Presque ! La bonne phrase : « ' + answer + ' » Recopie-la bien.');
    }
  };
  // « Accepte poliment : « Oui, s'il te plaît. » » → « Oui, s'il te plaît. »
  function frOf(instr) { var m = /«\s*([^»]+?)\s*»/.exec(instr || ''); return m ? m[1] : (instr || ''); }
  Dialogue.prototype.wrong = function (why) {
    if (this.turnMistakes === 0) { S.recordTask(this.kind, false); }
    this.mistakes++; this.turnMistakes++;
    S.sound.play('wrong'); S.vibrate([60, 40, 60]);
    this.setNpc('surprised');
    this.el.hmm.textContent = HMM[(this.mistakes - 1) % HMM.length]; this.el.hmm.classList.remove('hidden'); if (window.FX) FX.once(this.el.hmm, 'pop', 400);
    this.el.stars.innerHTML = UI.stars(this.stars(), 'mini');
    this.el.pico.className = 'dlg-pico';
    this.el.pico.innerHTML = C.pico({ size: 64, mood: 'think' }) + '<div class="dp-text"><b>Pico :</b> ' + esc(why || 'Pas tout à fait. Essaie encore !') + '</div>';
    this.el.pico.classList.remove('hidden'); this.el.panel.classList.add('has-pico'); if (window.FX) FX.once(this.el.pico, 'pop', 400);
    this.el.panel.scrollTop = 0;
    S.save();
  };
  Dialogue.prototype.right = function (said, fr, almost) {
    var self = this, t = this.step.turns[this.turn], n = this.step.turns.length;
    if (this.turnMistakes === 0) S.recordTask(this.kind, true);
    this.phase = 'feedback';
    S.sound.play('correct'); S.vibrate(30);
    this.setNpc('happy');
    this.el.hmm.classList.add('hidden'); this.el.pico.classList.add('hidden'); this.el.panel.classList.remove('has-pico');
    var pct = Math.round((this.turn + 1) / n * 100);
    this.el.trust.style.width = pct + '%'; this.el.trustWrap.setAttribute('aria-valuenow', pct);
    if (window.FX) { FX.once(this.el.trustWrap, 'bump', 500); FX.burstAt(this.el.npc, { count: 12, spread: 80, stars: true }); }
    if (said) {
      this.el.herosay.innerHTML = '<div class="hs-bubble"><button class="hs-say" data-d="say" data-text="' + esc(said) + '" aria-label="Réécouter ma phrase">' + UI.icon('speaker') + '</button><div class="hs-en" lang="en">' + esc(said) + '</div>' + (almost ? '<div class="hs-note">Attention à l\'orthographe !</div>' : '') + '</div><div class="hs-face">' + C.heroSvg(S.state, { size: 84, bust: true, mood: 'happy', weapon: null }) + '</div>';
      S.tts.speak(said);
      S.addPhrase(said, fr || '', this.ctx.chapter && this.ctx.chapter.id);
    } else {
      this.el.herosay.innerHTML = '<div class="hs-bubble ok"><span class="emoji">💡</span> Tu as compris : « ' + esc(fr) + ' »</div><div class="hs-face">' + C.heroSvg(S.state, { size: 84, bust: true, mood: 'happy', weapon: null }) + '</div>';
    }
    this.el.herosay.classList.remove('hidden'); if (window.FX) FX.once(this.el.herosay, 'pop', 400);
    var last = this.turn >= n - 1;
    this.el.task.innerHTML = '<div class="dlg-ok"><span class="emoji">' + (last ? '🎉' : '✅') + '</span> ' + esc(L.PRAISE[Math.floor(Math.random() * L.PRAISE.length)]) + '</div><button class="btn btn-green btn-block" data-d="continue">' + (last ? 'Terminer la conversation' : 'Continuer') + '</button>';
    this.ctrl = null;
    if (t.after) this.afterTimer = this.later(function () { self.afterShown = true; self.npcSay(t.after, said ? 'queue' : true); }, reduced() ? 0 : 900);
    S.save();
  };
  Dialogue.prototype.advance = function () {
    if (this.phase !== 'feedback' || this.destroyed) return;
    clearTimeout(this.afterTimer); this.afterShown = false;
    S.tts.stop();
    this.nextTurn();
  };
  Dialogue.prototype.finish = function () {
    if (this.destroyed) return;
    this.phase = 'done';
    var res = { stars: this.stars(), mistakes: this.mistakes, turns: this.step.turns.length };
    this.destroy();
    if (this.ctx.onDone) this.ctx.onDone(res);
  };
  // Pour les tests : répond au tour courant en passant par l'interface (clics réels sur les éléments).
  Dialogue.prototype.autoAnswer = function (correct) {
    if (this.phase !== 'ask') return false;
    var el = this.el.task;
    if (this.kind === 'choice' || this.kind === 'meaning' || this.kind === 'blank') {
      var btns = qsa(el, '[data-d="opt"]'), target = null, cp = this.correctPos;
      if (correct !== false) target = btns[cp]; else target = btns.filter(function (b, i) { return i !== cp && !b.disabled; })[0];
      if (!target) return false;
      target.click(); return true;
    }
    if (this.ctrl) { this.ctrl.autoFill(correct !== false); el.querySelector('[data-d="check"]').click(); return true; }
    return false;
  };
  Dialogue.prototype.destroy = function () { this.destroyed = true; this.timers.forEach(clearTimeout); document.removeEventListener('keydown', this.keyH); S.tts.stop(); };

  window.Story = { Scene: Scene, Dialogue: Dialogue, T: T, actorSvg: actorSvg, actorName: actorName, placeOf: placeOf };
})();
