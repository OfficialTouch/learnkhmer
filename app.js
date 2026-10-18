// Browsers can keep an old index.html; if the live one points to a newer app.js, reload once.
const APP_V = document.currentScript?.src.match(/v=(\d+)/)?.[1];
fetch('index.html', { cache: 'no-store' }).then(r => r.text()).then(t => {
  const live = t.match(/app\.js\?v=(\d+)/)?.[1];
  if (live && APP_V && live !== APP_V && !sessionStorage.getItem('km-reloaded-' + live)) {
    sessionStorage.setItem('km-reloaded-' + live, 1); location.reload();
  }
}).catch(() => {});
const main = document.getElementById('main');
const LESSONS = DATA.lessons, UNITS = DATA.units;
const BY_ID = {};
const register = list => list.forEach(x => { if (typeof x === 'object') BY_ID[x.id] = x; });
register(LESSONS.flatMap(l => l.items));
[DATA.consonants, DATA.vowels, DATA.subjects, DATA.markers, DATA.verbs].forEach(register);
UNITS.forEach(u => { register(u.vocab); register(u.examples); });
[...DATA.grandma, ...DATA.casual].forEach(t => register(t.items));
const get = x => typeof x === 'string' ? BY_ID[x] : x;

const DAY = 864e5, GAPS = [0, 1, 3, 7, 14, 30, 90]; // review gap in days per box
let srs = load('srs', {});         // id -> {box, due}
let done = load('done', []);       // finished phrase-lesson indexes
let passed = load('units', {});    // unit index -> best test score
let voice = load('voice', 'f');
const TUTOR_URL = 'https://khmer-tutor.abtouch01.workers.dev'; // main server: tutor (password-protected) and accounts
let tutor = load('tutor', { url: '', pass: '' });
if (!tutor.url) tutor.url = TUTOR_URL;
let view = main;                   // where the current page renders (sub-tabs swap it)

function load(k, d) { try { return JSON.parse(localStorage.getItem('km-' + k)) ?? d; } catch { return d; } }
function save(k, v) { try { localStorage.setItem('km-' + k, JSON.stringify(v)); } catch {} if (k !== 'account') queuePush(); }

// ---- Accounts: progress (everything saved under km-) is copied to the server so it follows you to any device ----
let acct = load('account', null); // { name, token }
const accountApi = async body => {
  const r = await fetch(TUTOR_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'account', ...body }), keepalive: true });
  const j = await r.json().catch(() => ({ error: 'Bad response from server' }));
  if (!r.ok || j.error) throw new Error(j.error || r.statusText);
  return j;
};
function snapshot() {
  const d = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('km-') && k !== 'km-account') d[k] = localStorage.getItem(k); }
  return d;
}
function applyServer(data) { // replace local progress with the account's, then restart the app on it
  if (!data || JSON.stringify(data) === JSON.stringify(snapshot())) return false;
  Object.keys(snapshot()).forEach(k => localStorage.removeItem(k));
  Object.entries(data).forEach(([k, v]) => localStorage.setItem(k, v));
  location.reload();
  return true;
}
let pushTimer = null;
function queuePush() { if (acct) { clearTimeout(pushTimer); pushTimer = setTimeout(pushNow, 4000); } }
function pushNow() {
  if (!acct || !pushTimer) return;
  clearTimeout(pushTimer); pushTimer = null;
  accountApi({ action: 'put', token: acct.token, data: snapshot() }).catch(e => console.warn('progress not saved:', e.message));
}
addEventListener('visibilitychange', () => { if (document.hidden) pushNow(); });
if (acct) accountApi({ action: 'get', token: acct.token }).then(j => j.data ? applyServer(j.data) : (pushTimer = 1, pushNow()))
  .catch(e => { if (/sign in/i.test(e.message)) { acct = null; save('account', null); } });

