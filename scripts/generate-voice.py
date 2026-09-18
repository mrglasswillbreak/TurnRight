"""Explicit, resumable Kokoro generation; never run by the application build."""
import argparse
import hashlib
import json
from pathlib import Path
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--cache', type=Path, default=Path(tempfile.gettempdir()) / 'turnright-voice-model')
parser.add_argument('--limit', type=int, default=0, help='Generate only the first N clips for a local smoke check')
args = parser.parse_args()
catalogue = json.loads((ROOT / 'data/voice/catalogue.json').read_text(encoding='utf-8'))
files = {**catalogue['files'], 'config.json': '5abb01e2403b072bf03d04fde160443e209d7a0dad49a423be15196b9b43c17f'}
def file_hash(path):
    with path.open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()

for name, checksum in files.items():
    target = args.cache / name
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists() or file_hash(target) != checksum:
        print(f'Downloading pinned {name}', flush=True)
        temporary = target.with_suffix('.download')
        urllib.request.urlretrieve(f"https://huggingface.co/{catalogue['model']}/resolve/{catalogue['revision']}/{name}", temporary)
        if file_hash(temporary) != checksum:
            raise ValueError(f'Model checksum mismatch: {name}')
        temporary.replace(target)

import numpy as np
import torch
import lameenc
import soundfile as sf
from kokoro import KModel, KPipeline

torch.set_num_threads(2)
torch.manual_seed(0)
model = KModel(repo_id=catalogue['model'], config=str(args.cache / 'config.json'), model=str(args.cache / 'kokoro-v1_0.pth')).eval()
pipeline = KPipeline(lang_code='b', repo_id=catalogue['model'], model=model, device='cpu')
if pipeline.g2p.fallback is None:
    raise RuntimeError('Pronunciation fallback is required; refusing to silently omit unknown names')
voice = torch.load(args.cache / 'voices/bf_emma.pt', weights_only=True)
output = ROOT / 'web/public/voice/en-GB-v1'
output.mkdir(parents=True, exist_ok=True)
cache = args.cache / 'clips'
cache.mkdir(exist_ok=True)
clips = {}
items = list(catalogue['phrases'].items())
for index, (key, phrase) in enumerate(items):
    if args.limit and index >= args.limit:
        break
    # The generation recipe participates in the cache key, so changing a setting
    # never silently reuses an older pronunciation or encoder output.
    recipe = json.dumps([phrase['spoken'], files, 'kokoro-0.9.4', 'bf_emma', 0.95, 'rms--20-peak--1', 'mp3-48k-mono-24k'], sort_keys=True)
    fingerprint = hashlib.sha256(recipe.encode()).hexdigest()
    audio_path = cache / f'{fingerprint}.mp3'
    if not audio_path.exists():
        torch.manual_seed(0)
        chunks = [result.audio.numpy() for result in pipeline(phrase['spoken'], voice=voice, speed=0.95)]
        if not chunks:
            raise ValueError(f'No speech produced: {key}')
        samples = np.concatenate(chunks).astype(np.float32)
        active = np.flatnonzero(np.abs(samples) > 0.003)
        if not len(active):
            raise ValueError(f'Silent recording: {key}')
        samples = samples[max(0, active[0] - 1920):min(len(samples), active[-1] + 2880)]
        rms = np.sqrt(np.mean(samples ** 2))
        gain = min(0.1 / max(rms, 1e-6), 0.89 / np.max(np.abs(samples)))
        pcm = (samples * gain * 32767).astype('<i2').tobytes()
        encoder = lameenc.Encoder()
        encoder.set_bit_rate(48)
        encoder.set_in_sample_rate(24000)
        encoder.set_channels(1)
        encoder.set_quality(2)
        encoder.silence()
        audio_path.write_bytes(bytes(encoder.encode(pcm)) + bytes(encoder.flush()))
    audio = audio_path.read_bytes()
    decoded, sample_rate = sf.read(audio_path, dtype='float32')
    duration = len(decoded) / sample_rate
    if decoded.ndim != 1 or not np.isfinite(decoded).all() or not 0.4 <= duration <= 25 or np.max(np.abs(decoded)) > 1:
        raise ValueError(f'Invalid recording: {key}')
    checksum = hashlib.sha256(audio).hexdigest()
    filename = f'{checksum[:24]}.mp3'
    (output / filename).write_bytes(audio)
    clips[key] = {'url': f'/voice/en-GB-v1/{filename}', 'sha256': checksum, 'bytes': len(audio), 'duration': round(duration, 3), 'transcript': phrase['transcript']}
    print(f'{index + 1}/{len(items)} {key} ({duration:.1f}s)', flush=True)

if not args.limit:
    # Do not publish a partial pack or leave orphaned recordings in the precache.
    wanted = {Path(c['url']).name for c in clips.values()}
    for old in output.glob('*.mp3'):
        if old.name not in wanted:
            old.unlink()
    pack = {key: catalogue[key] for key in ['schemaVersion', 'sourceVersion', 'sourceUrl', 'sourceSha256', 'voice', 'language', 'model', 'revision', 'destinations', 'roads']}
    pack.update({'modelChecksums': files, 'clips': clips})
    pack['version'] = hashlib.sha256(json.dumps(clips, sort_keys=True).encode()).hexdigest()[:16]
    encoded = (json.dumps(pack, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
    size = sum(p.stat().st_size for p in output.glob('*.mp3')) + len(encoded)
    if size > 8 * 1024 * 1024:
        raise ValueError(f'Voice pack exceeds 8 MiB: {size}')
    (output / 'manifest.json').write_bytes(encoded)
    print(f'Complete: {len(clips)} clips, {size:,} bytes', flush=True)
