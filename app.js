const main = document.getElementById('main');
const LESSONS = DATA.lessons, UNITS = DATA.units;
const BY_ID = {};
const register = list => list.forEach(x => { if (typeof x === 'object') BY_ID[x.id] = x; });
register(LESSONS.flatMap(l => l.items));
[DATA.consonants, DATA.vowels, DATA.subjects, DATA.markers, DATA.verbs].forEach(register);
UNITS.forEach(u => { register(u.vocab); register(u.examples); });
const get = x => typeof x === 'string' ? BY_ID[x] : x;

const DAY = 864e5, GAPS = [0, 1, 3, 7, 14, 30, 90]; // review gap in days per box
let srs = load('srs', {});         // id -> {box, due}
let done = load('done', []);       // finished phrase-lesson indexes
let passed = load('units', {});    // unit index -> best test score
let voice = load('voice', 'f');
let tutor = load('tutor', { url: '', pass: '' });
let view = main;                   // where the current page renders (sub-tabs swap it)

function load(k, d) { try { return JSON.parse(localStorage.getItem('km-' + k)) ?? d; } catch { return d; } }
function save(k, v) { try { localStorage.setItem('km-' + k, JSON.stringify(v)); } catch {} }
const shuffle = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(p => p[1]);
const pick = a => a[Math.floor(Math.random() * a.length)];
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---- Audio ----
function play(item) {
  const a = new Audio(`audio/${item.id}-${voice}.mp3`);
  a.play().catch(() => browserSpeak(item.km)); // file missing: use the browser's Khmer voice if it has one
  return a;
}
function playSeq(items) {
  if (!items.length) return;
  play(items[0]).onended = () => playSeq(items.slice(1));
}

// Speaking any Khmer text (only the Khmer script is spoken). Tries the tutor server's voice
// (needs an Azure key), then the browser's own Khmer voice (Microsoft Edge has Sreymom built in, free).
const ttsCache = new Map();
const khmerOnly = t => (t.match(/[ក-៿᧠-᧿][ក-៿᧠-᧿\s?!.,…]*/g) || []).join(' ').trim();
let kmVoice = null, serverVoiceOff = false;
const findVoice = () => {
  kmVoice = (window.speechSynthesis?.getVoices() || []).filter(v => /^km/i.test(v.lang))
    .sort((a, b) => /sreymom/i.test(b.name) - /sreymom/i.test(a.name))[0] || null;
};
window.speechSynthesis?.addEventListener?.('voiceschanged', findVoice);
findVoice();
function browserSpeak(km) {
  if (!kmVoice) return false;
  const u = new SpeechSynthesisUtterance(km);
  u.voice = kmVoice; u.lang = kmVoice.lang; u.rate = 0.9;
  speechSynthesis.cancel(); speechSynthesis.speak(u);
  return true;
}
async function speak(text) {
  const km = khmerOnly(text);
  if (!km) return false;
  if (tutor.url && !serverVoiceOff) {
    try {
      if (!ttsCache.has(km)) {
        const r = await fetch(tutor.url, { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode: 'tts', password: tutor.pass, text: km }) });
        if (!r.ok) throw new Error(r.status);
        ttsCache.set(km, URL.createObjectURL(await r.blob()));
      }
      await new Audio(ttsCache.get(km)).play();
      return true;
    } catch { serverVoiceOff = true; } // no voice key on the server: stop asking it this visit
  }
  return browserSpeak(km);
}
async function ask(mode, messages) {
  const r = await fetch(tutor.url, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode, password: tutor.pass, messages }) });
  const j = await r.json().catch(() => ({ error: 'Bad response from server' }));
  if (!r.ok || j.error) throw new Error(j.error || r.statusText);
  return j.text;
}

function phraseHTML(it) {
  return `<div class="rom">${it.rom}</div><div class="km">${it.km}</div><div class="en">${it.en}</div>` +
    (it.note ? `<div class="note">${it.note}</div>` : '');
}
function itemRow(it) {
  return `<div class="item"><button class="btn play" data-play="${it.id}" aria-label="Play">▶</button>
    <div><b>${it.rom}</b><span class="km">${it.km}</span> <span class="hint">· ${it.en}</span></div></div>`;
}
function wirePlay(root = view) {
  root.querySelectorAll('[data-play]').forEach(b => b.onclick = () => play(BY_ID[b.dataset.play]));
}
const learned = () => Object.keys(srs).map(id => BY_ID[id]).filter(it => it?.en);
const addToReview = items => { items.forEach(it => srs[it.id] ??= { box: 0, due: 0 }); save('srs', srs); };

