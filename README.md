# Learn Khmer

A free, static web app for learning spoken Khmer (Cambodian) for everyday family conversation.

- Homepage, 15 daily lessons in Beginner / Intermediate / Advanced levels
- Khmer alphabet: 33 consonants and common vowels with audio
- Matching games and culture notes
- Romanization + English + Khmer script
- Native-style audio (female and male voices)
- Spaced-repetition review, listen-and-repeat recording, listening quiz
- Progress saved in your browser

## Put it online (GitHub Pages)

1. Create a new public repo on GitHub and upload all these files (keep the `.github` folder).
2. The **Generate audio** action runs automatically and commits the MP3s to `audio/`. Check the **Actions** tab; if it didn't run, open it and click **Run workflow**.
3. **Settings → Pages →** Source: *Deploy from a branch*, branch `main`, folder `/ (root)`.
4. Your app is live at `https://<your-username>.github.io/<repo-name>/`.

## Run locally

```
pip install edge-tts
python gen_audio.py      # makes audio/*.mp3
# then double-click index.html
```

## Add phrases

Edit the data block near the bottom of `index.html` (lessons, alphabet, culture notes), then push. The action makes audio for new phrases.
After changing the Khmer text of an existing phrase, delete its MP3s (or run `python gen_audio.py --force`).
Check your edits with `python gen_audio.py --check`.

Romanization of Khmer isn't standardized, so trust the audio over the spelling.
