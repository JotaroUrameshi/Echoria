/* Echoria — engine.js : fonctions pures reprises de Parlo (normalisation, comparaison tolérante,
   génération d exercices, force des mots, série de jours). Exposé via window.Engine. Aucune dépendance au DOM. */
(function () {
  'use strict';

  var DAY = 86400000;
  var STRENGTH_DECAY_MS = 3 * DAY;

  // ---------------------------------------------------------------- utils
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function hashString(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rngFrom(seed) {
    if (typeof seed === 'function') return seed;
    if (seed === undefined || seed === null) seed = Math.random() * 1e9;
    return mulberry32(typeof seed === 'number' ? seed : hashString(String(seed)));
  }
  function shuffle(arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function pickN(arr, n, rng) { return shuffle(arr, rng).slice(0, n); }
  function randInt(rng, min, max) { return min + Math.floor(rng() * (max - min + 1)); }
  function uniqueBy(arr, keyFn) {
    var seen = {}; var out = [];
    for (var i = 0; i < arr.length; i++) { var k = keyFn(arr[i]); if (!seen[k]) { seen[k] = true; out.push(arr[i]); } }
    return out;
  }
  function flat(arrs) { return [].concat.apply([], arrs); }

  // ------------------------------------------------- normalisation / comparaison
  function normalize(s) {
    if (s === null || s === undefined) return '';
    return String(s).toLowerCase()
      .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[’‘`´]/g, "'")
      .replace(/'/g, '')
      .replace(/[.,!?;:"«»\-–—()…]/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    var prev = new Array(b.length + 1), cur = new Array(b.length + 1), i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur[0] = i;
      for (j = 1; j <= b.length; j++) {
        var cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      }
      var tmp = prev; prev = cur; cur = tmp;
    }
    return prev[b.length];
  }
  // Retourne { ok, almost, match } ; opts.blank = mot qui doit être exact ; opts.exact = aucune tolérance (banque de mots).
  function compare(answer, accepted, opts) {
    opts = opts || {};
    var na = normalize(answer);
    var list = (Array.isArray(accepted) ? accepted : [accepted]).filter(Boolean);
    if (!na) return { ok: false, almost: false, match: list[0] || '' };
    var i;
    for (i = 0; i < list.length; i++) if (normalize(list[i]) === na) return { ok: true, almost: false, match: list[i] };
    if (!opts.exact && na.length >= 5) {
      for (i = 0; i < list.length; i++) {
        var nb = normalize(list[i]);
        if (nb.length >= 5 && levenshtein(na, nb) <= 1) {
          if (opts.blank) {
            var wa = na.split(' '), wb = nb.split(' '), nblank = normalize(opts.blank);
            if (wa.length === wb.length) {
              for (var k = 0; k < wb.length; k++) if (wa[k] !== wb[k] && wb[k] === nblank) return { ok: false, almost: false, match: list[0], blankError: true };
            }
          }
          return { ok: true, almost: true, match: list[i] };
        }
      }
    }
    return { ok: false, almost: false, match: list[0] || '' };
  }

  // ---------------------------------------------------------------- cours
  function unitNum(id) { var m = /\d+/.exec(String(id || '')); return m ? parseInt(m[0], 10) : 0; }
  function indexCourse(course) {
    course = course || { sections: [], units: [] };
    var units = (course.units || []).slice().sort(function (a, b) { return unitNum(a.id) - unitNum(b.id); });
    var unitById = {}, lessonById = {}, unitOfLesson = {}, unitIndex = {};
    units.forEach(function (u, i) {
      unitById[u.id] = u; unitIndex[u.id] = i;
      (u.lessons || []).forEach(function (l) { lessonById[l.id] = l; unitOfLesson[l.id] = u; });
    });
    var sections = [];
    var placed = {};
    (course.sections || []).forEach(function (s) {
      var us = (s.units || []).map(function (id) { return unitById[id]; }).filter(Boolean);
      us.forEach(function (u) { placed[u.id] = true; });
      if (us.length) sections.push({ section: s, units: us });
    });
    var orphans = units.filter(function (u) { return !placed[u.id]; });
    if (orphans.length) sections.push({ section: { id: 'sx', title: 'Autres unités', cefr: orphans[0].cefr || '', description: '' }, units: orphans });
    var allVocab = flat(units.map(function (u) { return unitVocab(u); }));
    return { course: course, units: units, unitById: unitById, lessonById: lessonById, unitOfLesson: unitOfLesson, unitIndex: unitIndex, sections: sections, allVocab: allVocab };
  }
  function unitVocab(unit) {
    return flat((unit.lessons || []).map(function (l) { return (l.vocab || []).map(function (v) { return withMeta(v, unit, l); }); }));
  }
  function unitSentences(unit) {
    return flat((unit.lessons || []).map(function (l) { return (l.sentences || []).map(function (s) { return withMeta(s, unit, l); }); }));
  }
  function withMeta(item, unit, lesson) {
    if (item._unit === unit.id && item._lesson === lesson.id) return item;
    var o = Object.assign({}, item); o._unit = unit.id; o._lesson = lesson.id; return o;
  }
  function wordsOf(en) { return String(en || '').replace(/[.,!?;:"«»()…]/g, ' ').split(/\s+/).filter(Boolean); }
  // Clés d'une traduction FR : « bon / bien », « le/la collègue », « il / elle / ce (chose) » → ['bon','bien'], ['collegue'], ['il','elle','ce','chose'].
  // Sert à éviter les distracteurs/paires ambigus (deux mots EN partageant une même traduction FR).
  var FR_ARTICLES = { le: 1, la: 1, les: 1, l: 1, un: 1, une: 1, des: 1, du: 1, de: 1, d: 1, a: 1, au: 1, aux: 1, se: 1, s: 1 };
  function frKeys(fr) {
    return String(fr || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘`´']/g, ' ')
      .split(/[\/,;()]+/).map(function (seg) {
        var w = seg.replace(/[.!?:"«»\-–—…]/g, ' ').split(/\s+/).filter(Boolean);
        while (w.length > 1 && FR_ARTICLES[w[0]]) w.shift();
        return w.join(' ');
      }).filter(function (k) { return k && !FR_ARTICLES[k]; });
  }
  function frOverlap(a, b) {
    var ka = frKeys(a), kb = frKeys(b);
    if (!ka.length || !kb.length) return normalize(a) === normalize(b);
    return ka.some(function (k) { return kb.indexOf(k) >= 0; });
  }

  // ------------------------------------------------------------ exercices
  var PROMPTS = {
    select_meaning: 'Que signifie ce mot ?',
    select_image: 'Lequel est…',
    listen_word: "Qu'as-tu entendu ?",
    translate_bank: 'Traduis cette phrase',
    translate_type_en: 'Écris en anglais',
    translate_type_fr: 'Écris en français',
    listen_type: 'Écris ce que tu entends',
    fill_blank: 'Complète la phrase',
    match_pairs: 'Associe les paires'
  };
  var exSeq = 0;
  function newEx(type, data) { data.type = type; data.id = type + '-' + (++exSeq); return data; }

  // Distracteurs sans ambiguïté avec la réponse (clés FR disjointes) ; on relâche la contrainte si le pool est trop petit.
  function strictOthers(word, pool, extraFilter) {
    var base = pool.filter(function (w) { return normalize(w.en) !== normalize(word.en) && normalize(w.fr) !== normalize(word.fr) && (!extraFilter || extraFilter(w)); });
    var strict = base.filter(function (w) { return !frOverlap(w.fr, word.fr); });
    return strict.length >= 3 ? strict : base;
  }
  function exSelectMeaning(word, pool, rng) {
    var others = uniqueBy(strictOthers(word, pool), function (w) { return normalize(w.fr); });
    var distract = pickN(others, 3, rng).map(function (w) { return w.fr; });
    var options = shuffle([word.fr].concat(distract), rng);
    return newEx('select_meaning', { prompt: 'Que signifie « ' + word.en + ' » ?', word: word, options: options, answer: word.fr, tts: word.en, vocab: [word.en] });
  }
  function exSelectImage(word, pool, rng) {
    var others = uniqueBy(uniqueBy(strictOthers(word, pool, function (w) { return w.emoji && w.emoji !== word.emoji; }), function (w) { return normalize(w.en); }), function (w) { return w.emoji; });
    var distract = pickN(others, 3, rng);
    var options = shuffle([word].concat(distract), rng).map(function (w) { return { en: w.en, emoji: w.emoji }; });
    return newEx('select_image', { prompt: 'Lequel est « ' + word.fr + ' » ?', word: word, options: options, answer: word.en, vocab: [word.en] });
  }
  function exListenWord(word, pool, rng) {
    var others = uniqueBy(pool.filter(function (w) { return normalize(w.en) !== normalize(word.en); }), function (w) { return normalize(w.en); });
    var distract = pickN(others, 3, rng).map(function (w) { return w.en; });
    var options = shuffle([word.en].concat(distract), rng);
    return newEx('listen_word', { prompt: PROMPTS.listen_word, word: word, options: options, answer: word.en, tts: word.en, vocab: [word.en], hint: word.fr });
  }
  // Choisit jusqu'à n mots sans doublon EN/FR ni traduction ambiguë, dans l'ordre des candidats.
  function pickPairs(candidates, n) {
    var out = [];
    for (var i = 0; i < candidates.length && out.length < n; i++) {
      var w = candidates[i];
      if (!w || !w.en || !w.fr) continue;
      var clash = out.some(function (o) { return normalize(o.en) === normalize(w.en) || frOverlap(o.fr, w.fr); });
      if (!clash) out.push(w);
    }
    return out;
  }
  function exMatchPairs(words, rng) {
    var pairs = pickPairs(words, 5).map(function (w) { return { en: w.en, fr: w.fr }; });
    return newEx('match_pairs', { prompt: PROMPTS.match_pairs, pairs: pairs, left: shuffle(pairs.map(function (p) { return p.en; }), rng), right: shuffle(pairs.map(function (p) { return p.fr; }), rng), vocab: pairs.map(function (p) { return p.en; }) });
  }
  function exTranslateBank(sentence, otherSentences, rng) {
    var tokens = wordsOf(sentence.en);
    var inAnswer = {}; tokens.forEach(function (t) { inAnswer[normalize(t)] = true; });
    var otherWords = uniqueBy(flat(otherSentences.filter(function (s) { return s !== sentence; }).map(function (s) { return wordsOf(s.en); }))
      .filter(function (w) { return !inAnswer[normalize(w)]; }), function (w) { return normalize(w); });
    var distract = pickN(otherWords, randInt(rng, 3, 5), rng);
    return newEx('translate_bank', { prompt: PROMPTS.translate_bank, sentence: sentence, source: sentence.fr, tokens: shuffle(tokens.concat(distract), rng), answerTokens: tokens, accepted: [sentence.en].concat(sentence.altsEn || []), answer: sentence.en, note: sentence.note, sentenceKey: sentence.en, vocab: [] });
  }
  function exTranslateType(sentence, dir) {
    if (dir === 'fr') {
      return newEx('translate_type', { prompt: PROMPTS.translate_type_fr, dir: 'fr', lang: 'fr', sentence: sentence, source: sentence.en, tts: sentence.en, accepted: [sentence.fr].concat(sentence.altsFr || []), answer: sentence.fr, note: sentence.note, sentenceKey: sentence.en, vocab: [] });
    }
    return newEx('translate_type', { prompt: PROMPTS.translate_type_en, dir: 'en', lang: 'en', sentence: sentence, source: sentence.fr, accepted: [sentence.en].concat(sentence.altsEn || []), answer: sentence.en, blank: sentence.blank, note: sentence.note, sentenceKey: sentence.en, vocab: [] });
  }
  function exListenType(sentence) {
    return newEx('listen_type', { prompt: PROMPTS.listen_type, lang: 'en', sentence: sentence, tts: sentence.en, accepted: [sentence.en].concat(sentence.altsEn || []), answer: sentence.en, blank: sentence.blank, note: sentence.note, hint: sentence.fr, sentenceKey: sentence.en, vocab: [] });
  }
  function findBlank(sentence, rng) {
    var tokens = wordsOf(sentence.en);
    var blank = sentence.blank;
    var idx = -1;
    if (blank) for (var i = 0; i < tokens.length; i++) if (normalize(tokens[i]) === normalize(blank)) { idx = i; break; }
    if (idx < 0) {
      // blank manquant ou introuvable : on choisit le mot le plus long (≥ 3 lettres)
      var best = -1, bestLen = 0;
      for (var j = 0; j < tokens.length; j++) { var L = tokens[j].replace(/'/g, '').length; if (L > bestLen) { bestLen = L; best = j; } }
      idx = best < 0 ? 0 : best;
    }
    return { tokens: tokens, idx: idx, token: tokens[idx] || '' };
  }
  function exFillBlank(sentence, otherSentences, rng) {
    var fb = findBlank(sentence, rng);
    var token = fb.token;
    var nTok = normalize(token);
    var distractors = uniqueBy((sentence.distractors || []).filter(function (d) { return d && normalize(d) !== nTok; }), function (d) { return normalize(d); });
    if (distractors.length < 2) {
      var pool = uniqueBy(flat(otherSentences.filter(function (s) { return s !== sentence; }).map(function (s) { return wordsOf(s.en); }))
        .filter(function (w) { return normalize(w) !== nTok && !distractors.some(function (d) { return normalize(d) === normalize(w); }) && Math.abs(w.length - token.length) <= 3; }), function (w) { return normalize(w); });
      pool = shuffle(pool, rng);
      while (distractors.length < 2 && pool.length) {
        var w = pool.shift();
        // adapte la casse à celle du trou
        if (/^[A-Z]/.test(token)) w = w.charAt(0).toUpperCase() + w.slice(1); else w = w.toLowerCase();
        distractors.push(w);
      }
    }
    distractors = distractors.slice(0, 3);
    // position dans la phrase d'origine
    var re = new RegExp('(^|[^A-Za-z\'’])(' + token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?![A-Za-z\'’])', 'i');
    var m = re.exec(sentence.en);
    var before, after;
    if (m) { var start = m.index + m[1].length; before = sentence.en.slice(0, start); after = sentence.en.slice(start + m[2].length); }
    else { before = fb.tokens.slice(0, fb.idx).join(' ') + (fb.idx ? ' ' : ''); after = (fb.idx < fb.tokens.length - 1 ? ' ' : '') + fb.tokens.slice(fb.idx + 1).join(' '); }
    return newEx('fill_blank', { prompt: PROMPTS.fill_blank, sentence: sentence, before: before, after: after, options: shuffle([token].concat(distractors), rng), answer: token, hint: sentence.fr, note: sentence.note, tts: sentence.en, sentenceKey: sentence.en, vocab: [] });
  }

  // Remplace un exercice d'écoute par un équivalent sans audio (même item).
  function replaceListening(ex, course, opts) {
    opts = opts || {};
    var idx = indexCourse(course);
    var rng = rngFrom(opts.seed);
    if (ex.type === 'listen_word') {
      var unit = idx.unitById[ex.word && ex.word._unit];
      var pool = unit ? unitVocab(unit) : idx.allVocab;
      if (pool.length < 4) pool = idx.allVocab;
      return ex.word.emoji && pool.filter(function (w) { return w.emoji; }).length >= 4 && rng() < 0.5 ? exSelectImage(ex.word, pool, rng) : exSelectMeaning(ex.word, pool, rng);
    }
    if (ex.type === 'listen_type') {
      var u2 = idx.unitById[ex.sentence && ex.sentence._unit];
      var spool = u2 ? unitSentences(u2) : [];
      return opts.typing === false ? exTranslateBank(ex.sentence, spool, rng) : exTranslateType(ex.sentence, 'en');
    }
    return ex;
  }

  // Plan de types selon le niveau (12 créneaux)
  function typePlan(level, count) {
    var base;
    if (level <= 1) base = ['select_image', 'select_meaning', 'select_image', 'select_meaning', 'listen_word', 'match_pairs', 'fill_blank', 'fill_blank', 'fill_blank', 'translate_bank', 'translate_bank', 'translate_bank'];
    else if (level === 2) base = ['select_image', 'select_meaning', 'listen_word', 'match_pairs', 'fill_blank', 'fill_blank', 'translate_bank', 'translate_bank', 'translate_bank', 'translate_type', 'translate_type', 'listen_type'];
    else if (level === 3) base = ['select_image', 'listen_word', 'match_pairs', 'fill_blank', 'fill_blank', 'translate_bank', 'translate_bank', 'translate_type', 'translate_type', 'translate_type', 'listen_type', 'listen_type'];
    else base = ['select_meaning', 'match_pairs', 'fill_blank', 'translate_bank', 'translate_bank', 'translate_type', 'translate_type', 'translate_type', 'translate_type', 'listen_type', 'listen_type', 'listen_type'];
    var out = [];
    while (out.length < count) out = out.concat(base);
    return out.slice(0, count);
  }
  function substituteTypes(plan, opts, hasEmoji, hasSentences, hasVocab) {
    var alt = 0;
    return plan.map(function (t) {
      if (t === 'listen_word' && !opts.tts) t = 'select_meaning';
      if (t === 'listen_type' && !opts.tts) t = opts.typing ? 'translate_type' : 'translate_bank';
      // saisie désactivée : « listen_type » et « translate_type » demandent de taper → on alterne les remplaçants
      if (t === 'listen_type' && !opts.typing) t = (alt++ % 2) ? 'listen_word' : 'translate_bank';
      if (t === 'translate_type' && !opts.typing) t = (alt++ % 2) ? 'fill_blank' : 'translate_bank';
      if (t === 'select_image' && !hasEmoji) t = 'select_meaning';
      if (!hasSentences && (t === 'fill_blank' || t === 'translate_bank' || t === 'translate_type' || t === 'listen_type')) t = hasVocab ? 'select_meaning' : t;
      if (!hasVocab && (t === 'select_meaning' || t === 'select_image' || t === 'listen_word' || t === 'match_pairs')) t = hasSentences ? 'fill_blank' : t;
      return t;
    });
  }
  // Évite deux fois le même type d'affilée (quand c'est possible) : glouton par type le plus fréquent,
  // comme pour « réorganiser une chaîne » — garantit zéro répétition dès que le type majoritaire ≤ ⌈n/2⌉.
  function arrangeNoRepeat(exs, rng) {
    var groups = {};
    shuffle(exs, rng).forEach(function (e) { (groups[e.type] = groups[e.type] || []).push(e); });
    var types = Object.keys(groups);
    var out = [], prev = null;
    while (out.length < exs.length) {
      var best = null, bestN = -1;
      var order = shuffle(types, rng);
      for (var i = 0; i < order.length; i++) {
        var t = order[i], n = groups[t].length;
        if (!n || t === prev) continue;
        if (t === 'match_pairs' && !out.length && types.length > 1) continue; // pas de paires en premier
        if (n > bestN) { bestN = n; best = t; }
      }
      if (!best) { for (var k = 0; k < types.length; k++) if (groups[types[k]].length) { best = types[k]; break; } }
      out.push(groups[best].shift()); prev = best;
    }
    return out;
  }

  // Cycle d'items : chaque item est servi une fois avant d'être resservi.
  function cycler(items, rng) {
    var queue = shuffle(items, rng); var used = [];
    return function (filterFn) {
      for (var round = 0; round < 2; round++) {
        for (var i = 0; i < queue.length; i++) { if (!filterFn || filterFn(queue[i])) { var it = queue.splice(i, 1)[0]; used.push(it); if (!queue.length) { queue = shuffle(used, rng); used = []; } return it; } }
        if (!queue.length) break;
        queue = shuffle(used.concat(queue), rng); used = [];
      }
      return items[Math.floor(rng() * items.length)];
    };
  }

  // Construit un jeu d'exercices à partir de pools.
  function buildSet(cfg) {
    var rng = cfg.rng;
    var opts = Object.assign({ tts: true, typing: true }, cfg.opts || {});
    var vocab = cfg.vocab || [], sentences = cfg.sentences || [];
    var vocabPool = (cfg.vocabPool && cfg.vocabPool.length >= 4 ? cfg.vocabPool : vocab);
    var sentPool = (cfg.sentencePool && cfg.sentencePool.length ? cfg.sentencePool : sentences);
    var hasEmoji = vocab.filter(function (v) { return v.emoji; }).length >= 1 && vocabPool.filter(function (v) { return v.emoji; }).length >= 4;
    var plan = substituteTypes(cfg.plan, opts, hasEmoji, sentences.length > 0, vocab.length > 0);
    var nextVocab = cycler(vocab.length ? vocab : vocabPool, rng);
    var nextSentence = cycler(sentences.length ? sentences : sentPool, rng);
    var out = [];
    var level = cfg.level || 1;
    plan.forEach(function (type, i) {
      var w, s;
      switch (type) {
        case 'select_meaning': w = nextVocab(); if (!w) return; out.push(exSelectMeaning(w, vocabPool, rng)); break;
        case 'select_image': w = nextVocab(function (v) { return !!v.emoji; }); if (!w || !w.emoji) { w = w || nextVocab(); if (!w) return; out.push(exSelectMeaning(w, vocabPool, rng)); break; } out.push(exSelectImage(w, vocabPool, rng)); break;
        case 'listen_word': w = nextVocab(); if (!w) return; out.push(exListenWord(w, vocabPool, rng)); break;
        case 'match_pairs': {
          // candidats : vocabulaire de la leçon d'abord, puis le reste de l'unité (sans doublon ni traduction ambiguë)
          var src = vocab.length >= 5 ? vocab : vocabPool;
          var chosen = pickPairs(shuffle(src, rng).concat(shuffle(vocabPool, rng)), 5);
          if (chosen.length < 2) return;
          out.push(exMatchPairs(chosen, rng)); break;
        }
        case 'translate_bank': s = nextSentence(); if (!s) return; out.push(exTranslateBank(s, sentPool, rng)); break;
        case 'translate_type': {
          s = nextSentence(); if (!s) return;
          var dir = (level >= 3 ? rng() < 0.65 : rng() < 0.4) ? 'en' : 'fr';
          out.push(exTranslateType(s, dir)); break;
        }
        case 'listen_type': s = nextSentence(); if (!s) return; out.push(exListenType(s)); break;
        case 'fill_blank': s = nextSentence(); if (!s) return; out.push(exFillBlank(s, sentPool, rng)); break;
      }
    });
    return cfg.keepOrder ? out : arrangeNoRepeat(out, rng);
  }

  function generateLesson(course, lessonId, level, opts) {
    opts = opts || {};
    var idx = indexCourse(course);
    var lesson = idx.lessonById[lessonId];
    if (!lesson) return [];
    var unit = idx.unitOfLesson[lessonId];
    var rng = rngFrom(opts.seed);
    var count = opts.count || 12;
    level = Math.max(1, level || 1);
    var li = unit.lessons.indexOf(lesson);
    var vocab = (lesson.vocab || []).map(function (v) { return withMeta(v, unit, lesson); });
    var sentences = (lesson.sentences || []).map(function (s) { return withMeta(s, unit, lesson); });
    if (level >= 2 && li > 0) {
      var earlier = unit.lessons.slice(0, li);
      var rv = flat(earlier.map(function (l) { return (l.vocab || []).map(function (v) { return withMeta(v, unit, l); }); }));
      var rs = flat(earlier.map(function (l) { return (l.sentences || []).map(function (s) { return withMeta(s, unit, l); }); }));
      vocab = vocab.concat(pickN(rv, Math.min(3, rv.length), rng));
      sentences = sentences.concat(pickN(rs, Math.min(2, rs.length), rng));
    }
    var vocabPool = unitVocab(unit);
    if (vocabPool.length < 8) vocabPool = vocabPool.concat(idx.allVocab);
    return buildSet({ rng: rng, opts: opts, level: level, vocab: vocab, sentences: sentences, vocabPool: vocabPool, sentencePool: unitSentences(unit), plan: typePlan(level, count) });
  }

  // Pratique : mode = 'mistakes' | 'weak' | 'random' | 'timed'
  function generatePractice(course, mode, state, opts) {
    opts = opts || {};
    var idx = indexCourse(course);
    var rng = rngFrom(opts.seed);
    var now = opts.now || Date.now();
    var count = opts.count || 10;
    // Echoria : on révise uniquement les leçons déjà faites au moins une fois.
    var unlockedLessons = idx.units.map(function (u) { return u.lessons.filter(function (l) { return (state.progress[l.id] || 0) >= 1; }).map(function (l) { return { unit: u, lesson: l }; }); });
    unlockedLessons = flat(unlockedLessons);
    if (!unlockedLessons.length && idx.units.length) unlockedLessons = [{ unit: idx.units[0], lesson: idx.units[0].lessons[0] }];
    var vocabAll = flat(unlockedLessons.map(function (x) { return (x.lesson.vocab || []).map(function (v) { return withMeta(v, x.unit, x.lesson); }); }));
    var sentAll = flat(unlockedLessons.map(function (x) { return (x.lesson.sentences || []).map(function (s) { return withMeta(s, x.unit, x.lesson); }); }));
    var vocabPool = vocabAll.length >= 8 ? vocabAll : idx.allVocab;
    var sentPool = sentAll.length ? sentAll : flat(idx.units.map(unitSentences));

    if (mode === 'random') {
      var pick = unlockedLessons[Math.floor(rng() * unlockedLessons.length)];
      return { exercises: generateLesson(course, pick.lesson.id, Math.max(2, state.progress[pick.lesson.id] || 1), { seed: rng, count: count, tts: opts.tts, typing: opts.typing }), title: 'Leçon aléatoire : ' + pick.lesson.title, lessonId: pick.lesson.id };
    }
    if (mode === 'timed') {
      var plan = []; var types = ['select_meaning', 'select_image', 'fill_blank', 'listen_word', 'select_meaning', 'fill_blank'];
      for (var i = 0; i < (opts.count || 30); i++) plan.push(types[i % types.length]);
      return { exercises: buildSet({ rng: rng, opts: opts, level: 1, vocab: vocabAll, sentences: sentAll, vocabPool: vocabPool, sentencePool: sentPool, plan: plan }), title: 'Pratique chronométrée' };
    }
    var vocab, sentences;
    if (mode === 'mistakes') {
      var mist = (state.mistakes || []).slice(-15);
      var ens = {}; mist.forEach(function (m) { ens[normalize(m.en)] = m; });
      vocab = vocabAll.filter(function (v) { return ens[normalize(v.en)] && ens[normalize(v.en)].kind === 'vocab'; });
      sentences = sentAll.filter(function (s) { return ens[normalize(s.en)] && ens[normalize(s.en)].kind === 'sentence'; });
      if (!vocab.length && !sentences.length) { vocab = pickN(vocabAll, 6, rng); sentences = pickN(sentAll, 4, rng); }
    } else { // weak
      vocab = vocabAll.filter(function (v) { return strengthOf(state.wordStrength || {}, v.en, now) <= 2; });
      vocab = shuffle(vocab, rng).sort(function (a, b) { return strengthOf(state.wordStrength, a.en, now) - strengthOf(state.wordStrength, b.en, now); }).slice(0, 10);
      if (vocab.length < 4) vocab = uniqueBy(vocab.concat(pickN(vocabAll, 6, rng)), function (v) { return normalize(v.en); });
      var weakEn = {}; vocab.forEach(function (v) { weakEn[normalize(v.en)] = true; });
      sentences = sentAll.filter(function (s) { return wordsOf(s.en).some(function (w) { return weakEn[normalize(w)]; }); });
      if (!sentences.length) sentences = pickN(sentAll, 4, rng);
    }
    var planP = [];
    var vTypes = ['select_meaning', 'select_image', 'listen_word', 'match_pairs'], sTypes = ['fill_blank', 'translate_bank', 'translate_type'];
    var ratioV = vocab.length / Math.max(1, vocab.length + sentences.length);
    for (var k = 0; k < count; k++) planP.push(rng() < ratioV ? vTypes[k % vTypes.length] : sTypes[k % sTypes.length]);
    return { exercises: buildSet({ rng: rng, opts: opts, level: 2, vocab: vocab, sentences: sentences, vocabPool: vocabPool, sentencePool: sentPool, plan: planP }), title: mode === 'mistakes' ? 'Réviser mes erreurs' : 'Renforcer les mots faibles' };
  }
  // ------------------------------------------------------------ mots / force
  function strengthOf(ws, en, now) {
    var e = ws && ws[en];
    if (!e) return 0;
    var days = Math.floor(((now || Date.now()) - (e.t || 0)) / STRENGTH_DECAY_MS);
    return clamp((e.s || 0) - Math.max(0, days), 0, 4);
  }
  function bumpStrength(ws, en, correct, now) {
    now = now || Date.now();
    var isNew = !ws[en];
    var cur = strengthOf(ws, en, now);
    var s = clamp(cur + (correct ? 1 : -1), 0, 4);
    ws[en] = { s: s, t: now };
    return { s: s, isNew: isNew };
  }
  function learnedWords(ws, now) {
    var n = 0; for (var k in ws) if (strengthOf(ws, k, now) >= 1) n++; return n;
  }

  // ------------------------------------------------------------ série
  function dayKey(d) { d = new Date(d === undefined ? Date.now() : d); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseDay(key) { var p = String(key).split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); }
  function dayDiff(a, b) { return Math.round((parseDay(b) - parseDay(a)) / DAY); }
  function addDays(key, n) { var t = parseDay(key) + n * DAY; var d = new Date(t); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  // Vérifie la série au démarrage : consomme les gels ou remet à zéro.
  function checkStreak(state, now) {
    now = now || Date.now();
    var today = dayKey(now);
    if (!state.lastActiveDay || !state.streak) return { changed: false };
    var diff = dayDiff(state.lastActiveDay, today);
    if (diff <= 1) return { changed: false };
    var missed = diff - 1;
    if (missed <= (state.freezes || 0)) {
      state.freezes -= missed;
      state.frozenDays = state.frozenDays || [];
      for (var i = 1; i <= missed; i++) state.frozenDays.push(addDays(state.lastActiveDay, i));
      state.lastActiveDay = addDays(today, -1);
      return { changed: true, frozen: missed };
    }
    var prev = state.streak;
    state.streak = 0;
    return { changed: true, lost: true, previous: prev };
  }
  // Appelé lorsqu'on gagne de l'XP ; renvoie true si la série vient d'être prolongée.
  function extendStreak(state, now) {
    now = now || Date.now();
    var today = dayKey(now);
    if (state.lastActiveDay === today) return false;
    checkStreak(state, now);
    if (state.lastActiveDay && state.streak > 0 && dayDiff(state.lastActiveDay, today) === 1) state.streak += 1; else state.streak = 1;
    state.lastActiveDay = today;
    state.streakHistory = state.streakHistory || [];
    if (state.streakHistory.indexOf(today) < 0) state.streakHistory.push(today);
    if (state.streakHistory.length > 800) state.streakHistory = state.streakHistory.slice(-800);
    state.stats = state.stats || {};
    state.stats.bestStreak = Math.max(state.stats.bestStreak || 0, state.streak);
    return true;
  }
  function formatDuration(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h >= 24) { var d = Math.floor(h / 24); return d + ' j ' + (h % 24) + ' h'; }
    if (h > 0) return h + ' h ' + pad(m) + ' min';
    if (m > 0) return m + ' min ' + pad(sec) + ' s';
    return sec + ' s';
  }

  // ------------------------------------------------------------ export
  window.Engine = {
    DAY: DAY,
    hashString: hashString, rngFrom: rngFrom, shuffle: shuffle, pickN: pickN, randInt: randInt, clamp: clamp, pad: pad, uniqueBy: uniqueBy,
    normalize: normalize, levenshtein: levenshtein, compare: compare,
    indexCourse: indexCourse, unitVocab: unitVocab, unitSentences: unitSentences, wordsOf: wordsOf, frKeys: frKeys, frOverlap: frOverlap,
    generateLesson: generateLesson, generatePractice: generatePractice, typePlan: typePlan, replaceListening: replaceListening, buildSet: buildSet, findBlank: findBlank,
    strengthOf: strengthOf, bumpStrength: bumpStrength, learnedWords: learnedWords,
    dayKey: dayKey, dayDiff: dayDiff, addDays: addDays, checkStreak: checkStreak, extendStreak: extendStreak, formatDuration: formatDuration
  };
})();