function account() {
  const tag = $('acct');
  if (acct) {
    view.innerHTML = `<div class="narrow"><div class="card"><h2 style="margin-top:0">Your account</h2>
      <p>Signed in as <b>${esc(acct.name)}</b>. Your course, flashcards and chat save automatically, so you can pick up on any device.</p>
      <div class="row"><button class="btn" id="signout">Sign out</button></div></div></div>`;
    $('signout').onclick = () => { pushNow(); acct = null; save('account', null); tag.textContent = '👤 Sign in'; account(); };
    return;
  }
  view.innerHTML = `<div class="narrow"><div class="card"><h2 style="margin-top:0">Sign in</h2>
    <p class="hint">Make a free account so your progress follows you to your phone, tablet or computer.</p>
    <label style="display:block">Username<input id="aname" autocomplete="username" autocapitalize="none"></label>
    <label style="display:block;margin-top:10px">Password<input id="apass" type="password" autocomplete="current-password"></label>
    <div class="row"><button class="btn primary" id="alogin">Sign in</button><button class="btn" id="asignup">Create account</button></div>
    <p class="hint" id="amsg" role="status"></p></div></div>`;
  const go = action => async () => {
    $('amsg').textContent = '…';
    try {
      const j = await accountApi({ action, name: $('aname').value, pass: $('apass').value });
      acct = { name: $('aname').value.trim().toLowerCase(), token: j.token }; save('account', acct);
      tag.textContent = '👤 ' + acct.name;
      if (!applyServer(j.data)) { pushTimer = 1; pushNow(); account(); } // new account: upload what's on this device
    } catch (e) { $('amsg').textContent = e.message; }
  };
  $('alogin').onclick = go('login');
  $('asignup').onclick = go('signup');
}
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
let kmVoice = null;
let ttsSpeed = load('ttsspeed', 0.8); // tutor voice speed (1 = normal)
const findVoice = () => {
  kmVoice = (window.speechSynthesis?.getVoices() || []).filter(v => /^km/i.test(v.lang))
    .sort((a, b) => /sreymom/i.test(b.name) - /sreymom/i.test(a.name))[0] || null;
};
window.speechSynthesis?.addEventListener?.('voiceschanged', findVoice);
findVoice();
function browserSpeak(km) {
  if (!kmVoice) return false;
  const u = new SpeechSynthesisUtterance(km);
  u.voice = kmVoice; u.lang = kmVoice.lang; u.rate = ttsSpeed;
  speechSynthesis.cancel(); speechSynthesis.speak(u);
  return true;
}
// full = read the whole message (English voice + Khmer voice); otherwise only the Khmer script.
let nowPlaying = null;
async function speak(text, full = false) {
  const km = khmerOnly(text);
  if (!km && !full) return false;
  const say = full ? text : km, key = (full ? 'full:' : '') + say;
  if (tutor.pass) {
    try {
      if (!ttsCache.has(key)) {
        const r = await fetch(tutor.url, { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode: 'tts', password: tutor.pass, text: say, full }) });
        if (!r.ok) throw new Error(r.status);
        ttsCache.set(key, URL.createObjectURL(await r.blob()));
      }
      nowPlaying?.pause(); // one voice at a time: a new one stops the old one
      const a = nowPlaying = new Audio(ttsCache.get(key));
      a.playbackRate = ttsSpeed; // browsers keep the pitch natural when slowed
      await a.play();
      await new Promise(done => { a.onended = a.onpause = done; }); // resolve when it finishes, so buttons can wait
      return true;
    } catch (e) { console.warn('tutor voice failed:', e.message); } // try again next time; one hiccup shouldn't silence the page
  }
  return km ? browserSpeak(km) : false;
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
    <div style="flex:1"><b>${it.rom}</b><span class="km">${it.km}</span> <span class="hint">· ${it.en}</span></div>${cardBtn(it.id)}</div>`;
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
    ['practice/cards', 'Flashcards & practice', 'Flip through any word set, plus smart review, a listening quiz and matching games.'],
    ['tools', 'Tools', 'Translator, Khmer keyboard and printable handwriting sheets.'],
    ['casual', 'Casual Talk', 'What people really say: slang, reactions and everyday lines.'],
    ['grandma', 'Learn with Grandma', 'Phrases to ask Grandma so she can teach you, plus a printable sheet.'],
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
    wirePlay(box); wireCards(box);
    $('topractice').onclick = () => unit(i, 'practice');
  } else if (step === 'practice') {
    let right = 0, total = 0; const used = new Set();
    const next = () => {
      box.innerHTML = `<p class="hint">Score: ${right}/${total}. Keep going until it feels easy, then take the test.</p><div id="q"></div>
        <div class="row"><button class="btn sm" id="totest">I'm ready for the test →</button></div>`;
      $('totest').onclick = () => unit(i, 'test');
      question(makeQ(u, used), $('q'), ok => { total++; if (ok) right++; next(); });
    };
    next();
  } else {
    const used = new Set(), qs = Array.from({ length: 10 }, () => makeQ(u, used));
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
function makeQ(u, used = new Set()) {
  // Prefer words/questions not asked yet in this test or practice session.
  const fresh = arr => { const f = arr.filter(x => !used.has(x.id ?? x.q)); const x = pick(f.length ? f : arr); used.add(x.id ?? x.q); return x; };
  const items = unitItems(u).filter(it => it.en);
  const others = UNITS.flatMap(unitItems).filter(it => it.en);
  const distract = (it, key) => shuffle([...new Set(shuffle(items.concat(others)).filter(x => x[key] !== it[key]).map(x => x[key]))].slice(0, 3));
  const sentences = u.examples.map(get).filter(it => it.rom.split(' ').length > 1);
  const left = arr => arr.some(x => !used.has(x.id ?? x.q));
  const extra = [...(left(sentences) ? ['build'] : []), ...(left(u.quiz) ? ['grammar'] : [])];
  const type = pick(left(items) || !extra.length ? ['listen', 'listen', 'meaning', ...extra] : extra);
  if (type === 'grammar') {
    const g = fresh(u.quiz);
    return { kind: 'mc', prompt: `<b>${g.q}</b>`, opts: g.opts, a: g.opts[g.a], why: g.why };
  }
  if (type === 'build') {
    const it = fresh(sentences);
    return { kind: 'build', it, prompt: `Build this sentence: <b>${it.en}</b>` };
  }
  const it = fresh(items);
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
      <button class="btn" data-rec="${it.id}">🎙 Record</button>${cardBtn(it.id)}<span id="out-${it.id}"></span></div></div>`).join('') +
    `<button class="btn primary" id="finish">Finish lesson → review</button></div>`;
  wirePlay(); wireCards();
  view.querySelectorAll('[data-rec]').forEach(b => b.onclick = () => record(BY_ID[b.dataset.rec], b));
  $('finish').onclick = () => {
    if (!done.includes(i)) done.push(i);
    save('done', done); addToReview(l.items); location.hash = 'practice/review';
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
function practice(tab = 'cards') {
  if (!['cards', 'review', 'quiz', 'games'].includes(tab)) tab = 'cards';
  main.innerHTML = `<div class="narrow"><div class="tabs">${[['cards', 'Flashcards'], ['review', 'Review cards'], ['quiz', 'Listening quiz'], ['games', 'Matching game']].map(([t, l]) =>
    `<button class="btn sm ${t === tab ? 'primary' : ''}" data-p="${t}">${l}</button>`).join('')}</div><div id="sub"></div></div>`;
  main.querySelectorAll('[data-p]').forEach(b => b.onclick = () => practice(b.dataset.p));
  view = $('sub');
  ({ cards, review, quiz, games })[tab]();
}

// ---- Flashcards: your own deck plus any word set, tap to flip, read aloud ----
let myCards = load('mycards', []); // ids added with "+ Flashcard"
const isMine = id => myCards.includes(id);
function toggleCard(id) {
  myCards = isMine(id) ? myCards.filter(x => x !== id) : [...myCards, id];
  save('mycards', myCards);
}
const cardBtn = id => `<button class="btn sm addcard" data-card="${id}" aria-pressed="${isMine(id)}">${isMine(id) ? '★ In flashcards' : '＋ Flashcard'}</button>`;
function wireCards(root = view) {
  root.querySelectorAll('[data-card]').forEach(b => b.onclick = () => {
    toggleCard(b.dataset.card);
    b.outerHTML = cardBtn(b.dataset.card);
    wireCards(root);
  });
}

// English side spoken by the browser's own English voice (every device has one); Khmer by the Sreymom recording.
function sayEnglish(text) {
  if (!text || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text.replace(/\(.*?\)/g, ''));
  u.lang = 'en-US'; u.rate = 0.95;
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}
const sayKhmerThenEnglish = it => { const a = play(it); if (it.en) a.onended = () => sayEnglish(it.en); };

const DECKS = [
  ['mine', '⭐ My flashcards', () => myCards.map(id => BY_ID[id]).filter(Boolean)],
  ...UNITS.map((u, i) => [`u${i}`, `Unit ${i + 1}: ${u.title}`, () => unitItems(u)]),
  ...LESSONS.map((l, i) => [`p${i}`, `Phrases Day ${i + 1}: ${l.title}`, () => l.items]),
  ...DATA.grandma.map((t, i) => [`g${i}`, `Grandma: ${t.title}`, () => t.items.map(get)]),
  ...DATA.casual.map((t, i) => [`c${i}`, `Casual: ${t.title}`, () => t.items.map(get)]),
  ['verbs', 'Verbs', () => DATA.verbs],
  ['letters', 'Alphabet: consonants', () => DATA.consonants],
  ['vowels', 'Alphabet: vowels', () => DATA.vowels],
];
let fc = { deck: load('fcdeck', myCards.length ? 'mine' : 'u0'), dir: load('fcdir', 'km'), auto: load('fcauto', true), order: null, i: 0 };
function cards() {
  const box = view;
  const deck = DECKS.find(d => d[0] === fc.deck) || DECKS[0];
  const items = deck[2]();
  const picker = `<div class="row" style="margin-top:0">
      <select id="fcdeck" aria-label="Word set" style="flex:1;min-width:0">${DECKS.map(d => `<option value="${d[0]}" ${d === deck ? 'selected' : ''}>${d[1]}${d[0] === 'mine' ? ` (${myCards.length})` : ''}</option>`).join('')}</select></div>`;
  const wirePicker = () => $('fcdeck').onchange = e => { fc = { ...fc, deck: e.target.value, order: null, i: 0 }; save('fcdeck', fc.deck); cards(); };
  if (!items.length) {
    box.innerHTML = picker + `<div class="card big"><p>No cards here yet.</p>
      <p class="hint">In the course, tap <b>＋ Flashcard</b> next to any word to add it to your deck.</p>
      <a class="btn primary" href="#course">Go to the course</a></div>`;
    return wirePicker();
  }
  if (!fc.order || fc.order.length !== items.length) fc.order = items.map((_, n) => n);
  fc.i = Math.max(0, Math.min(fc.i, items.length - 1));
  const it = items[fc.order[fc.i]];
  const kmFirst = fc.dir === 'km' || !it.en;
  const front = kmFirst ? `<div class="kmi" style="font-size:42px;line-height:1.5">${it.km}</div>` : `<div class="rom">${it.en}</div>`;
  const reveal = kmFirst
    ? `<div class="rom">${it.rom}</div><div class="en">${it.en || ''}</div>`
    : `<div class="kmi" style="font-size:34px;line-height:1.5">${it.km}</div><div class="rom">${it.rom}</div>`;
  box.innerHTML = picker + `<div class="row">
      <button class="btn sm ${fc.dir === 'km' ? 'primary' : ''}" data-dir="km">Khmer → English</button>
      <button class="btn sm ${fc.dir === 'en' ? 'primary' : ''}" data-dir="en">English → Khmer</button>
      <button class="btn sm" id="fcshuf">🔀 Shuffle</button>
      <label class="hint"><input type="checkbox" id="fcauto" ${fc.auto ? 'checked' : ''} style="width:auto"> Read aloud</label></div>
    <button class="card big flash" id="fccard" aria-label="Flip card">
      ${front}<div id="fcback" hidden><hr>${reveal}</div>
      <p class="hint" id="fchint" style="margin-bottom:0">Tap to flip</p></button>
    <div class="row" style="justify-content:space-between">
      <button class="btn" id="fcprev" ${fc.i === 0 ? 'disabled' : ''}>← Back</button>
      <span class="hint">${fc.i + 1} / ${items.length}</span>
      <button class="btn" id="fcplay">▶ Hear it</button>
      <button class="btn primary" id="fcnext" ${fc.i === items.length - 1 ? 'disabled' : ''}>Next →</button></div>
    <div class="row">${cardBtn(it.id)}</div>
    <p class="hint">Keyboard: Space flips, ← → move.</p>`;
  // Read the side you're looking at: Khmer side = Sreymom recording, English side = English voice.
  const readFront = () => kmFirst ? play(it) : sayEnglish(it.en);
  const readBack = () => kmFirst ? sayEnglish(it.en) : play(it);
  const flip = () => {
    const b = $('fcback'); b.hidden = !b.hidden; $('fchint').hidden = !b.hidden;
    if (!b.hidden && fc.auto) readBack();
  };
  const go = d => { fc.i = Math.max(0, Math.min(items.length - 1, fc.i + d)); cards(); };
  $('fccard').onclick = flip;
  $('fcplay').onclick = () => sayKhmerThenEnglish(it);
  $('fcprev').onclick = () => go(-1);
  $('fcnext').onclick = () => go(1);
  $('fcshuf').onclick = () => { fc.order = shuffle(fc.order); fc.i = 0; cards(); };
  $('fcauto').onchange = e => { fc.auto = e.target.checked; save('fcauto', fc.auto); };
  wirePicker();
  box.querySelectorAll('[data-dir]').forEach(b => b.onclick = () => { fc.dir = b.dataset.dir; save('fcdir', fc.dir); cards(); });
  box.querySelector('[data-card]').onclick = () => { toggleCard(it.id); fc.order = null; cards(); };
  if (fc.auto) readFront();
  document.onkeydown = e => {
    if (!$('fccard') || e.target.closest('input, textarea, select, #chatpanel')) return;
    if (e.key === ' ') { e.preventDefault(); flip(); }
    if (e.key === 'ArrowRight') go(1);
    if (e.key === 'ArrowLeft') go(-1);
  };
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
  box.innerHTML = `<div class="card"><div class="row" style="margin-top:0;justify-content:space-between"><h3 style="margin:0">Sign in to the tutor</h3>
    ${box === panel ? '<button class="btn sm" id="tclose2" aria-label="Close">✕</button>' : ''}</div>
    <p class="hint">Enter the tutor password. It's saved on this device (and in your account, if you're signed in).</p>
    <label style="display:block">Tutor password<input id="tpass" type="password" autocomplete="off" value="${esc(tutor.pass)}"></label>
    <details style="margin-top:10px" ${tutor.url !== TUTOR_URL ? 'open' : ''}><summary class="hint">Use your own tutor server</summary>
      <p class="hint">Set up your own free server with the steps in the project README, then paste its address. Leave blank to use the main tutor.</p>
      <input id="turl" placeholder="https://your-server.workers.dev" value="${tutor.url !== TUTOR_URL ? esc(tutor.url) : ''}"></details>
    <div class="row"><button class="btn primary" id="tsave">Save</button></div></div>`;
  box.querySelector('#tclose2')?.addEventListener('click', closeTutor);
  box.querySelector('#tsave').onclick = () => {
    tutor = { url: box.querySelector('#turl').value.trim() || TUTOR_URL, pass: box.querySelector('#tpass').value };
    save('tutor', tutor); after();
  };
}

function bubble(m, i) {
  const html = esc(m.content).replace(/([ក-៿᧠-᧿][ក-៿᧠-᧿\s?!.,…]*)/g, '<span class="kmi">$1</span>').replace(/\n/g, '<br>');
  return `<div class="msg ${m.role === 'user' ? 'me' : 'ai'}">${html}${m.role === 'assistant' ? ` <button class="btn sm" data-say="${i}" aria-label="Speak">🔊</button>` : ''}</div>`;
}

// The tutor: a small help-style chat box in the corner of every page (collapses to a bubble),
// plus a full AI Tutor page. Both show the same conversation.
const panel = $('chatpanel'), fab = $('chatfab');
let onTutorPage = false;
function openTutor() {
  if (onTutorPage) return;
  panel.hidden = false; fab.hidden = true;
  tutorView(panel);
  panel.querySelector('#say')?.focus();
}
function closeTutor() { panel.hidden = true; panel.innerHTML = ''; fab.hidden = onTutorPage; }
fab.onclick = openTutor;
const tutorPage = () => { closeTutor(); tutorView(main); };

// Highlight part of a tutor reply to hear just that part.
const sayBtn = Object.assign(document.createElement('button'), { className: 'btn sm primary', textContent: '🔊 Say this' });
sayBtn.style.cssText = 'position:fixed;z-index:30;display:none;box-shadow:0 4px 14px rgba(0,0,0,.25)';
document.body.append(sayBtn);
let sayText = '';
document.addEventListener('selectionchange', () => {
  const sel = getSelection(), text = sel.toString().replace(/🔊…?|⚠ retry/g, '').trim();
  const node = sel.rangeCount ? sel.getRangeAt(0).commonAncestorContainer : null;
  const el = node && (node.nodeType === 1 ? node : node.parentElement);
  if (!text || !el?.closest('.msg.ai')) { if (!sayBtn.disabled) sayBtn.style.display = 'none'; return; }
  sayText = text;
  const r = sel.getRangeAt(0).getBoundingClientRect();
  Object.assign(sayBtn.style, { display: '', left: Math.max(8, Math.min(innerWidth - 130, r.left)) + 'px', top: Math.min(innerHeight - 56, r.bottom + 12) + 'px' });
});
addEventListener('scroll', () => { if (!sayBtn.disabled) sayBtn.style.display = 'none'; }, true);
sayBtn.onpointerdown = e => e.preventDefault(); // keep the highlight when tapping the button
sayBtn.onclick = async () => {
  if (sayBtn.disabled) return;
  sayBtn.disabled = true; sayBtn.textContent = '🔊…';
  await speak(sayText, true);
  sayBtn.disabled = false; sayBtn.textContent = '🔊 Say this'; sayBtn.style.display = 'none';
};

function tutorView(root) {
  if (!tutor.pass) return tutorSettings(root, () => tutorView(root));
  const inBox = root === panel;
  const q = sel => root.querySelector(sel); // look up inside this view only
  const chips = ['How do I say "I love you, Mom"?', "Let's practice greeting my partner's parents", 'Quiz me on numbers', 'Teach me how to order food'];
  root.innerHTML = `<div class="tut ${inBox ? 'box' : 'narrow'}">
    <div class="tut-head"><div class="row" style="margin-top:0;justify-content:space-between">
      <b style="font-size:${inBox ? 17 : 24}px">AI Tutor</b>
      <span>${inBox ? '<a class="btn sm" href="#tutor" title="Open full page">⤢</a> <button class="btn sm" id="tclose" aria-label="Close">✕</button>' : ''}</span></div>
      <div class="row" style="margin-top:6px">
        <label class="hint"><input type="checkbox" id="auto" ${autoSpeak ? 'checked' : ''} style="width:auto"> Speak</label>
        <select id="speed" aria-label="Voice speed">${[[0.6, 'Slowest'], [0.8, 'Slow'], [1, 'Normal']].map(([v, l]) => `<option value="${v}" ${v === ttsSpeed ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <button class="btn sm" id="clear">New chat</button><button class="btn sm" id="gear" aria-label="Settings">⚙</button></div></div>
    <div class="tut-body">
      <p class="hint">Ask anything in English or Khmer${inBox ? '. Your lesson stays where it is.' : ', any time. Replies are read out loud.'}</p>
      <div class="chat" id="log"></div>
      <div class="tabs" id="chips">${chips.map(c => `<button class="btn sm">${esc(c)}</button>`).join('')}</div></div>
    <div class="composer"><textarea id="say" placeholder="Type or tap 🎤…"></textarea>
      <button class="btn" id="mic" aria-label="Talk">🎤</button><select id="micl" aria-label="Mic language"><option value="en-US">EN</option><option value="km-KH">ខ្មែរ</option></select>
      <button class="btn primary" id="send">Send</button></div></div>`;
  const log = q('#log'), input = q('#say');
  const render = () => {
    log.innerHTML = chatLog.map(bubble).join('');
    log.querySelectorAll('[data-say]').forEach(b => b.onclick = async () => {
      if (b.disabled || (nowPlaying && !nowPlaying.paused && !nowPlaying.ended)) return; // already speaking: ignore extra taps
      b.disabled = true; b.textContent = '🔊…';
      const ok = await speak(chatLog[+b.dataset.say].content, true);
      b.textContent = ok ? '🔊' : '⚠ retry'; b.disabled = false;
    });
    q('#chips').style.display = chatLog.length ? 'none' : '';
    log.lastElementChild?.scrollIntoView({ block: 'end' });
  };
  let busy = false;
  const send = async text => {
    text = text.trim();
    if (!text || busy) return; // one question at a time
    busy = true;
    chatLog.push({ role: 'user', content: text });
    input.value = ''; render();
    log.insertAdjacentHTML('beforeend', '<div class="msg ai hint typing">Thinking…</div>');
    log.lastElementChild.scrollIntoView({ block: 'end' });
    try {
      const reply = (await ask('chat', chatLog.slice(-20))).trim() || "(The tutor sent an empty reply. Please ask again.)";
      chatLog.push({ role: 'assistant', content: reply });
      save('chat', chatLog.slice(-40));
      if (root.isConnected) render();
      if (autoSpeak) speak(reply, true);
    } catch (e) {
      log.querySelector('.typing')?.remove();
      log.insertAdjacentHTML('beforeend', `<div class="msg ai" style="border-color:var(--bad)">Couldn't reach the tutor: ${esc(e.message)}. Check the address and password (⚙).</div>`);
      log.lastElementChild.scrollIntoView({ block: 'end' });
    }
    busy = false;
  };
  render();
  q('#send').onclick = () => send(input.value);
  input.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); } };
  q('#chips').querySelectorAll('button').forEach(b => b.onclick = () => send(b.textContent));
  q('#auto').onchange = e => { autoSpeak = e.target.checked; save('autospeak', autoSpeak); };
  q('#speed').onchange = e => { ttsSpeed = +e.target.value; save('ttsspeed', ttsSpeed); };
  q('#clear').onclick = () => { chatLog = []; save('chat', chatLog); render(); };
  q('#gear').onclick = () => tutorSettings(root, () => tutorView(root));
  if (inBox) q('#tclose').onclick = closeTutor;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { q('#mic').style.display = q('#micl').style.display = 'none'; return; }
  q('#mic').onclick = () => {
    const r = new SR();
    r.lang = q('#micl').value;
    r.onresult = e => send(e.results[0][0].transcript);
    r.onend = () => q('#mic').textContent = '🎤';
    q('#mic').textContent = '⏺';
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
  if (!tutor.pass) {
    view.innerHTML = `<div class="card"><p>The translator uses your AI tutor server. <a href="#tutor">Sign in on the AI Tutor page</a> first.</p></div>`;
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
      $('tout').querySelector('[data-say]')?.addEventListener('click', () => speak(reply, true));
      speak(reply, true);
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

// ---- Learn with Grandma: phrases to ask her, plus a printable sheet ----
function grandma() {
  view.innerHTML = `<div class="narrow"><h2>Learn with Grandma</h2>
    <p class="hint">Topics to bring to Grandma so she can teach you. Practice a phrase here, then ask her in person.
      She's the real teacher: when she says a word differently from the app, trust her and add it to your notes.</p>
    <a class="btn primary" href="grandma-phrases.docx" download>🖨 Download printable Word sheet</a>
    <p class="hint">The sheet has a blank "Grandma says" column for her corrections.</p>` +
    topicCards(DATA.grandma) + '</div>';
  wirePlay(); wireCards();
}
const topicCards = list => list.map(t => `<h3 class="level">${t.title}</h3><p class="hint" style="margin-top:-4px">${t.intro}</p>
  <div class="card">${t.items.map(get).map(it => itemRow(it) + (it.note ? `<p class="note" style="margin:-6px 0 8px 52px">${it.note}</p>` : '')).join('')}</div>`).join('');

// ---- Casual talk: what people actually say, not the textbook version ----
function casual() {
  view.innerHTML = `<div class="narrow"><h2>Casual Talk</h2>
    <p class="hint">Textbook Khmer can sound stiff. These are the everyday words friends and family really use.</p>` +
    topicCards(DATA.casual) + '</div>';
  wirePlay(); wireCards();
}

// ---- Culture ----
function culture() {
  view.innerHTML = `<div class="narrow"><p class="hint">Small things that matter when you speak with family.</p>` +
    DATA.culture.map(c => `<div class="card"><b>${c.title}</b><p style="margin:6px 0 0">${c.text}</p></div>`).join('') + '</div>';
}

// ---- Router: #page or #page/arg ----
const VIEWS = { account, home, course, phrases, lessons: phrases, alphabet, verbs, practice, grandma, casual, tutor: tutorPage, tools, culture };
function route() {
  const [name, a, b] = location.hash.slice(1).split('/');
  onTutorPage = name === 'tutor';
  if (!onTutorPage) fab.hidden = !panel.hidden;
  const v = VIEWS[name] ? name : 'home';
  document.querySelectorAll('nav a').forEach(x => x.classList.toggle('on', x.getAttribute('href') === '#' + (v === 'lessons' ? 'phrases' : v)));
  view = main;
  if (v === 'tools') tools(a || 'translate', b);
  else if (v === 'practice') practice(a);
  else VIEWS[v](a);
  scrollTo(0, 0);
}
addEventListener('hashchange', route);
$('acct').textContent = acct ? '👤 ' + acct.name : '👤 Sign in';
const vsel = $('voice');
vsel.value = voice;
vsel.onchange = () => { voice = vsel.value; save('voice', voice); };
route();
