"""Generate MP3s for every phrase, letter and verb. Usage: pip install edge-tts; python gen_audio.py [--force | --check]"""
import asyncio, json, pathlib, sys

VOICES = {"f": "km-KH-SreymomNeural", "m": "km-KH-PisethNeural"}
root = pathlib.Path(__file__).parent
src = (root / "data.js").read_text(encoding="utf-8")
data = json.loads(src[src.index("{"):src.rindex("}") + 1])
units = data["units"]
course = [x for u in units for x in u["vocab"] + u["examples"]] + [x for t in data["grandma"] + data["casual"] for x in t["items"]]
items = ([i for lesson in data["lessons"] for i in lesson["items"]] + data["consonants"] + data["vowels"]
         + [x for x in course if isinstance(x, dict)] + data["subjects"] + data["markers"] + data["verbs"])

# Self-check: catch broken data before it reaches the app.
ids = [i["id"] for i in items]
assert len(ids) == len(set(ids)), f"duplicate ids: {sorted({i for i in ids if ids.count(i) > 1})}"
for i in items:
    assert all(i.get(k) for k in ("id", "km", "rom")), f"missing field: {i}"
known = set(ids)
for u in units:
    refs = [x for x in u["vocab"] + u["examples"] if isinstance(x, str)] + u["script"]
    assert all(r in known for r in refs), f"unknown id in unit {u['title']}: {[r for r in refs if r not in known]}"
    for q in u["quiz"]:
        assert 0 <= q["a"] < len(q["opts"]), q
for t in data["grandma"] + data["casual"]:
    refs = [x for x in t["items"] if isinstance(x, str)]
    assert all(r in known for r in refs), f"unknown id in topic {t['title']}: {refs}"
if "--check" in sys.argv:
    sys.exit(print(f"OK: {len(units)} units, {len(data['lessons'])} phrase lessons, {len(items)} audio items"))


async def main():
    import edge_tts
    out = root / "audio"
    out.mkdir(exist_ok=True)
    for i in items:
        for tag, voice in VOICES.items():
            f = out / f"{i['id']}-{tag}.mp3"
            if f.exists() and "--force" not in sys.argv:
                continue  # use --force after editing an item's Khmer text
            await edge_tts.Communicate(i["km"], voice, rate="-15%").save(str(f))
            print("made", f.name)

asyncio.run(main())
