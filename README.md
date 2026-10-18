# Learn Khmer

A free web app for learning spoken Khmer (Cambodian) for everyday family conversation.

- **Course**: 10 school-style units (lesson, vocabulary, examples, new letters, practice, unit test)
- **AI tutor**: chat with a Khmer teacher that speaks out loud in the Sreymom voice (needs the tutor server below)
- **Phrasebook**: 15 daily phrase lessons, Beginner to Advanced, with record-and-compare
- **Verbs**: any verb, any person, every tense, with audio
- **Alphabet**: 33 consonants and common vowels with audio
- **Practice**: spaced-repetition review, listening quiz, matching games
- **Tools**: translator, on-screen Khmer keyboard, printable handwriting sheets
- **Learn with Grandma**: phrases for asking Grandma to teach you, plus a printable Word sheet (`grandma-phrases.docx`, rebuilt with `npm i docx && node make_doc.js`)
- **Casual Talk**: everyday slang and reactions people really use
- **Culture notes**

Live at https://officialtouch.github.io/learnkhmer/

## Files

- `index.html`: page layout and styles. After changing `app.js` or `data.js`, bump the `?v=` number on their script tags so browsers load the new copy.
- `app.js`: all the app logic
- `data.js`: all content (lessons, units, alphabet, verbs, culture). Edit here.
- `gen_audio.py`: makes the MP3s in `audio/`. The **Generate audio** GitHub Action runs it automatically when `data.js` changes.
- `worker/worker.js`: the AI tutor server (Cloudflare Worker)

## Set up the AI tutor

The Claude API costs a few cents per conversation; the rest is free. The worker speaks with the free Sreymom voice (Microsoft Edge's read-aloud service), so no voice key is needed. An Azure key is an optional paid upgrade.

1. **Claude API key**: at console.anthropic.com, add a small credit under Billing, then create a key under API Keys.
2. *(Optional)* **Microsoft Speech key** (Sreymom voice in any browser): in portal.azure.com create a **Speech** resource with the **Free F0** tier. Copy **Key 1** and the **Location/Region** (e.g. `eastus`) from "Keys and Endpoint".
3. **Cloudflare Worker**: at dash.cloudflare.com go to Workers & Pages → Create → Worker. Name it `khmer-tutor`, deploy, click **Edit code**, paste in `worker/worker.js`, and deploy again. Then under **Settings → Variables and Secrets** add the **Secrets** `ANTHROPIC_API_KEY` and `PASSWORD` (plus `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` if you did step 2).
4. On the site, open **AI Tutor** and paste your worker address (`https://khmer-tutor.<you>.workers.dev`) and password.

## Run locally

```
pip install edge-tts
python gen_audio.py      # makes audio/*.mp3
# then double-click index.html
```

Check content edits with `python gen_audio.py --check`. After changing the Khmer text of an existing item, delete its MP3s (or run `python gen_audio.py --force`).

Romanization of Khmer isn't standardized, so trust the audio over the spelling.
