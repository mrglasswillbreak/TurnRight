"""Decode the shipped pack without loading the speech-generation model."""
import hashlib
import json
from pathlib import Path
import numpy as np
import soundfile as sf

root = Path(__file__).resolve().parents[1]
folder = root / 'web/public/voice/en-GB-v1'
pack = json.loads((folder / 'manifest.json').read_text(encoding='utf-8'))
durations, levels = [], []
for key, clip in pack['clips'].items():
    file = root / 'web/public' / clip['url'].lstrip('/')
    content = file.read_bytes()
    assert len(content) == clip['bytes'], key
    assert hashlib.sha256(content).hexdigest() == clip['sha256'], key
    samples, rate = sf.read(file, dtype='float32')
    duration = len(samples) / rate
    assert rate == 24000 and samples.ndim == 1, key
    assert np.isfinite(samples).all() and np.max(np.abs(samples)) <= 1, key
    assert abs(duration - clip['duration']) <= 0.05 and 0.4 <= duration <= 25, key
    rms = float(20 * np.log10(np.sqrt(np.mean(samples ** 2))))
    assert -30 <= rms <= -18, (key, rms)
    durations.append(duration)
    levels.append(rms)
total = sum(p.stat().st_size for p in folder.iterdir() if p.is_file())
assert total <= 8 * 1024 * 1024
print(f'{len(durations)} MP3s decoded; 24 kHz mono; {total:,} bytes; duration {min(durations):.2f}–{max(durations):.2f}s; RMS {min(levels):.1f}–{max(levels):.1f} dBFS')
