// Khmer tutor server for the Learn Khmer site. It keeps your API keys secret.
// Deploy as a Cloudflare Worker, then add these as Secrets under Settings → Variables and Secrets:
//   ANTHROPIC_API_KEY, PASSWORD
// The tutor's voice is the free Sreymom voice from Microsoft Edge's read-aloud service (no key needed).
// Optional: AZURE_SPEECH_KEY + AZURE_SPEECH_REGION (e.g. eastus) to use the official paid Azure voice instead.
const ALLOWED_ORIGIN = 'https://officialtouch.github.io';
const MODEL = 'claude-sonnet-5-5';

const PROMPTS = {
  chat: `You are a warm, patient Khmer (Cambodian) teacher. Your student is an English-speaking adult learning spoken Khmer to talk with family.
Rules:
- Keep replies short (under about 120 words) unless the student asks for more.
- Whenever you give Khmer, write: Khmer script, then romanization in parentheses, then the English meaning. Example: សួស្តី (suosdei) – Hello.
- Use Khmer script only for Khmer words. The Khmer script in your reply is read aloud by a Khmer voice.
- Teach natural spoken Khmer as families use it, and point out polite forms for elders when it matters.
- If the student writes Khmer or romanized Khmer, answer briefly in simple Khmer (with romanization and English) and gently correct mistakes.
- When role-playing a conversation, play the other person one line at a time and wait for the student's reply.
- If you're not sure about a word or usage, say so.
- Plain text only: no markdown headings, tables or bold.`,
  translate: `Translate the user's text between English and Khmer, using natural spoken Khmer.
Reply with exactly three lines: (1) Khmer script, (2) romanization, (3) English meaning.
Optionally add one more line starting with "Note:" about politeness (for example, speaking to elders) or a common alternative. Nothing else.`,
};

// Split text into pieces of at most n characters, preferring spaces.
const chunk = (s, n = 180) => {
  const out = [];
  let cur = '';
  for (const w of s.split(/(\s+)/)) {
    if ((cur + w).length > n && cur.trim()) { out.push(cur.trim()); cur = ''; }
    cur += w;
    while (cur.length > n) { out.push(cur.slice(0, n)); cur = cur.slice(n); }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
};

const xmlEscape =s => s.replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

// ---- Free Sreymom voice (Microsoft Edge "Read aloud" service), ported from the edge-tts Python package v7.3.1 ----
// shortcut: unofficial service; if Microsoft changes its security code, port the new drm.py from edge-tts again.
const EDGE_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const EDGE_VERSION = '2-143.0.3650.75';
const EDGE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0';
const INITIAL = [0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A, 0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19];
const STATE = [0xFD9FBEA2, 0x91243CE7, 0xBE499094, 0xCD2E1E0A, 0x6C006F49, 0x04BD35AB, 0xFEB0A7E4, 0x03EFFBD2];
const SCHEDULE = [0xEB24BF9E, 0x1558691F, 0xA0C09EE2, 0x0CFA32BA, 0xA622EE8C, 0xD1DD9491, 0xC0DD25A0, 0xF9E70AB6, 0xF0C31573, 0x7058CE4E, 0x7188E606, 0x00E5AB33, 0xD258B060, 0x72766564];
const K = [0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5, 0x3956C25B, 0x59F111F1, 0x923F82A4, 0xAB1C5ED5, 0xD807AA98, 0x12835B01, 0x243185BE, 0x550C7DC3, 0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174, 0xE49B69C1, 0xEFBE4786, 0x0FC19DC6, 0x240CA1CC, 0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA, 0x983E5152, 0xA831C66D, 0xB00327C8, 0xBF597FC7, 0xC6E00BF3, 0xD5A79147, 0x06CA6351, 0x14292967, 0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13, 0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85, 0xA2BFE8A1, 0xA81A664B, 0xC24B8B70, 0xC76C51A3, 0xD192E819, 0xD6990624, 0xF40E3585, 0x106AA070, 0x19A4C116, 0x1E376C08, 0x2748774C, 0x34B0BCB5, 0x391C0CB3, 0x4ED8AA4A, 0x5B9CCA4F, 0x682E6FF3, 0x748F82EE, 0x78A5636F, 0x84C87814, 0x8CC70208, 0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7, 0xC67178F2];
const ADJ = 0xC9DC06A7, S0ADJ = 0x059C0B80, S1ADJ = 0x000B92C0;
const CS64 = [[0xE82E91B1, 0xB32700D0], [0x44DE24C6, 0x88DFF51D], [0x3BEB65BC, 0x29514038], [0xC89C5933, 0xB328CBDF], [0x8D1EC211, 0xD405B4D5], [0x314EF5D5, 0x26E55F3C], [0xE92491B1, 0x607801C6], [0xF0A5B9D5, 0x82B2C1FB], [0x06064CF3, 0xFA51A3DA], [0xDA79FA60, 0x207CC464], [0xBED20560, 0x3C3C74F3], [0x89F9C9F8, 0xD2D14B61], [0x35FA38C6, 0xBB04A2C1], [0xCB49E3C6, 0xC5626167]];
const CS_F = 0x82893933, CS_A0 = 0xF2F90B1A, CS_A1 = 0x0B1A0000;

const u32 = x => x >>> 0;
const rotr = (x, n) => u32((x >>> n) | (x << (32 - n)));
const rol16 = x => rotr(x, 16);
const mul = (a, b) => u32(Math.imul(a, b));
const sig0 = x => u32(rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3));
const sig1 = x => u32(rotr(x, 17) ^ rotr(x, 19) ^ (x >>> 10));

