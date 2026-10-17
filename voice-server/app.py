"""Free Sreymom voice server for the Learn Khmer tutor. Runs on a Hugging Face Space (Docker).
Set a Space secret named PASSWORD (same as your Cloudflare worker's PASSWORD)."""
import os
import re

import edge_tts
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

app = FastAPI()
VOICES = {"km-KH-SreymomNeural", "km-KH-PisethNeural"}


class Req(BaseModel):
    text: str
    password: str
    voice: str = "km-KH-SreymomNeural"
    rate: str = "-20%"


@app.get("/")
def health():
    return {"ok": True}


@app.post("/tts")
async def tts(r: Req):
    if not os.environ.get("PASSWORD") or r.password != os.environ["PASSWORD"]:
        raise HTTPException(401, "Wrong password")
    if r.voice not in VOICES or not re.fullmatch(r"[+-]\d{1,2}%", r.rate) or not r.text.strip():
        raise HTTPException(400, "Bad request")
    stream = edge_tts.Communicate(r.text[:1000], r.voice, rate=r.rate).stream()
    audio = b"".join([c["data"] async for c in stream if c["type"] == "audio"])
    return Response(audio, media_type="audio/mpeg")
