"""Generate MP3s for every phrase. Usage: pip install edge-tts; python gen_audio.py [--force | --check]"""
import asyncio, json, pathlib, re, sys

VOICES = {"f": "km-KH-SreymomNeural", "m": "km-KH-PisethNeural"}
root = pathlib.Path(__file__).parent
html = (root / "index.html").read_text(encoding="utf-8")
lessons = json.loads(re.search(r'<script id="phrases" type="application/json">(.*?)</script>', html, re.S).group(1))
items = [i for lesson in lessons for i in lesson["items"]]

# Self-check: catch broken data before it reaches the app.
ids = [i["id"] for i in items]
assert len(ids) == len(set(ids)), "duplicate phrase ids in index.html"
for i in items:
    assert all(i.get(k) for k in ("id", "km", "rom", "en")), f"missing field: {i}"
if "--check" in sys.argv:
    sys.exit(print(f"OK: {len(lessons)} lessons, {len(items)} phrases"))


async def main():
    import edge_tts
    out = root / "audio"
    out.mkdir(exist_ok=True)
    for i in items:
        for tag, voice in VOICES.items():
            f = out / f"{i['id']}-{tag}.mp3"
            if f.exists() and "--force" not in sys.argv:
                continue  # use --force after editing a phrase's Khmer text
            await edge_tts.Communicate(i["km"], voice, rate="-15%").save(str(f))
            print("made", f.name)

asyncio.run(main())