function shaRounds(state, w, first = 0) {
  const k = first === 14 ? [...K.slice(0, 14), ADJ, ...K.slice(15)] : K;
  let [a, b, c, d, e, f, g, h] = state;
  for (let i = first; i < 64; i++) {
    const t1 = u32(h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + u32(g ^ (e & (f ^ g))) + k[i] + w[i]);
    const t2 = u32((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + u32((a & b) | (c & (a | b))));
    [a, b, c, d, e, f, g, h] = [u32(t1 + t2), a, b, c, u32(d + t1), e, f, g];
  }
  return [a, b, c, d, e, f, g, h];
}
function expand(w, first = 16) {
  for (let i = first; i < 64; i++) w.push(u32(sig1(w[i - 2]) + w[i - 7] + sig0(w[i - 15]) + w[i - 16]));
}
function shaInit(d) { // first 7 bytes of the token data
  const w = new Array(14).fill(0);
  w.push((d[0] << 16) | (d[1] << 8) | d[2]);
  w.push(u32((d[3] << 24) | (d[4] << 16) | (d[5] << 8) | d[6]));
  for (let i = 16; i < 30; i++) {
    let v = SCHEDULE[i - 16];
    if (i - 2 >= 14) v += i === 16 ? u32(sig1(w[i - 2]) ^ S1ADJ) : sig1(w[i - 2]);
    if (i - 7 >= 14) v += w[i - 7];
    if (i - 15 >= 14) v += i === 29 ? u32(sig0(w[i - 15]) ^ S0ADJ) : sig0(w[i - 15]);
    w.push(u32(v));
  }
  w.push(u32(sig1(w[28]) + w[23] + sig0(w[15]) + w[14] + ADJ - K[14]));
  expand(w, 31);
  const work = shaRounds(STATE, w, 14);
  return INITIAL.map((x, i) => u32(x + work[i]));
}
function shaDigest(data) {
  const length = 57 + data.length;
  const pad = ((55 - length) % 64 + 64) % 64;
  const p = new Uint8Array(data.length - 7 + 1 + pad + 8);
  p.set(data.subarray(7)); p[data.length - 7] = 0x80;
  const dv = new DataView(p.buffer);
  dv.setUint32(p.length - 8, Math.floor(length * 8 / 2 ** 32)); dv.setUint32(p.length - 4, u32(length * 8));
  let state = shaInit(data);
  for (let o = 0; o < p.length; o += 64) {
    const w = []; for (let i = 0; i < 16; i++) w.push(dv.getUint32(o + i * 4));
    expand(w);
    const work = shaRounds(state, w);
    state = state.map((x, i) => u32(x + work[i]));
  }
  const out = new Uint8Array(32), ov = new DataView(out.buffer);
  state.forEach((x, i) => ov.setUint32(i * 4, x));
  return out;
}
function cs64(data, digest) {
  const dv = new DataView(digest.buffer);
  const ka = u32(dv.getUint32(0, true) | 1), kb = u32(dv.getUint32(4, true) | 1);
  const fac = [mul(ka, CS_F), mul(kb, CS_F)];
  const terms = CS64.map(([c], i) => mul(c, fac[i % 2])), offs = CS64.map(([, o]) => o);
  const raw = new Uint8Array(1 + data.length); raw.set(data, 1);
  const padded = new Uint8Array(Math.ceil(raw.length / 4) * 4); padded.set(raw);
  const pv = new DataView(padded.buffer), words = [];
  for (let i = 0; i < padded.length; i += 4) words.push(pv.getUint32(i, true));
  if (words.length % 2) words.push(0);
  words.forEach((word, i) => {
    let term = mul(word, i % 2 ? kb : ka), off = mul(rol16(word), i % 2 ? 0xC31713DB : 0xEF0569FB);
    if (i === 0) { term = u32(term + mul(CS_A0, fac[0])); off = u32(off + CS_A1); }
    terms.push(term); offs.push(off);
  });
  let swapAcc = 0, swapLast = 0, st = 0, acc = 0;
  for (let i = 0; i < terms.length; i += 2) {
    const x = terms[i], y = terms[i + 1];
    let t = rol16(u32(offs[i] + x)), q = mul(t, 0x76F50F34);
    swapAcc = u32(swapAcc + u32(mul(rol16(q), 0xC3EFEA97) + q));
    t = rol16(u32(offs[i + 1] + y)); q = mul(t, 0x1881CE3C);
    swapLast = u32(mul(rol16(q), 0x35BD1EC9) + q);
    swapAcc = u32(swapAcc + swapLast);
    st = u32(mul(st, ka) + x);
    st = mul(rol16(st), 0xCF98B111); st = mul(rol16(st), 0x87085B9F);
    st = mul(rol16(st), 0x12CEB96D); st = mul(rol16(st), 0x257E1D83);
    acc = u32(acc + st);
    t = u32(mul(st, kb) + y);
    t = mul(rol16(t), 0xA27416F5); t = mul(rol16(t), 0xD38396FF);
    st = mul(rol16(mul(rol16(t), 0x7C932B89)), 0xBFA49F69);
    acc = u32(acc + st);
  }
  return [u32(swapLast ^ st), u32(swapAcc ^ acc)];
}
const hex = b => [...b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
function secMsGec(unixSeconds) {
  const secs = Math.floor((unixSeconds + 11644473600) / 300) * 300;
  const data = new TextEncoder().encode(`${BigInt(secs) * 10000000n}${EDGE_TOKEN}`);
  const digest = shaDigest(data);
  const c = new Uint8Array(8), cv = new DataView(c.buffer), [lo, hi] = cs64(data, digest);
  cv.setUint32(0, lo, true); cv.setUint32(4, hi, true);
  return `${hex(c)}-${hex(digest)}`;
}

const uuidHex = () => crypto.randomUUID().replaceAll('-', '');
function jsDate(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], mons = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getUTCDay()]} ${mons[d.getUTCMonth()]} ${p(d.getUTCDate())} ${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} GMT+0000 (Coordinated Universal Time)`;
}

// Returns MP3 bytes for the text. Uses a WebSocket from the worker (Cloudflare fetch upgrade).
async function edgeTTS(text, voice = 'km-KH-SreymomNeural', rate = '-20%') {
  const url = `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${EDGE_TOKEN}`
    + `&ConnectionId=${uuidHex()}&Sec-MS-GEC=${secMsGec(Date.now() / 1000)}&Sec-MS-GEC-Version=${EDGE_VERSION}`;
  const resp = await fetch(url, { headers: {
    Upgrade: 'websocket', Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold', 'User-Agent': EDGE_UA,
    Pragma: 'no-cache', 'Cache-Control': 'no-cache', 'Accept-Language': 'en-US,en;q=0.9', Cookie: `muid=${uuidHex().toUpperCase()};`,
  } });
  const ws = resp.webSocket;
  if (!ws) throw new Error(`voice connect failed ${resp.status}`);
  ws.accept();
  const chunks = [];
  const finished = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('voice timeout')), 20000);
    ws.addEventListener('message', ev => {
      if (typeof ev.data === 'string') {
        if (ev.data.includes('Path:turn.end')) { clearTimeout(timer); resolve(); try { ws.close(); } catch {} }
        return;
      }
      const b = new Uint8Array(ev.data), hl = (b[0] << 8) | b[1];
      if (new TextDecoder().decode(b.subarray(2, 2 + hl)).includes('Path:audio')) chunks.push(b.slice(2 + hl));
    });
    ws.addEventListener('close', () => { clearTimeout(timer); resolve(); });
    ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('voice socket error')); });
  });
  const now = jsDate();
  ws.send(`X-Timestamp:${now}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n`
    + '{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"true","wordBoundaryEnabled":"false"},'
    + '"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n');
  ws.send(`X-RequestId:${uuidHex()}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${now}Z\r\nPath:ssml\r\n\r\n`
    + `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='${voice}'>`
    + `<prosody pitch='+0Hz' rate='${rate}' volume='+0%'>${xmlEscape(text)}</prosody></voice></speak>`);
  await finished;
  const total = chunks.reduce((n, c) => n + c.length, 0);
  if (!total) throw new Error('voice returned no audio');
  return new Blob(chunks);
}

export default {
  async fetch(req, env) {
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
    };
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, 'content-type': 'application/json' } });
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST') return json({ error: 'Tutor server is running. Use it from the Learn Khmer site.' }, 405);

    let body;
    try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
    if (!env.PASSWORD || body.password !== env.PASSWORD) return json({ error: 'Wrong password' }, 401);

    if (body.mode === 'tts') {
      const text = String(body.text || '').slice(0, 500);
      if (!text) return json({ error: 'No text' }, 400);
      const audio = b => new Response(b, { headers: { ...cors, 'content-type': 'audio/mpeg' } });
      if (!env.AZURE_SPEECH_KEY || !env.AZURE_SPEECH_REGION) {
        try { return audio(await edgeTTS(text, 'km-KH-SreymomNeural', '-10%')); } catch (e) { console.log('edge voice failed:', e.message); }
      }
      if (!env.AZURE_SPEECH_KEY || !env.AZURE_SPEECH_REGION) {
        // Backup: Google Translate's Khmer voice. It takes short pieces, so split and join the MP3s.
        // Only used if the Sreymom voice above fails. shortcut: unofficial endpoint, lower quality.
        const parts = [];
        for (const piece of chunk(text)) {
          const r = await fetch(`https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=km&q=${encodeURIComponent(piece)}`,
            { headers: { 'User-Agent': 'Mozilla/5.0' } });
          if (!r.ok) return json({ error: `Voice service error ${r.status}` }, 502);
          parts.push(await r.arrayBuffer());
        }
        return audio(new Blob(parts));
      }
      const ssml = `<speak version="1.0" xml:lang="km-KH"><voice name="km-KH-SreymomNeural"><prosody rate="-10%">${xmlEscape(text)}</prosody></voice></speak>`;
      const r = await fetch(`https://${env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': env.AZURE_SPEECH_KEY,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
          'User-Agent': 'khmer-tutor',
        },
        body: ssml,
      });
      if (!r.ok) return json({ error: `Speech service error ${r.status}` }, 502);
      return audio(r.body);
    }

    const system = PROMPTS[body.mode];
    if (!system) return json({ error: 'Unknown mode' }, 400);
    const messages = (Array.isArray(body.messages) ? body.messages : []).slice(-20)
      .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));
    while (messages.length && messages[0].role !== 'user') messages.shift(); // the API needs a user turn first
    if (!messages.length) return json({ error: 'No message' }, 400);

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 700, system, messages }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return json({ error: j.error?.message || `AI error ${r.status}` }, 502);
    return json({ text: (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('') });
  },
};