// ---- Home ----
function home() {
  const nextUnit = UNITS.findIndex((_, i) => passed[i] == null);
  const start = Object.keys(passed).length && nextUnit >= 0
    ? `<a class="btn primary" href="#course/${nextUnit}">Continue: Unit ${nextUnit + 1}</a>`
    : `<a class="btn primary" href="#course">Start the course</a>`;
  const features = [
    ['course', 'The course', `${UNITS.length} units like a real class: lesson, examples, practice and a unit test.`],
    ['tutor', 'AI tutor', 'Ask anything ("how do I say…?") and chat with a teacher who speaks Khmer out loud.'],
    ['phrases', 'Phrasebook', `${LESSONS.length} daily phrase lessons from beginner to advanced.`],
    ['verbs', 'Verb tenses', 'Any verb, any person, past, present and future, with audio.'],
    ['alphabet', 'Alphabet', 'All 33 consonants and common vowels, each with audio.'],
    ['practice', 'Practice', 'Smart flashcards, listening quiz and matching games.'],
    ['tools', 'Tools', 'Translator, Khmer keyboard and printable handwriting sheets.'],
    ['culture', 'Culture notes', 'Greetings, respect, family words and holidays.'],
  ];
  view.innerHTML = `<section class="hero"><div class="kh">សួស្តី</div>
    <h2>Speak Khmer with your family</h2>
    <p>A free Khmer class you can take anywhere: real lessons, real pronunciation, and an AI tutor to practice with.</p>
    <div class="row">${start}<a class="btn" href="#tutor">Talk to the tutor</a></div></section>
    <div class="features">${features.map(([v, t, d]) => `<a class="card" href="#${v}"><b>${t}</b><span>${d}</span></a>`).join('')}</div>`;
}

// ---- Course ----
function course(arg) {
  if (arg != null && UNITS[+arg] && unlocked(+arg)) return unit(+arg);
  view.innerHTML = `<div class="narrow"><h2>The course</h2>
    <p class="hint">Work through the units in order, like a class. Read the lesson, practice, then pass the unit test (70%+) to unlock the next one.</p>` +
    UNITS.map((u, i) => {
      const status = passed[i] != null ? `✓ ${passed[i]}%` : unlocked(i) ? 'Start' : '🔒';
      return `<button class="lesson" data-u="${i}" ${unlocked(i) ? '' : 'disabled'}><b>Unit ${i + 1}: ${u.title}<small>${u.goal}</small></b><span>${status}</span></button>`;
    }).join('') + '</div>';
  view.querySelectorAll('[data-u]').forEach(b => b.onclick = () => location.hash = 'course/' + b.dataset.u);
}
const unlocked = i => i === 0 || passed[i - 1] != null;
const unitItems = u => [...u.vocab, ...u.examples].map(get);

