// Khmer tutor server for the Learn Khmer site. It keeps your API keys secret.
// Deploy as a Cloudflare Worker, then add these as Secrets under Settings → Variables and Secrets:
//   ANTHROPIC_API_KEY, AZURE_SPEECH_KEY, AZURE_SPEECH_REGION (e.g. eastus), PASSWORD
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

const xmlEscape = s => s.replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

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
      return new Response(r.body, { headers: { ...cors, 'content-type': 'audio/mpeg' } });
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
