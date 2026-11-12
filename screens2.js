/* Echoria — screens2.js : fiche Héros, Boutique, Grimoire, Entraînement, Réglages, Espace parents.
   Complète window.Screens. */
(function () {
  'use strict';
  var E = window.Engine, UI = window.UI, C = window.Chars, S = window.Store, SC = window.Screens, esc = UI.esc;
  var KIND_FR = { weapon: 'Arme', armor: 'Armure', trinket: 'Talisman' };
  var KIND_ICO = { weapon: '⚔️', armor: '🛡️', trinket: '🔮' };

  // ---------------------------------------------------------------- héros
  function slot(kind) {
    var st = S.state, it = S.item(st.equip[kind]), owned = st.items.filter(function (id) { var x = S.item(id); return x && x.kind === kind; }).length;
    return '<button class="slot" data-act="equip-open" data-kind="' + kind + '"><span class="slot-ico emoji">' + (it ? esc(it.emoji) : KIND_ICO[kind]) + '</span><span class="grow"><small>' + KIND_FR[kind] + '</small><b>' + (it ? esc(it.fr) : 'Aucun') + '</b><span class="slot-stat' + (it ? '' : ' none') + '">' + (it ? esc(SC.itemStat(it)) : 'Tu n\'en as pas encore.') + '</span></span><span class="slot-more">' + (owned > 1 ? 'changer ›' : '›') + '</span></button>';
  }
  function hero() {
    var st = S.state, hs = S.heroStats(), li = S.levelInfo(), pts = S.skillPoints();
    var h = '<div class="hero-page"><div class="hero-stage"><div class="stage-bg">' + C.backdrop('meadow') + '</div><div class="hero-figure">' + C.heroSvg(st, { size: 220, mood: 'happy' }) + '</div><div class="hero-pico">' + C.pico({ size: 80, mood: 'happy', cls: 'bob' }) + '</div></div>';
    h += '<div class="hero-id"><h1>' + esc(st.hero.name || 'Wordkeeper') + '</h1><div class="hero-rank">Wordkeeper · niveau ' + li.level + '</div><div class="xpline"><span class="xpbar big"><span style="width:' + Math.round(li.pct * 100) + '%"></span></span><small>' + li.cur + ' / ' + li.need + ' XP</small></div></div>';
    h += '<div class="stat-chips"><div class="chip hp"><span class="emoji">❤️</span><b>' + hs.maxHp + '</b><small>PV</small></div><div class="chip atk"><span class="emoji">⚔️</span><b>' + hs.atk + '</b><small>Attaque</small></div><div class="chip pot"><span class="emoji">🧪</span><b>' + st.potions + '</b><small>Potions</small></div><div class="chip gold"><span class="emoji">🪙</span><b>' + st.gold + '</b><small>Or</small></div></div>';
    h += '<h2 class="section">Équipement</h2><div class="slots">' + slot('weapon') + slot('armor') + slot('trinket') + '</div>';
    h += '<h2 class="section">Sorts <small>' + st.spellsEquipped.length + '/3 équipés</small></h2>';
    if (!st.spells.length) h += '<p class="empty">Tu ne connais pas encore de sort. Old Quill t\'en apprendra bientôt un !</p>';
    else h += '<div class="spells">' + st.spells.map(function (id) { var sp = S.spell(id), on = st.spellsEquipped.indexOf(id) >= 0; return '<button class="spell' + (on ? ' on' : '') + '" data-act="spell-toggle" data-id="' + id + '" aria-pressed="' + on + '"><span class="spell-ico emoji">' + esc(sp.emoji) + '</span><span class="grow"><b lang="en">' + esc(sp.name) + '</b> <i>' + esc(sp.fr) + '</i><small>' + esc(sp.desc) + ' Recharge : ' + Math.round(sp.cooldown * hs.cdMul * 10) / 10 + ' s.</small></span><span class="spell-state">' + (on ? '✓ équipé' : 'équiper') + '</span></button>'; }).join('') + '</div>';
    h += '<h2 class="section">Compétences <small>' + (pts > 0 ? '<span class="pts">' + pts + ' point' + (pts > 1 ? 's' : '') + ' à placer</span>' : '1 point par niveau') + '</small></h2><div class="skills">' + S.SKILLS.map(function (sk) { return '<div class="skill"><span class="skill-ico emoji">' + sk.emoji + '</span><span class="grow"><b>' + sk.name + ' <span class="skill-lv">' + st.skills[sk.id] + '</span></b><small>' + sk.desc + ' par point</small></span><button class="btn btn-green btn-sm skill-add" data-act="skill-add" data-id="' + sk.id + '"' + (pts > 0 ? '' : ' disabled') + ' aria-label="Ajouter un point en ' + sk.name + '">+</button></div>'; }).join('') + '</div>';
    var keys = st.items.map(S.item).filter(function (it) { return it && it.kind === 'key'; });
    h += '<h2 class="section">Trésors de l\'aventure</h2>' + SC.crystalsRow(40) + (keys.length ? '<div class="keys">' + keys.map(function (it) { return '<div class="key-item"><span class="emoji">' + esc(it.emoji) + '</span><span><b>' + esc(it.fr) + '</b><small>' + esc(it.desc || '') + '</small></span></div>'; }).join('') + '</div>' : '<p class="empty">Les objets de l\'histoire apparaîtront ici.</p>');
    if (st.flags.ended) h += '<button class="btn btn-parch btn-block end-replay" data-act="ending"><span class="emoji">👑</span> Revoir la fin de l\'aventure</button>';
    return h + '</div>';
  }
  function equipPicker(kind) {
    var st = S.state, list = st.items.map(S.item).filter(function (it) { return it && it.kind === kind; });
    if (!list.length) return '<p class="empty">Tu n\'as pas encore de ' + KIND_FR[kind].toLowerCase() + '.</p>';
    return '<div class="picker">' + list.map(function (it) { var on = st.equip[kind] === it.id; return '<button class="pick' + (on ? ' on' : '') + '" data-act="equip-set" data-kind="' + kind + '" data-id="' + it.id + '"><span class="emoji">' + esc(it.emoji) + '</span><span class="grow"><b>' + esc(it.fr) + '</b> <i lang="en">' + esc(it.name) + '</i><small>' + esc(SC.itemStat(it)) + '</small></span><span>' + (on ? '✓' : '') + '</span></button>'; }).join('') + (kind === 'trinket' && st.equip.trinket ? '<button class="pick" data-act="equip-set" data-kind="trinket" data-id=""><span class="emoji">🚫</span><span class="grow"><b>Aucun talisman</b></span></button>' : '') + '</div>';
  }

  // ---------------------------------------------------------------- boutique
  function compare(it) {
    var st = S.state, cur = S.item(st.equip[it.kind]);
    if (it.kind === 'weapon') { var d = it.atk - ((cur && cur.atk) || 0); return '<span class="cmp ' + (d > 0 ? 'up' : d < 0 ? 'down' : '') + '">' + (d > 0 ? '▲ +' + d : d < 0 ? '▼ ' + d : '= ') + ' attaque par rapport à ' + (cur ? esc(cur.fr.toLowerCase()) : 'rien') + '</span>'; }
    if (it.kind === 'armor') { var dh = it.hp - ((cur && cur.hp) || 0); return '<span class="cmp ' + (dh > 0 ? 'up' : dh < 0 ? 'down' : '') + '">' + (dh > 0 ? '▲ +' + dh : dh < 0 ? '▼ ' + dh : '= ') + ' PV par rapport à ' + (cur ? esc(cur.fr.toLowerCase()) : 'rien') + '</span>'; }
    return '';
  }
  function shop() {
    var st = S.state, h = '<div class="shop-page"><div class="shop-hero"><div class="shop-keeper">' + C.svg({ species: 'dwarf', age: 'adult', skin: 'tan', hair: 'bald', hairColor: 'brown', hat: 'beanie', outfit: '#9A63E0', accessory: 'beard' }, { size: 92, mood: 'happy', bust: true }) + '</div><div class="grow"><h1>La boutique</h1><p lang="en">“Welcome! Have a look!”</p></div><div class="purse"><span class="emoji">🪙</span><b>' + st.gold + '</b></div></div>';
    var row = function (it) {
      var owned = it.kind !== 'potion' && st.items.indexOf(it.id) >= 0, can = st.gold >= it.price;
      return '<div class="shop-item' + (owned ? ' owned' : '') + '"><span class="s-icon emoji">' + esc(it.emoji) + '</span><div class="s-body"><div class="s-name">' + esc(it.fr) + ' <i lang="en">' + esc(it.name) + '</i></div><div class="s-desc">' + esc(SC.itemStat(it)) + (it.kind === 'potion' ? ' Tu en as ' + st.potions + '.' : '') + '</div>' + (owned ? '' : compare(it)) + '</div>' + (owned ? '<span class="s-owned">✓ acheté</span>' : '<button class="btn ' + (can ? 'btn-gold' : '') + ' btn-sm s-buy" data-act="buy" data-id="' + it.id + '"' + (can ? '' : ' disabled') + ' aria-label="Acheter ' + esc(it.fr) + ' pour ' + it.price + ' pièces"><span class="emoji">🪙</span> ' + it.price + '</button>') + '</div>';
    };
    var potions = (S.CAT.items || []).filter(function (it) { return it.source === 'shop:all'; });
    h += '<h2 class="section">Potions</h2>' + potions.map(row).join('');
    S.REGIONS.forEach(function (r, i) {
      var items = (S.CAT.items || []).filter(function (it) { return it.source === 'shop:' + r.id; });
      if (!items.length) return;
      if (S.isRegionUnlocked(i)) h += '<h2 class="section"><span class="emoji">' + r.emoji + '</span> ' + esc(r.name) + '</h2>' + items.map(row).join('');
      else h += '<h2 class="section locked"><span class="emoji">🔒</span> ' + esc(r.name) + ' <small>encore dans le brouillard</small></h2>';
    });
    return h + '</div>';
  }

  // ---------------------------------------------------------------- grimoire
  var GRIM_TABS = [['words', '📖', 'Mots'], ['phrases', '💬', 'Phrases'], ['grammar', '📜', 'Grammaire'], ['cando', '🏅', 'Je sais'], ['bestiary', '👾', 'Bestiaire']];
  function wordRows(words) {
    if (!words.length) return '<p class="empty">Aucun mot trouvé.</p>';
    var out = '', last = null;
    words.forEach(function (w) {
      if (w.chapter !== last) { last = w.chapter; var ch = S.chapter(w.chapter); out += '<div class="dict-head"><span class="emoji">' + esc((ch && ch.emoji) || '') + '</span> Chapitre ' + S.chapterNum(w.chapter) + ' · ' + esc((ch && ch.title) || '') + '</div>'; }
      out += '<div class="dict-row"><span class="d-emoji emoji">' + esc(w.emoji || '·') + '</span><span class="grow"><span class="d-en" lang="en">' + esc(w.en) + '</span><span class="d-fr">' + esc(w.fr) + '</span></span>' + UI.strengthBars(w.s) + UI.speakBtn(w.en) + '</div>';
    });
    return out;
  }
  function filterWords(q) {
    var all = S.learnedVocab(); q = E.normalize(q || '');
    if (!q) return all;
    return all.filter(function (w) { return E.normalize(w.en).indexOf(q) >= 0 || E.normalize(w.fr).indexOf(q) >= 0; });
  }
  function chLabel(c, short) { return c.kind === 'home' ? (short ? 'Maison' : 'Niveau 1 · Maison') : (short ? 'Ch. ' : 'Chapitre ') + c.n; }
  function grimoire(sub, q) {
    var st = S.state; sub = sub || 'words';
    var h = '<div class="grim-page"><div class="grim-head"><span class="grim-book emoji">📕</span><div><h1>Grimoire</h1><p>Le livre de tous tes mots.</p></div></div><div class="chips" role="tablist">' + GRIM_TABS.map(function (t) { return '<button class="chip-tab' + (t[0] === sub ? ' on' : '') + '" role="tab" aria-selected="' + (t[0] === sub) + '" data-act="grim" data-sub="' + t[0] + '"><span class="emoji">' + t[1] + '</span> ' + t[2] + '</button>'; }).join('') + '</div>';
    var doneCh = S.CHAPTERS.filter(function (c) { return S.isChapterDone(c.id); });
    if (sub === 'words') {
      var all = S.learnedVocab(), strong = all.filter(function (w) { return w.s >= 3; }).length;
      if (!all.length) h += '<div class="empty-card">' + C.pico({ size: 90, mood: 'think' }) + '<p>Ton Grimoire est encore vide. Termine ta première leçon : les mots s\'écriront ici tout seuls !</p></div>';
      else h += '<div class="grim-count"><b>' + all.length + '</b> mots appris · <b>' + strong + '</b> bien maîtrisés</div><input class="input" type="search" data-role="grim-q" placeholder="Chercher un mot (anglais ou français)" value="' + esc(q || '') + '" aria-label="Chercher un mot"><div class="dict card" data-role="grim-list">' + wordRows(filterWords(q)) + '</div>';
    } else if (sub === 'phrases') {
      var ph = st.phrases.slice().reverse();
      h += ph.length ? '<p class="grim-note">Les phrases que tu as dites en anglais pendant tes conversations.</p><div class="dict card">' + ph.map(function (p) { return '<div class="dict-row"><span class="d-emoji emoji">💬</span><span class="grow"><span class="d-en" lang="en">' + esc(p.en) + '</span>' + (p.fr ? '<span class="d-fr">' + esc(p.fr) + '</span>' : '') + '</span>' + UI.speakBtn(p.en) + '</div>'; }).join('') + '</div>' : '<div class="empty-card">' + C.pico({ size: 90, mood: 'think' }) + '<p>Parle avec les habitants d\'Echoria : tes phrases réussies seront gardées ici.</p></div>';
    } else if (sub === 'grammar') {
      h += doneCh.length ? doneCh.map(function (c) { return '<div class="dict-head"><span class="emoji">' + esc(c.emoji || '') + '</span> ' + chLabel(c) + ' · ' + esc(c.title) + '</div>' + SC.tipsHtml(c); }).join('') : '<div class="empty-card">' + C.pico({ size: 90, mood: 'think' }) + '<p>Les fiches de grammaire se débloquent à la fin de chaque chapitre.</p></div>';
    } else if (sub === 'cando') {
      h += doneCh.length ? doneCh.map(function (c) { return '<div class="card goals"><h3><span class="emoji">' + esc(c.emoji || '') + '</span> ' + chLabel(c) + ' · ' + esc(c.cefr || '') + '</h3><ul>' + (c.objectives || []).map(function (o) { return '<li class="ok"><span class="tick">✓</span>' + esc(o) + '</li>'; }).join('') + '</ul></div>'; }).join('') : '<div class="empty-card">' + C.pico({ size: 90, mood: 'think' }) + '<p>Termine un chapitre pour voir ici tout ce que tu sais faire en anglais.</p></div>';
    } else {
      var foes = (S.CAT.enemies || []).concat(S.CAT.bosses || []);
      h += '<div class="bestiary">' + foes.map(function (f) { var seen = st.bestiary.indexOf(f.id) >= 0; return '<div class="beast' + (seen ? '' : ' unknown') + '"><div class="beast-art">' + (seen ? C.enemySvg(f.id, 84) : '<span class="emoji">❓</span>') + '</div><div class="grow"><b>' + (seen ? esc(f.fr) : '???') + '</b>' + (seen ? ' <i lang="en">' + esc(f.name) + '</i>' : '') + '<small>' + (seen ? esc(f.desc) : 'Tu n\'as pas encore rencontré cette créature.') + '</small></div></div>'; }).join('') + '</div>';
    }
    return h + '</div>';
  }

  // ---------------------------------------------------------------- entraînement
  function training() {
    var st = S.state, all = S.learnedVocab(), weak = all.filter(function (w) { return w.s <= 2; }).length, today = E.dayKey(Date.now()), dailyDone = st.daily.date === today && st.daily.done;
    var h = '<div class="train-page"><div class="train-hero"><div>' + C.pico({ size: 96, mood: 'happy', cls: 'bob' }) + '</div><div class="grow"><h1>Terrain d\'entraînement</h1><p>Revois tes mots pour qu\'ils restent magiques.</p></div></div>';
    h += '<div class="streak-card' + (st.streak ? ' on' : '') + '"><span class="emoji">🔥</span><div class="grow"><b>' + (st.streak ? UI.plural(st.streak, 'jour') + ' d\'affilée' : 'Pas encore de série') + '</b><small>' + (st.lastActiveDay === today ? 'Bravo, tu as joué aujourd\'hui !' : 'Joue chaque jour pour faire grandir la flamme.') + '</small></div></div>';
    if (!all.length) return h + '<div class="empty-card"><p>Termine ta première leçon pour ouvrir le terrain d\'entraînement.</p><button class="btn btn-gold" data-act="go" data-tab="map">Aller à la carte</button></div></div>';
    var card = function (act, ico, title, sub, reward, done) { return '<button class="train-card' + (done ? ' done' : '') + '" data-act="train" data-mode="' + act + '"><span class="tc-ico emoji">' + ico + '</span><span class="grow"><b>' + title + '</b><small>' + sub + '</small></span><span class="tc-reward">' + reward + '</span></button>'; };
    h += card('daily', '🌞', 'Défi du jour', dailyDone ? 'Déjà réussi aujourd\'hui. Reviens demain !' : '8 questions surprises.', dailyDone ? '✓' : '+25 🪙', dailyDone);
    h += card('weak', '🌱', 'Mots à renforcer', weak ? UI.plural(weak, 'mot') + ' encore fragile' + (weak > 1 ? 's' : '') + '.' : 'Tous tes mots sont en forme !', '+10 🪙', false);
    h += card('mistakes', '🩹', 'Réparer mes erreurs', st.mistakes.length ? UI.plural(st.mistakes.length, 'erreur') + ' récente' + (st.mistakes.length > 1 ? 's' : '') + ' à revoir.' : 'Aucune erreur récente. Révision libre.', '+10 🪙', false);
    return h + '</div>';
  }

  // ---------------------------------------------------------------- réglages
  function toggle(key, label, sub) { var on = !!S.state.settings[key]; return '<div class="setting"><div class="grow"><div class="st-label">' + label + '</div>' + (sub ? '<div class="st-sub">' + sub + '</div>' : '') + '</div><button class="switch" role="switch" aria-checked="' + on + '" aria-label="' + esc(label) + '" data-act="set-toggle" data-key="' + key + '"></button></div>'; }
  function choice(key, label, sub, opts) { var v = S.state.settings[key]; return '<div class="setting col"><div class="st-label">' + label + '</div>' + (sub ? '<div class="st-sub">' + sub + '</div>' : '') + '<div class="seg wide">' + opts.map(function (o) { return '<button class="' + (String(v) === String(o[0]) ? 'on' : '') + '" data-act="set-choice" data-key="' + key + '" data-v="' + o[0] + '" aria-pressed="' + (String(v) === String(o[0])) + '">' + o[1] + '</button>'; }).join('') + '</div></div>'; }
  function settings() {
    var tts = S.tts.available();
    var h = '<div class="page settings">' + SC.head('Réglages', '<span class="sync-indicator">' + S.cloud.label() + '</span>') + '<div class="page-body">';
    h += '<div class="settings-group"><h3>Son et voix</h3>' + toggle('sound', 'Sons du jeu') + toggle('vibrate', 'Vibrations') + choice('voice', 'Voix anglaise', tts ? 'Les habitants d\'Echoria parlent plutôt britannique.' : 'Aucune voix anglaise n\'est installée sur cet appareil : le jeu marche quand même, sans les exercices d\'écoute.', [['UK', '🇬🇧 Britannique'], ['US', '🇺🇸 Américaine']]) + choice('rate', 'Vitesse de la voix', '', [[0.8, '🐢 Lente'], [1, 'Normale'], [1.15, '🐇 Rapide']]) + '<div class="setting"><div class="grow"><div class="st-label">Essayer la voix</div></div><button class="btn btn-parch btn-sm" data-action="speak" data-text="Hello! Welcome to Echoria, Wordkeeper!">🔊 Hello!</button></div></div>';
    h += '<div class="settings-group"><h3>Aide et exercices</h3>' + choice('frHelp', 'Aide en français', 'La traduction de ce que disent les personnages.', [['always', 'Toujours'], ['tap', 'Sur appui 🇫🇷'], ['never', 'Jamais']]) + choice('typing', 'Écriture au clavier', 'Écrire des phrases entières en anglais (sinon : étiquettes à assembler).', [['auto', 'Auto (dès Port Tempest)'], ['on', 'Oui'], ['off', 'Non']]);
    h += '<div class="setting"><div class="grow"><div class="st-label">Comment se battre ?</div><div class="st-sub">Revoir l\'explication du combat : bouger, frapper, lancer un sort.</div></div><button class="btn btn-parch btn-sm" data-act="tuto-replay"><span class="emoji">⚔️</span> Revoir</button></div></div>';
    h += '<div class="settings-group"><h3>Affichage</h3>' + choice('textSize', 'Taille du texte', '', [['m', 'Normale'], ['l', 'Grande'], ['xl', 'Très grande']]) + toggle('reducedMotion', 'Animations réduites', 'Moins de mouvements à l\'écran.') + '</div>';
    h += '<div class="settings-group"><h3>Sauvegarde</h3><div class="setting col"><div class="st-label">Exporter / importer</div><div class="st-sub">Copie ce texte pour garder ta partie, ou colle une sauvegarde puis appuie sur Importer.</div><textarea class="json-area" data-role="save-json" spellcheck="false" aria-label="Sauvegarde">' + esc(S.exportJson()) + '</textarea><div class="row2"><button class="btn btn-parch btn-sm" data-act="save-copy">📋 Copier</button><button class="btn btn-parch btn-sm" data-act="save-import">📥 Importer</button></div></div><div class="setting"><div class="grow"><div class="st-label">Recommencer l\'aventure</div><div class="st-sub">Efface toute la partie.</div></div><button class="btn btn-red btn-sm" data-act="reset-ask">Recommencer</button></div></div>';
    h += '<div class="settings-group"><h3>Parents</h3><div class="setting"><div class="grow"><div class="st-label">Espace parents</div><div class="st-sub">Garde le doigt appuyé 2 secondes sur le cadenas.</div></div><button class="parent-lock" data-role="parent-lock" aria-label="Espace parents : appui long de 2 secondes"><span class="emoji">🔒</span><svg viewBox="0 0 60 60" aria-hidden="true"><circle cx="30" cy="30" r="26"/></svg></button></div></div>';
    return h + '<p class="about">Echoria — La Quête des Cinq Cristaux · v' + ((S.CAT.meta && S.CAT.meta.version) || 1) + '</p></div></div>';
  }

  // ---------------------------------------------------------------- espace parents
  var TASK_FR = { home: 'Maison : quêtes de maman', lesson: 'Exercices de leçon', choice: 'Dialogue : choisir la réplique', meaning: 'Dialogue : compréhension', blank: 'Dialogue : phrase à trou', bank: 'Dialogue : construire la phrase', type: 'Dialogue : écrire la phrase', quiz: 'Combat : Rune de Mot' };
  function pctOf(t) { return t && t.n ? Math.round(t.ok / t.n * 100) : null; }
  function parents() {
    var st = S.state, all = S.learnedVocab(), strong = all.filter(function (w) { return w.s >= 3; }).length, tot = { ok: 0, n: 0 };
    Object.keys(st.tasks).forEach(function (k) { tot.ok += st.tasks[k].ok; tot.n += st.tasks[k].n; });
    var h = '<div class="page parents">' + SC.head('Espace parents', 'Suivi de ' + esc(st.hero.name || 'votre enfant'), 'parents-close') + '<div class="page-body">';
    h += '<div class="stat-grid"><div class="stat-box"><b>' + all.length + '</b><small>mots appris</small></div><div class="stat-box"><b>' + strong + '</b><small>mots maîtrisés</small></div><div class="stat-box"><b>' + (pctOf(tot) === null ? '–' : pctOf(tot) + ' %') + '</b><small>précision globale</small></div><div class="stat-box"><b>' + E.formatDuration(st.stats.time) + '</b><small>temps de jeu</small></div><div class="stat-box"><b>' + st.unitsDone.length + ' / ' + S.CHAPTERS.length + '</b><small>chapitres terminés</small></div><div class="stat-box"><b>' + st.streak + '</b><small>jours d\'affilée</small></div></div>';
    h += '<h2 class="section">Avancement par palier (CECRL)</h2>';
    if (S.HOME_REGION && S.HOME_CHAPTER) { var hr = S.HOME_REGION, hdone = S.isChapterDone(S.HOME_CHAPTER.id), hq = S.HOME_CHAPTER.steps.filter(function (x) { return x.type === "minigame"; }).length, hqd = S.HOME_CHAPTER.steps.filter(function (x, i) { return x.type === 'minigame' && S.stepState(S.HOME_CHAPTER.id, i).done; }).length;
      h += '<div class="cefr-row" style="--c:' + hr.color + '"><div class="cefr-badge">' + esc(hr.cefr) + '</div><div class="grow"><b>Maison · ' + esc(hr.cefr) + '</b> <small>' + esc(hr.fr) + ' (niveau 1)</small><div class="cefr-eq">≈ ' + esc(hr.school) + ' · Cambridge ' + esc(hr.cambridge) + '</div>' + UI.progressBar(hq ? hqd / hq : 0, '', hr.color) + '<small>' + hqd + ' / ' + hq + ' quêtes de la maison' + (hdone ? ' · niveau terminé ✓' : '') + '</small></div></div>'; }
    S.REGIONS.forEach(function (r, i) {
      var ids = r.chapters || [], done = ids.filter(function (id) { return S.isChapterDone(id); }).length, present = ids.filter(function (id) { return !!S.chapter(id); }).length;
      h += '<div class="cefr-row" style="--c:' + r.color + '"><div class="cefr-badge">' + esc(r.cefr) + '</div><div class="grow"><b>' + esc(r.name) + '</b> <small>' + esc(r.fr) + '</small><div class="cefr-eq">≈ ' + esc(r.school) + ' · Cambridge ' + esc(r.cambridge) + '</div>' + UI.progressBar(ids.length ? done / ids.length : 0, '', r.color) + '<small>' + done + ' / ' + ids.length + ' chapitres' + (present < ids.length ? ' (' + present + ' disponibles pour l\'instant)' : '') + (st.crystals.indexOf(r.id) >= 0 ? ' · cristal obtenu ✓' : '') + '</small></div></div>';
    });
    h += '<h2 class="section">Précision par type de tâche</h2><div class="card">';
    var kinds = Object.keys(TASK_FR).filter(function (k) { return st.tasks[k] && st.tasks[k].n; });
    h += kinds.length ? kinds.map(function (k) { var p = pctOf(st.tasks[k]); return '<div class="acc-row"><span class="grow">' + TASK_FR[k] + '</span>' + UI.progressBar(p / 100, 'thin', p >= 80 ? '#3DBB6B' : p >= 60 ? '#F5B833' : '#E5484D') + '<b>' + p + ' %</b><small>' + st.tasks[k].n + ' rép.</small></div>'; }).join('') : '<p class="empty">Pas encore de réponses enregistrées.</p>';
    h += '</div><h2 class="section">Mots les plus ratés</h2><div class="card">';
    var miss = Object.keys(st.wordMiss).map(function (k) { return [k, st.wordMiss[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 10), frBy = {}; all.forEach(function (w) { frBy[w.en] = w.fr; });
    h += miss.length ? miss.map(function (m) { return '<div class="acc-row"><span class="grow"><b lang="en">' + esc(m[0]) + '</b> <small>' + esc(frBy[m[0]] || '') + '</small></span><small>' + m[1] + ' erreur' + (m[1] > 1 ? 's' : '') + '</small></div>'; }).join('') : '<p class="empty">Aucune erreur enregistrée pour l\'instant.</p>';
    h += '</div><h2 class="section">Points de grammaire vus</h2><div class="card">';
    var seen = S.CHAPTERS.filter(function (c) { return S.isChapterDone(c.id) || (c.lessons || []).some(function (l) { return (st.progress[l.id] || 0) >= 1; }); });
    h += seen.length ? '<ul class="gram-list">' + seen.map(function (c) { return (c.grammar || []).map(function (g) { return '<li><small>' + chLabel(c, true) + ' · ' + esc(c.cefr || '') + '</small> ' + esc(g.title) + '</li>'; }).join(''); }).join('') + '</ul>' : '<p class="empty">Aucun pour l\'instant.</p>';
    h += '</div><h2 class="section">Activité</h2><div class="card"><div class="acc-row"><span class="grow">Leçons terminées</span><b>' + st.stats.lessons + '</b></div><div class="acc-row"><span class="grow">Dialogues réussis</span><b>' + st.stats.dialogues + '</b></div><div class="acc-row"><span class="grow">Combats gagnés / perdus</span><b>' + st.stats.combatsWon + ' / ' + st.stats.combatsLost + '</b></div><div class="acc-row"><span class="grow">Séances d\'entraînement</span><b>' + st.stats.trainings + '</b></div></div>';
    h += '<h2 class="section">Outils</h2><div class="card"><div class="setting"><div class="grow"><div class="st-label">Débloquer tous les chapitres</div><div class="st-sub">Pour tester le jeu ou sauter une partie déjà connue.</div></div><button class="switch" role="switch" aria-checked="' + st.flags.unlockAll + '" aria-label="Débloquer tous les chapitres" data-act="unlock-all"></button></div><div class="setting"><div class="grow"><div class="st-label">Combats en mode facile</div><div class="st-sub">Ennemis moins résistants.</div></div><button class="switch" role="switch" aria-checked="' + st.flags.easy + '" aria-label="Combats en mode facile" data-act="easy-mode"></button></div></div>';
    return h + '</div></div>';
  }

  Object.assign(SC, { hero: hero, equipPicker: equipPicker, shop: shop, grimoire: grimoire, wordRows: wordRows, filterWords: filterWords, training: training, settings: settings, parents: parents, KIND_FR: KIND_FR });
})();