function unit(i, step = 'learn') {
  const u = UNITS[i];
  view.innerHTML = `<div class="narrow"><p class="hint"><a href="#course">← All units</a></p>
    <h2 style="margin-bottom:0">Unit ${i + 1}: ${u.title}</h2><p class="hint" style="margin-top:4px">Goal: ${u.goal}</p>
    <div class="tabs">${[['learn', '1. Lesson'], ['practice', '2. Practice'], ['test', '3. Unit test']].map(([s, l]) =>
      `<button class="btn sm ${s === step ? 'primary' : ''}" data-s="${s}">${l}</button>`).join('')}</div><div id="ustep"></div></div>`;
  view.querySelectorAll('[data-s]').forEach(b => b.onclick = () => unit(i, b.dataset.s));
  const box = $('ustep');
  if (step === 'learn') {
    const letters = u.script.map(get);
    box.innerHTML = `<div class="card lesson-text">${u.sections.map(s => `<h4>${s.h}</h4><p>${s.p}</p>`).join('')}</div>
      <h3 class="level">Vocabulary</h3><div class="card">${u.vocab.map(get).map(itemRow).join('')}</div>
      <h3 class="level">Example sentences</h3><div class="card">${u.examples.map(get).map(itemRow).join('')}</div>
      <h3 class="level">Reading: new letters</h3>
      <p class="hint">Tap to hear. ${letters[0].series ? 'Shaded letters are o-series (lower sound).' : 'Shown on ក (kâ).'}</p>
      <div class="grid">${letters.map(x => `<button class="tile ${x.series === 'o' ? 'o' : ''}" data-play="${x.id}"><span class="glyph">${x.km}</span><span>${x.rom}</span></button>`).join('')}</div>
      <div class="row"><a class="btn sm" href="#tools/sheets/${i}">Print tracing sheet for these letters</a></div>
      <div class="row" style="margin-top:24px"><button class="btn primary" id="topractice">Next: practice →</button></div>`;
    wirePlay(box);
    $('topractice').onclick = () => unit(i, 'practice');
  } else if (step === 'practice') {
    let right = 0, total = 0;
    const next = () => {
      box.innerHTML = `<p class="hint">Score: ${right}/${total}. Keep going until it feels easy, then take the test.</p><div id="q"></div>
        <div class="row"><button class="btn sm" id="totest">I'm ready for the test →</button></div>`;
      $('totest').onclick = () => unit(i, 'test');
      question(makeQ(u), $('q'), ok => { total++; if (ok) right++; next(); });
    };
    next();
  } else {
    const qs = Array.from({ length: 10 }, () => makeQ(u));
    let n = 0, right = 0;
    const next = () => {
      if (n === qs.length) {
        const pct = right * 10, pass = pct >= 70;
        if (pass) { passed[i] = Math.max(passed[i] ?? 0, pct); save('units', passed); addToReview(unitItems(u)); }
        box.innerHTML = `<div class="card big"><div class="rom">${pct}%</div>
          <p>${pass ? `Passed! ${UNITS[i + 1] ? 'Unit ' + (i + 2) + ' is unlocked.' : 'You finished the course!'} This unit's words were added to your Review cards.` : 'You need 70% to pass. Review the lesson and try again.'}</p>
          <div class="row" style="justify-content:center">${pass && UNITS[i + 1] ? `<a class="btn primary" href="#course/${i + 1}">Next unit →</a>` : ''}
          <button class="btn" id="retry">${pass ? 'Retake' : 'Try again'}</button><button class="btn" id="relearn">Back to lesson</button></div></div>`;
        $('retry').onclick = () => unit(i, 'test');
        $('relearn').onclick = () => unit(i, 'learn');
        return;
      }
      box.innerHTML = `<div class="progress"><div style="width:${n * 10}%"></div></div><p class="hint">Question ${n + 1} of ${qs.length}</p><div id="q"></div>`;
      question(qs[n++], $('q'), ok => { if (ok) right++; next(); });
    };
    next();
  }
  scrollTo(0, 0);
}

// One random exercise from a unit: listening, meaning, sentence building or grammar.
function makeQ(u) {
  const items = unitItems(u).filter(it => it.en);
  const others = UNITS.flatMap(unitItems).filter(it => it.en);
  const distract = (it, key) => shuffle([...new Set(shuffle(items.concat(others)).filter(x => x[key] !== it[key]).map(x => x[key]))].slice(0, 3));
  const sentences = u.examples.map(get).filter(it => it.rom.split(' ').length > 1);
  const type = pick(['listen', 'listen', 'meaning', 'build', 'grammar']);
  if (type === 'grammar') {
    const g = pick(u.quiz);
    return { kind: 'mc', prompt: `<b>${g.q}</b>`, opts: g.opts, a: g.opts[g.a], why: g.why };
  }
  if (type === 'build' && sentences.length) {
    const it = pick(sentences);
    return { kind: 'build', it, prompt: `Build this sentence: <b>${it.en}</b>` };
  }
  const it = pick(items);
  if (type === 'meaning') return { kind: 'mc', it, prompt: `How do you say <b>${it.en}</b>?`, opts: shuffle([it.rom, ...distract(it, 'rom')]), a: it.rom };
  return { kind: 'mc', it, listen: true, prompt: 'Listen. What does it mean?', opts: shuffle([it.en, ...distract(it, 'en')]), a: it.en };
}

function question(q, el, done) {
  const after = ok => {
    const extra = q.it ? `<div style="margin-top:8px">${phraseHTML(q.it)}</div>` : '';
    el.insertAdjacentHTML('beforeend', `<div class="card" style="border-color:var(--${ok ? 'ok' : 'bad'})">
      <b>${ok ? 'Correct!' : 'Not quite.'}</b> ${q.why || ''}${extra}
      <div class="row"><button class="btn primary" id="qnext">Next →</button></div></div>`);
    if (q.it) play(q.it);
    $('qnext').onclick = () => done(ok);
    $('qnext').focus();
  };
  if (q.kind === 'mc') {
    el.innerHTML = `<div class="card big">${q.listen ? '<button class="btn primary" id="qplay">▶ Play</button><p>' + q.prompt + '</p>' : '<p class="rom" style="font-size:20px">' + q.prompt + '</p>'}</div>
      <div class="opts">${q.opts.map(o => `<button class="btn">${esc(o)}</button>`).join('')}</div>`;
    if (q.listen) { $('qplay').onclick = () => play(q.it); play(q.it); }
    el.querySelectorAll('.opts .btn').forEach(b => b.onclick = () => {
      const ok = b.textContent === q.a;
      el.querySelectorAll('.opts .btn').forEach(x => { x.disabled = true; if (x.textContent === q.a) x.classList.add('ok'); });
      if (!ok) b.classList.add('bad');
      after(ok);
    });
  } else {
    const words = q.it.rom.split(' ');
    el.innerHTML = `<div class="card"><p>${q.prompt}</p><div class="tokens" id="ans"></div><div class="tokens" id="bank" style="border-style:solid"></div>
      <div class="row"><button class="btn primary" id="check">Check</button><button class="btn" id="hint">▶ Hint</button></div></div>`;
    const ans = $('ans'), bank = $('bank');
    shuffle(words).forEach(w => {
      const b = document.createElement('button');
      b.className = 'btn'; b.textContent = w;
      b.onclick = () => (b.parentElement === bank ? ans : bank).append(b);
      bank.append(b);
    });
    $('hint').onclick = () => play(q.it);
    $('check').onclick = () => {
      const ok = [...ans.children].map(b => b.textContent).join(' ') === q.it.rom;
      el.querySelectorAll('button').forEach(b => b.disabled = true);
      after(ok);
    };
  }
}

// ---- Phrasebook (daily phrase lessons) ----
function phrases(arg) {
  if (arg != null && LESSONS[+arg]) return phraseLesson(+arg);
  let html = `<div class="narrow"><p class="hint">Everyday phrases, one lesson a day. Say every phrase out loud.</p>`, level;
  LESSONS.forEach((l, i) => {
    if (l.level !== level) { level = l.level; html += `<h3 class="level">${level}</h3>`; }
    const locked = i > 0 && !done.includes(i - 1);
    const status = done.includes(i) ? '✓ done' : locked ? '🔒' : `${l.items.length} phrases`;
    html += `<button class="lesson" data-i="${i}" ${locked ? 'disabled' : ''}><b>Day ${i + 1}: ${l.title}</b><span>${status}</span></button>`;
  });
  view.innerHTML = html + '</div>';
  view.querySelectorAll('.lesson').forEach(b => b.onclick = () => location.hash = 'phrases/' + b.dataset.i);
}

function phraseLesson(i) {
  const l = LESSONS[i];
  view.innerHTML = `<div class="narrow"><p class="hint"><a href="#phrases">← All phrase lessons</a></p><h2>Day ${i + 1}: ${l.title}</h2><p class="hint">${l.level}. Play, repeat out loud, then record yourself to compare.</p>` +
    l.items.map(it => `<div class="card">${phraseHTML(it)}
      <div class="row"><button class="btn" data-play="${it.id}">▶ Play</button>
      <button class="btn" data-rec="${it.id}">🎙 Record</button><span id="out-${it.id}"></span></div></div>`).join('') +
    `<button class="btn primary" id="finish">Finish lesson → review</button></div>`;
  wirePlay();
  view.querySelectorAll('[data-rec]').forEach(b => b.onclick = () => record(BY_ID[b.dataset.rec], b));
  $('finish').onclick = () => {
    if (!done.includes(i)) done.push(i);
    save('done', done); addToReview(l.items); location.hash = 'practice';
  };
}

let rec;
async function record(item, btn) {
  if (rec?.state === 'recording') return rec.stop();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks = [];
    rec = new MediaRecorder(stream);
    rec.ondataavailable = e => chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      btn.textContent = '🎙 Record';
      const mine = document.createElement('audio');
      mine.controls = true;
      mine.src = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType }));
      $('out-' + item.id).replaceChildren(mine);
      play(item).onended = () => mine.play(); // native speaker first, then you
    };
    rec.start();
    btn.textContent = '⏹ Stop';
  } catch {
    alert('Microphone not available. Allow mic access (needs https or localhost).');
  }
}

// ---- Alphabet ----
function alphabet(tab = 'c') {
  const list = tab === 'c' ? DATA.consonants : DATA.vowels;
  const hint = tab === 'c'
    ? 'Tap a letter to hear it. Each consonant belongs to a series: <b>a-series</b> (white) has a higher "â" sound, <b>o-series</b> (shaded) a lower "ô" sound. The series changes how the vowel after it sounds.'
    : 'Vowels attach to a consonant. Here they are shown on ក (kâ). After an o-series consonant, most vowels sound different.';
  view.innerHTML = `<div class="tabs">
      <button class="btn ${tab === 'c' ? 'primary' : ''}" data-t="c">Consonants (33)</button>
      <button class="btn ${tab === 'v' ? 'primary' : ''}" data-t="v">Vowels</button></div>
    <p class="hint">${hint}</p>
    <div class="grid">${list.map(x => `<button class="tile ${x.series === 'o' ? 'o' : ''}" data-play="${x.id}">
      <span class="glyph">${x.km}</span><span>${x.rom}</span>${x.series ? `<small>${x.series}-series</small>` : ''}</button>`).join('')}</div>`;
  view.querySelectorAll('[data-t]').forEach(b => b.onclick = () => alphabet(b.dataset.t));
  wirePlay();
}

// ---- Verbs ----
const S_EN = { 'sj-i': ['I', 'am', "don't", "haven't"], 'sj-you': ['You', 'are', "don't", "haven't"], 'sj-he': ['He/she', 'is', "doesn't", "hasn't"],
  'sj-we': ['We', 'are', "don't", "haven't"], 'sj-they': ['They', 'are', "don't", "haven't"] };
const third = v => /(s|sh|ch|x|o)$/.test(v) ? v + 'es' : v + 's';
let verbState = { v: 'vb-eat', s: 'sj-i', cat: 'All' };
function verbs() {
  const cats = ['All', ...new Set(DATA.verbs.map(v => v.cat))];
  const st = verbState, v = BY_ID[st.v], s = BY_ID[st.s], [S, be, dont, havent] = S_EN[st.s];
  const mk = id => BY_ID['mk-' + id];
  const rows = [
    ['Present', [s, v], `${S} ${st.s === 'sj-he' ? third(v.en) : v.en}`],
    ['Happening now', [s, mk('kampung'), v], `${S} ${be} ${v.ing}`],
    ['Past', [s, mk('baan'), v], `${S} ${v.past}`],
    ['Already done', [s, v, mk('haey')], `${S} already ${v.past}`],
    ['Future', [s, mk('nueng'), v], `${S} will ${v.en}`],
    ['Negative', [s, mk('min'), v, mk('te')], `${S} ${dont} ${v.en}`],
    ['Not yet', [s, mk('minto'), v, mk('te')], `${S} ${havent} ${v.pp} yet`],
  ];
  const show = parts => parts.map(p => p.id.startsWith('mk-') ? `<span class="mk">${p.rom}</span>` : p.rom).join(' ');
  view.innerHTML = `<div class="narrow"><h2>Verb tenses</h2>
    <p class="hint">Khmer verbs <b>never change</b>. Small marker words (in color) show the time. Pick a verb and a person.</p>
    <div class="tabs">${cats.map(c => `<button class="btn sm ${c === st.cat ? 'primary' : ''}" data-cat="${c}">${c}</button>`).join('')}</div>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(110px,1fr))">${DATA.verbs.filter(x => st.cat === 'All' || x.cat === st.cat).map(x =>
      `<button class="tile ${x.id === st.v ? 'on' : ''}" data-v="${x.id}"><span class="kmi">${x.km}</span><span>${x.rom}</span><small>${x.en}</small></button>`).join('')}</div>
    <div class="tabs" style="margin-top:16px">${DATA.subjects.map(x => `<button class="btn sm ${x.id === st.s ? 'primary' : ''}" data-s="${x.id}">${x.rom} · ${x.en}</button>`).join('')}</div>
    <div class="card">${rows.map(([label, parts, en], n) => `<div class="vrow item"><div><span class="lbl">${label}</span>
      <b>${show(parts)}</b><span class="km">${parts.map(p => p.km).join('')}</span> <span class="hint">· ${en}</span></div>
      <button class="btn play" data-row="${n}" aria-label="Play">▶</button></div>`).join('')}</div>
    <p class="hint">Tip: with a time word like <i>msel minh</i> (yesterday), the marker is often dropped.</p></div>`;
  view.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { st.cat = b.dataset.cat; verbs(); });
  view.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { st.v = b.dataset.v; verbs(); });
  view.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { st.s = b.dataset.s; verbs(); });
  view.querySelectorAll('[data-row]').forEach(b => b.onclick = async () => {
    const parts = rows[+b.dataset.row][1];
    if (!(await speak(parts.map(p => p.km).join('')))) playSeq(parts); // whole sentence via tutor voice, else word by word
  });
}

// ---- Practice: review, quiz, games ----
function practice(tab = 'review') {
  main.innerHTML = `<div class="narrow"><div class="tabs">${[['review', 'Review cards'], ['quiz', 'Listening quiz'], ['games', 'Matching game']].map(([t, l]) =>
    `<button class="btn sm ${t === tab ? 'primary' : ''}" data-p="${t}">${l}</button>`).join('')}</div><div id="sub"></div></div>`;
  main.querySelectorAll('[data-p]').forEach(b => b.onclick = () => practice(b.dataset.p));
  view = $('sub');
  ({ review, quiz, games })[tab]();
}

function review() {
  const box = view;
  const queue = shuffle(Object.keys(srs).filter(id => srs[id].due <= Date.now() && BY_ID[id]?.en));
  const next = () => {
    if (!queue.length) {
      box.innerHTML = `<div class="card big"><div class="rom">All caught up 🎉</div>
        <p class="hint">${Object.keys(srs).length ? 'Come back tomorrow, or keep going in the course.' : 'Pass a course unit or finish a phrase lesson to get cards.'}</p></div>`;
      return;
    }
    const it = BY_ID[queue[0]];
    box.innerHTML = `<p class="hint">${queue.length} left. Say it in Khmer, then reveal.</p>
      <div class="card big"><div class="rom">${it.en}</div><div id="ans"></div>
      <div class="row" style="justify-content:center"><button class="btn primary" id="reveal">Reveal</button></div></div>`;
    $('reveal').onclick = () => {
      $('ans').innerHTML = `<hr><div class="rom">${it.rom}</div><div class="km">${it.km}</div>`;
      play(it);
      $('reveal').parentElement.innerHTML =
        `<button class="btn" id="rep">▶</button><button class="btn bad" id="again">Again</button><button class="btn ok" id="good">Got it</button>`;
      $('rep').onclick = () => play(it);
      $('again').onclick = () => { grade(it.id, false); queue.push(queue.shift()); next(); };
      $('good').onclick = () => { grade(it.id, true); queue.shift(); next(); };
    };
  };
  next();
}

function grade(id, ok) {
  const box = ok ? Math.min(srs[id].box + 1, GAPS.length - 1) : 0;
  srs[id] = { box, due: Date.now() + GAPS[box] * DAY };
  save('srs', srs);
}

function quiz() {
  const box = view, pool = learned();
  if (pool.length < 4) {
    box.innerHTML = `<div class="card big"><p class="hint">Pass Unit 1 or finish a phrase lesson to unlock the quiz.</p></div>`;
    return;
  }
  let right = 0, total = 0;
  const ask1 = () => {
    if (!box.isConnected) return; // left the page
    const it = pick(pool);
    const opts = shuffle([it, ...shuffle(pool.filter(p => p !== it)).slice(0, 3)]);
    box.innerHTML = `<p class="hint">Score: ${right}/${total}. Listen and pick the meaning.</p>
      <div class="card big"><button class="btn primary" id="hear">▶ Play again</button><div id="rev"></div></div>
      <div class="opts">${opts.map(o => `<button class="btn" data-id="${o.id}">${o.en}</button>`).join('')}</div>`;
    $('hear').onclick = () => play(it);
    play(it);
    box.querySelectorAll('.opts .btn').forEach(b => b.onclick = () => {
      total++;
      const ok = b.dataset.id === it.id;
      if (ok) right++;
      box.querySelectorAll('.opts .btn').forEach(x => { x.disabled = true; if (x.dataset.id === it.id) x.classList.add('ok'); });
      if (!ok) b.classList.add('bad');
      $('rev').innerHTML = `<div style="margin-top:12px">${phraseHTML(it)}</div>`;
      setTimeout(ask1, ok ? 1200 : 3000);
    });
  };
  ask1();
}

function games(mode = 'phrases') {
  const box = view;
  const pool = learned().length >= 5 ? learned() : unitItems(UNITS[0]).filter(x => x.en);
  const pairs = mode === 'letters'
    ? shuffle(DATA.consonants).slice(0, 5).map(c => ({ it: c, a: `<span class="glyph">${c.km}</span>`, b: c.rom }))
    : shuffle(pool).slice(0, 5).map(p => ({ it: p, a: p.rom, b: p.en }));
  const tiles = side => shuffle(pairs).map(p => `<button class="tile" data-side="${side}" data-id="${p.it.id}">${side === 'a' ? p.a : p.b}</button>`);
  const left = tiles('a'), right = tiles('b');
  box.innerHTML = `<div class="tabs">
      <button class="btn sm ${mode === 'phrases' ? 'primary' : ''}" data-m="phrases">Words</button>
      <button class="btn sm ${mode === 'letters' ? 'primary' : ''}" data-m="letters">Letters</button></div>
    <p class="hint">Tap one on each side to match them.</p>
    <div class="match">${left.map((l, i) => l + right[i]).join('')}</div><div id="win"></div>`;
  box.querySelectorAll('[data-m]').forEach(b => b.onclick = () => games(b.dataset.m));
  let sel = null, matched = 0;
  box.querySelectorAll('.match .tile').forEach(t => t.onclick = () => {
    if (t.classList.contains('done')) return;
    if (!sel || sel.dataset.side === t.dataset.side) {
      sel?.classList.remove('sel');
      sel = t; t.classList.add('sel');
      return;
    }
    if (sel.dataset.id === t.dataset.id) {
      [sel, t].forEach(x => { x.classList.remove('sel'); x.classList.add('done'); });
      play(BY_ID[t.dataset.id]);
      if (++matched === pairs.length) {
        $('win').innerHTML = `<div class="card big"><div class="rom">Nice! 🎉</div><button class="btn primary" id="again">Play again</button></div>`;
        $('again').onclick = () => games(mode);
      }
    } else {
      const s = sel;
      [s, t].forEach(x => x.classList.add('wrong'));
      setTimeout(() => [s, t].forEach(x => x.classList.remove('wrong', 'sel')), 500);
    }
    sel = null;
  });
}

// ---- AI tutor ----
let chatLog = load('chat', []);
let autoSpeak = load('autospeak', true);
function tutorSettings(box, after) {
  box.innerHTML = `<div class="card"><h3 style="margin-top:0">Connect your tutor</h3>
    <p class="hint">Paste the server address from your Cloudflare worker and your password. These stay on this device only.</p>
    <label>Server address<input id="turl" placeholder="https://khmer-tutor.yourname.workers.dev" value="${esc(tutor.url)}"></label>
    <label style="display:block;margin-top:10px">Password<input id="tpass" type="password" value="${esc(tutor.pass)}"></label>
    <div class="row"><button class="btn primary" id="tsave">Save</button></div></div>`;
  $('tsave').onclick = () => {
    tutor = { url: $('turl').value.trim(), pass: $('tpass').value };
    save('tutor', tutor); after();
  };
}

function bubble(m, i) {
  const html = esc(m.content).replace(/([ក-៿᧠-᧿][ក-៿᧠-᧿\s?!.,…]*)/g, '<span class="kmi">$1</span>').replace(/\n/g, '<br>');
  return `<div class="msg ${m.role === 'user' ? 'me' : 'ai'}">${html}${m.role === 'assistant' && khmerOnly(m.content) ? ` <button class="btn sm" data-say="${i}" aria-label="Speak">🔊</button>` : ''}</div>`;
}

function tutorPage() {
  if (!tutor.url) return tutorSettings(view, tutorPage);
  const chips = ['How do I say "I love you, Mom"?', "Let's practice greeting my partner's parents", 'Quiz me on numbers', 'Teach me how to order food'];
  view.innerHTML = `<div class="narrow"><div class="row" style="margin-top:0;justify-content:space-between">
      <h2 style="margin:0">AI Tutor</h2>
      <span><label class="hint"><input type="checkbox" id="auto" ${autoSpeak ? 'checked' : ''} style="width:auto"> Speak replies</label>
      <button class="btn sm" id="clear">New chat</button> <button class="btn sm" id="gear" aria-label="Settings">⚙</button></span></div>
    <p class="hint">Ask anything in English or Khmer. Your teacher answers with Khmer script, romanization and English, and speaks the Khmer out loud.</p>
    ${kmVoice ? '' : '<p class="card hint">🔈 This browser has no Khmer voice, so replies will be silent. Open this site in <b>Microsoft Edge</b> to hear Sreymom for free.</p>'}
    <div class="chat" id="log"></div>
    <div class="tabs" id="chips">${chips.map(c => `<button class="btn sm">${esc(c)}</button>`).join('')}</div>
    <div class="composer"><textarea id="say" placeholder="Type or tap 🎤 to talk…"></textarea>
      <button class="btn" id="mic" aria-label="Talk">🎤</button><select id="micl" aria-label="Mic language"><option value="en-US">EN</option><option value="km-KH">ខ្មែរ</option></select>
      <button class="btn primary" id="send">Send</button></div></div>`;
  const log = $('log'), input = $('say');
  const render = () => {
    log.innerHTML = chatLog.map(bubble).join('');
    log.querySelectorAll('[data-say]').forEach(b => b.onclick = () => speak(chatLog[+b.dataset.say].content));
    $('chips').style.display = chatLog.length ? 'none' : '';
    scrollTo(0, document.body.scrollHeight);
  };
  const send = async text => {
    text = text.trim();
    if (!text) return;
    chatLog.push({ role: 'user', content: text });
    input.value = ''; render();
    log.insertAdjacentHTML('beforeend', '<div class="msg ai hint" id="typing">…</div>');
    try {
      const reply = await ask('chat', chatLog.slice(-20));
      chatLog.push({ role: 'assistant', content: reply });
      save('chat', chatLog.slice(-40));
      render();
      if (autoSpeak) speak(reply);
    } catch (e) {
      $('typing')?.remove();
      log.insertAdjacentHTML('beforeend', `<div class="msg ai" style="border-color:var(--bad)">Couldn't reach the tutor: ${esc(e.message)}. Check the address and password (⚙).</div>`);
    }
  };
  render();
  $('send').onclick = () => send(input.value);
  input.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); } };
  $('chips').querySelectorAll('button').forEach(b => b.onclick = () => send(b.textContent));
  $('auto').onchange = e => { autoSpeak = e.target.checked; save('autospeak', autoSpeak); };
  $('clear').onclick = () => { chatLog = []; save('chat', chatLog); render(); };
  $('gear').onclick = () => tutorSettings(view, tutorPage);
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { $('mic').style.display = $('micl').style.display = 'none'; return; }
  $('mic').onclick = () => {
    const r = new SR();
    r.lang = $('micl').value;
    r.onresult = e => send(e.results[0][0].transcript);
    r.onend = () => $('mic').textContent = '🎤';
    $('mic').textContent = '⏺';
    r.start();
  };
}

// ---- Tools: translator, keyboard, worksheets ----
function tools(tab = 'translate', arg) {
  main.innerHTML = `<div class="narrow"><div class="tabs noprint">${[['translate', 'Translator'], ['keyboard', 'Khmer keyboard'], ['sheets', 'Handwriting sheets']].map(([t, l]) =>
    `<button class="btn sm ${t === tab ? 'primary' : ''}" data-tool="${t}">${l}</button>`).join('')}</div><div id="sub"></div></div>`;
  main.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => tools(b.dataset.tool));
  view = $('sub');
  ({ translate, keyboard, sheets })[tab](arg);
}

function translate() {
  if (!tutor.url) {
    view.innerHTML = `<div class="card"><p>The translator uses your AI tutor server. <a href="#tutor">Connect it on the AI Tutor page</a> first.</p></div>`;
    return;
  }
  view.innerHTML = `<div class="card"><label>English (or Khmer)<textarea id="tin" rows="3" placeholder="e.g. Grandma, the food is delicious!"></textarea></label>
    <div class="row"><button class="btn primary" id="go">Translate</button></div></div><div id="tout"></div>`;
  $('go').onclick = async () => {
    const text = $('tin').value.trim();
    if (!text) return;
    $('tout').innerHTML = '<p class="hint">Translating…</p>';
    try {
      const reply = await ask('translate', [{ role: 'user', content: text }]);
      $('tout').innerHTML = `<div class="card">${bubble({ role: 'assistant', content: reply }, 0).replace('class="msg ai"', 'style=""')}</div>`;
      $('tout').querySelector('[data-say]')?.addEventListener('click', () => speak(reply));
      speak(reply);
    } catch (e) { $('tout').innerHTML = `<div class="card">Couldn't translate: ${esc(e.message)}</div>`; }
  };
}

function keyboard() {
  const vowels = 'ា ិ ី ឹ ឺ ុ ូ ួ ើ ឿ ៀ េ ែ ៃ ោ ៅ ំ ះ'.split(' ');
  const signs = ['្', '់', '៉', '៊', '។', '?'];
  const digits = '០ ១ ២ ៣ ៤ ៥ ៦ ៧ ៨ ៩'.split(' ');
  const keys = (label, list) => `<p class="hint" style="margin:12px 0 4px">${label}</p><div class="kb">${list.map(k => `<button data-k="${k}">${k}</button>`).join('')}</div>`;
  view.innerHTML = `<textarea id="kbt" class="kbtext" lang="km" placeholder="ខ្មែរ"></textarea>
    <div class="row"><button class="btn sm" data-k=" ">Space</button><button class="btn sm" id="bs">⌫ Delete</button>
      <button class="btn sm" id="copy">Copy</button><button class="btn sm" id="clr">Clear</button>
      <button class="btn sm primary" id="sayit">🔊 Speak it</button></div>
    ${keys('Consonants', DATA.consonants.map(c => c.km))}${keys('Vowels (type after a consonant)', vowels)}
    ${keys('Signs: ្ stacks the next consonant below (subscript)', signs)}${keys('Numbers', digits)}`;
  const t = $('kbt');
  view.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { t.setRangeText(b.dataset.k, t.selectionStart, t.selectionEnd, 'end'); t.focus(); });
  $('bs').onclick = () => { t.value = [...t.value].slice(0, -1).join(''); t.focus(); };
  $('clr').onclick = () => { t.value = ''; };
  $('copy').onclick = () => navigator.clipboard?.writeText(t.value);
  $('sayit').onclick = async () => { if (!(await speak(t.value))) alert('No Khmer voice in this browser. Try Microsoft Edge.'); };
}

function sheets(arg) {
  const sets = [['all', 'All 33 consonants', DATA.consonants], ['vowels', 'Vowels', DATA.vowels],
    ...UNITS.map((u, i) => [String(i), `Unit ${i + 1} letters`, u.script.map(get)])];
  const cur = sets.find(s => s[0] === String(arg)) || sets[0];
  view.innerHTML = `<div class="noprint"><p class="hint">Trace the gray letters, then write your own in the empty boxes. Print or save as PDF.</p>
    <div class="row" style="margin-top:0"><select id="set">${sets.map(s => `<option value="${s[0]}" ${s === cur ? 'selected' : ''}>${s[1]}</option>`).join('')}</select>
    <button class="btn primary" id="print">🖨 Print</button></div></div>
    <div class="sheet" style="margin-top:12px">${cur[2].map(x => `<div class="srow"><div class="cell">${x.km}</div>${`<div class="cell trace">${x.km}</div>`.repeat(4)}<div class="cell"></div><div class="cell"></div></div>`).join('')}</div>`;
  $('set').onchange = e => sheets(e.target.value);
  $('print').onclick = () => print();
}

// ---- Culture ----
function culture() {
  view.innerHTML = `<div class="narrow"><p class="hint">Small things that matter when you speak with family.</p>` +
    DATA.culture.map(c => `<div class="card"><b>${c.title}</b><p style="margin:6px 0 0">${c.text}</p></div>`).join('') + '</div>';
}

// ---- Router: #page or #page/arg ----
const VIEWS = { home, course, phrases, lessons: phrases, alphabet, verbs, practice, tutor: tutorPage, tools, culture };
function route() {
  const [name, a, b] = location.hash.slice(1).split('/');
  const v = VIEWS[name] ? name : 'home';
  document.querySelectorAll('nav a').forEach(x => x.classList.toggle('on', x.getAttribute('href') === '#' + (v === 'lessons' ? 'phrases' : v)));
  view = main;
  if (v === 'tools') tools(a || 'translate', b);
  else if (v === 'practice') practice(a || 'review');
  else VIEWS[v](a);
  if (v !== 'tutor') scrollTo(0, 0);
}
addEventListener('hashchange', route);
const vsel = $('voice');
vsel.value = voice;
vsel.onchange = () => { voice = vsel.value; save('voice', voice); };
route();
