"""Streaming DSP effects engine.

Every effect keeps its own state (delay lines, filter memories, LFO and
oscillator phases) so a continuous audio stream can be processed chunk by
chunk without boundary artifacts. The whole engine is pure numpy/scipy —
it needs no ML model, which is what powers the "DSP only" passthrough mode.

An :class:`EffectsChain` instance is owned by a single stream (one WebSocket
connection or one file-conversion job) and is not thread-safe across streams.
"""

import logging
import math

import numpy as np
from scipy import signal as sps

logger = logging.getLogger(__name__)


def _clipf(value, lo: float, hi: float, default: float) -> float:
    try:
        return float(np.clip(float(value), lo, hi))
    except (TypeError, ValueError):
        return default


def _clipi(value, lo: int, hi: int, default: int) -> int:
    try:
        return int(np.clip(int(value), lo, hi))
    except (TypeError, ValueError):
        return default


class _FeedbackComb:
    """Feedback comb filter: y[n] = x[n - D] + fb * y[n - D].

    Processed block-wise in slices no longer than the delay so the recursion
    only ever references samples already stored in the history buffers.
    """

    def __init__(self, delay_samples: int) -> None:
        self.delay = max(1, int(delay_samples))
        self._x_hist = np.zeros(self.delay, dtype=np.float32)
        self._y_hist = np.zeros(self.delay, dtype=np.float32)

    def process(self, x: np.ndarray, feedback: float) -> np.ndarray:
        out = np.empty(len(x), dtype=np.float32)
        pos = 0
        while pos < len(x):
            blk = min(self.delay, len(x) - pos)
            xb = x[pos : pos + blk]
            yb = self._x_hist[:blk] + feedback * self._y_hist[:blk]
            out[pos : pos + blk] = yb
            self._x_hist = np.concatenate([self._x_hist[blk:], xb]).astype(np.float32)
            self._y_hist = np.concatenate([self._y_hist[blk:], yb]).astype(np.float32)
            pos += blk
        return out


class _Allpass:
    """Schroeder allpass: y[n] = -g*x[n] + x[n - D] + g*y[n - D]."""

    def __init__(self, delay_samples: int, g: float = 0.7) -> None:
        self.delay = max(1, int(delay_samples))
        self.g = g
        self._x_hist = np.zeros(self.delay, dtype=np.float32)
        self._y_hist = np.zeros(self.delay, dtype=np.float32)

    def process(self, x: np.ndarray) -> np.ndarray:
        out = np.empty(len(x), dtype=np.float32)
        pos = 0
        while pos < len(x):
            blk = min(self.delay, len(x) - pos)
            xb = x[pos : pos + blk]
            yb = -self.g * xb + self._x_hist[:blk] + self.g * self._y_hist[:blk]
            out[pos : pos + blk] = yb
            self._x_hist = np.concatenate([self._x_hist[blk:], xb]).astype(np.float32)
            self._y_hist = np.concatenate([self._y_hist[blk:], yb]).astype(np.float32)
            pos += blk
        return out


class PitchShifter:
    """Dual-tap delay-line pitch shifter (Doppler/harmonizer style).

    Two read taps sweep through a short ring buffer at a rate of
    ``1 - 2^(semitones/12)`` with equal-power sine crossfading, which keeps
    output continuous across chunks. Used for the model-free DSP mode.
    """

    WINDOW_SECONDS = 0.032

    def __init__(self, sample_rate: int) -> None:
        self.sr = sample_rate
        self.win = max(64, int(self.WINDOW_SECONDS * sample_rate))
        self._hist = np.zeros(self.win + 2, dtype=np.float32)
        self._phase = 0.0  # tap delay in samples, [0, win)

    def process(self, x: np.ndarray, semitones: float) -> np.ndarray:
        if abs(semitones) < 1e-3 or len(x) == 0:
            self._push_history(x)
            return x

        ratio = 2.0 ** (semitones / 12.0)
        n = len(x)
        rate = 1.0 - ratio
        idx = np.arange(n, dtype=np.float64)

        d1 = (self._phase + rate * idx) % self.win
        self._phase = float((self._phase + rate * n) % self.win)
        d2 = (d1 + self.win / 2.0) % self.win
        g1 = np.sin(np.pi * d1 / self.win)
        g2 = np.sin(np.pi * d2 / self.win)

        full = np.concatenate([self._hist, x.astype(np.float32)])
        positions = np.arange(len(full), dtype=np.float64)
        write_pos = len(self._hist) + idx
        tap1 = np.interp(write_pos - d1, positions, full)
        tap2 = np.interp(write_pos - d2, positions, full)

        self._hist = full[-(self.win + 2) :]
        return (g1 * tap1 + g2 * tap2).astype(np.float32)

    def _push_history(self, x: np.ndarray) -> None:
        if len(x) == 0:
            return
        full = np.concatenate([self._hist, x.astype(np.float32)])
        self._hist = full[-(self.win + 2) :]


class FormantShifter:
    """STFT cepstral-envelope formant shifter with streaming overlap-add.

    Warps the spectral envelope by ``2^(semitones/12)`` while keeping the
    harmonic structure (pitch) intact. Adds FFT - HOP samples of latency.
    """

    FFT = 1024
    HOP = 256

    def __init__(self, sample_rate: int) -> None:
        self.sr = sample_rate
        self.window = sps.get_window("hann", self.FFT).astype(np.float32)
        # Hann with 75% overlap sums (analysis*synthesis window) to 1.5.
        self._ola_norm = 1.5
        self._in_buf = np.zeros(0, dtype=np.float32)
        self._ola = np.zeros(self.FFT, dtype=np.float32)
        self._out_fifo = np.zeros(0, dtype=np.float32)
        self._lifter = max(20, int(sample_rate / 1000))

    def process(self, x: np.ndarray, semitones: float) -> np.ndarray:
        n = len(x)
        if n == 0:
            return x
        shift = 2.0 ** (semitones / 12.0)
        self._in_buf = np.concatenate([self._in_buf, x.astype(np.float32)])

        while len(self._in_buf) >= self.FFT:
            frame = self._in_buf[: self.FFT]
            self._in_buf = self._in_buf[self.HOP :]
            processed = self._process_frame(frame, shift)
            self._ola[: self.FFT] += processed
            self._out_fifo = np.concatenate([self._out_fifo, self._ola[: self.HOP] / self._ola_norm])
            self._ola = np.concatenate([self._ola[self.HOP :], np.zeros(self.HOP, dtype=np.float32)])

        if len(self._out_fifo) >= n:
            out = self._out_fifo[:n]
            self._out_fifo = self._out_fifo[n:]
        else:
            # Warm-up: pad the initial latency gap with silence.
            pad = np.zeros(n - len(self._out_fifo), dtype=np.float32)
            out = np.concatenate([pad, self._out_fifo])
            self._out_fifo = np.zeros(0, dtype=np.float32)
        return out.astype(np.float32)

    def _process_frame(self, frame: np.ndarray, shift: float) -> np.ndarray:
        spec = np.fft.rfft(frame * self.window)
        mag = np.abs(spec)
        phase = np.angle(spec)

        log_mag = np.log(mag + 1e-9)
        ceps = np.fft.irfft(log_mag)
        ceps_lift = ceps.copy()
        ceps_lift[self._lifter : -self._lifter] = 0.0
        envelope = np.fft.rfft(ceps_lift).real

        bins = np.arange(len(mag), dtype=np.float64)
        warped = np.interp(bins / shift, bins, envelope, left=envelope[0], right=envelope[-1])

        new_mag = np.exp(log_mag - envelope + warped)
        new_spec = new_mag * np.exp(1j * phase)
        return (np.fft.irfft(new_spec) * self.window).astype(np.float32)


class RobotEffect:
    """Ring modulation against a sine carrier — classic metallic robot voice."""

    def __init__(self, sample_rate: int) -> None:
        self.sr = sample_rate
        self._phase = 0.0

    def process(self, x: np.ndarray, params: dict) -> np.ndarray:
        freq = _clipf(params.get("freq"), 10.0, 400.0, 90.0)
        n = len(x)
        phases = self._phase + 2.0 * np.pi * freq * np.arange(n) / self.sr
        self._phase = float((self._phase + 2.0 * np.pi * freq * n / self.sr) % (2.0 * np.pi))
        return (x * np.sin(phases)).astype(np.float32)


class WhisperEffect:
    """Replaces the excitation with envelope-shaped noise for a breathy voice."""

    BLOCK = 128

    def __init__(self, sample_rate: int) -> None:
        self.sr = sample_rate
        self._env = 0.0
        self._rng = np.random.default_rng(0x5EED)

    def process(self, x: np.ndarray, params: dict) -> np.ndarray:
        mix = _clipf(params.get("mix"), 0.0, 1.0, 1.0)
        n = len(x)
        n_blocks = math.ceil(n / self.BLOCK)
        padded = np.zeros(n_blocks * self.BLOCK, dtype=np.float32)
        padded[:n] = x
        rms = np.sqrt(np.mean(padded.reshape(n_blocks, self.BLOCK) ** 2, axis=1))

        env = np.empty(n_blocks, dtype=np.float32)
        e = self._env
        for i in range(n_blocks):
            e = 0.72 * e + 0.28 * rms[i]
            env[i] = e
        self._env = float(e)

        env_full = np.repeat(env, self.BLOCK)[:n]
        noise = self._rng.standard_normal(n).astype(np.float32) * env_full * 1.6
        return ((1.0 - mix) * x + mix * noise).astype(np.float32)


class TelephoneEffect:
    """Narrow 300–3400 Hz bandpass with light saturation — landline character."""

    def __init__(self, sample_rate: int) -> None:
        nyq = sample_rate / 2.0
        lo = min(300.0 / nyq, 0.4)
        hi = min(3400.0 / nyq, 0.95)
        self._sos = sps.butter(4, [lo, hi], btype="band", output="sos")
        self._zi = np.zeros((self._sos.shape[0], 2))

    def process(self, x: np.ndarray, params: dict) -> np.ndarray:
        y, self._zi = sps.sosfilt(self._sos, x, zi=self._zi)
        return (np.tanh(y * 1.6) * 0.92).astype(np.float32)


class DistortionEffect:
    """Soft-clipping tanh drive."""

    def process(self, x: np.ndarray, params: dict) -> np.ndarray:
        drive = _clipf(params.get("drive"), 0.0, 1.0, 0.4)
        gain = 1.0 + drive * 24.0
        y = np.tanh(x * gain)
        return (y * (0.9 / max(np.tanh(gain * 0.25), 1e-3)) * 0.35 + y * 0.45).astype(np.float32)


class BitcrushEffect:
    """Bit-depth reduction + sample-rate decimation (sample & hold)."""

    def __init__(self) -> None:
        self._hold = 0.0
        self._count = 0

    def process(self, x: np.ndarray, params: dict) -> np.ndarray:
        bits = _clipi(params.get("bits"), 2, 16, 8)
        down = _clipi(params.get("down"), 1, 32, 4)
        n = len(x)
        y = x

        if down > 1:
            idx = np.arange(n) + self._count
            keep = (idx % down) == 0
            pos = np.where(keep, np.arange(n), -1)
            pos = np.maximum.accumulate(pos)
            y = np.where(pos >= 0, x[np.maximum(pos, 0)], np.float32(self._hold))
            self._count = int((self._count + n) % down)
            self._hold = float(y[-1]) if n > 0 else self._hold

        q = float(2 ** (bits - 1))
        return (np.round(y * q) / q).astype(np.float32)


class ChorusEffect:
    """LFO-modulated fractional delay mixed with the dry signal."""

    MAX_DELAY_S = 0.040

    def __init__(self, sample_rate: int) -> None:
        self.sr = sample_rate
        self._phase = 0.0
        self._hist = np.zeros(int(self.MAX_DELAY_S * sample_rate) + 2, dtype=np.float32)

    def process(self, x: np.ndarray, params: dict) -> np.ndarray:
        rate = _clipf(params.get("rate"), 0.05, 5.0, 0.8)
        depth = _clipf(params.get("depth"), 0.0, 1.0, 0.5)
        mix = _clipf(params.get("mix"), 0.0, 1.0, 0.5)
        n = len(x)

        base = 0.020 * self.sr
        span = 0.012 * self.sr * depth
        phases = self._phase + 2.0 * np.pi * rate * np.arange(n) / self.sr
        self._phase = float((self._phase + 2.0 * np.pi * rate * n / self.sr) % (2.0 * np.pi))
        delays = base + span * np.sin(phases)

        full = np.concatenate([self._hist, x.astype(np.float32)])
        positions = np.arange(len(full), dtype=np.float64)
        read_pos = len(self._hist) + np.arange(n, dtype=np.float64) - delays
        wet = np.interp(read_pos, positions, full)

        keep = int(self.MAX_DELAY_S * self.sr) + 2
        self._hist = full[-keep:]
        return ((1.0 - mix) * x + mix * wet).astype(np.float32)


class EchoEffect:
    """Feedback delay line."""

    def __init__(self, sample_rate: int) -> None:
        self.sr = sample_rate
        self._time = None
        self._comb: _FeedbackComb | None = None

    def process(self, x: np.ndarray, params: dict) -> np.ndarray:
        time_s = _clipf(params.get("time"), 0.03, 1.5, 0.25)
        feedback = _clipf(params.get("feedback"), 0.0, 0.9, 0.35)
        mix = _clipf(params.get("mix"), 0.0, 1.0, 0.35)
        if self._comb is None or self._time != time_s:
            self._comb = _FeedbackComb(int(time_s * self.sr))
            self._time = time_s
        wet = self._comb.process(x, feedback)
        return ((1.0 - mix) * x + mix * wet).astype(np.float32)


class ReverbEffect:
    """Schroeder reverb: four parallel feedback combs into two series allpasses."""

    COMB_DELAYS_S = (0.0297, 0.0371, 0.0411, 0.0437)

    def __init__(self, sample_rate: int) -> None:
        self.sr = sample_rate
        self._size = None
        self._combs: list[_FeedbackComb] = []
        self._allpasses: list[_Allpass] = []

    def _build(self, size: float) -> None:
        scale = 0.6 + 1.6 * size
        self._combs = [_FeedbackComb(int(t * scale * self.sr)) for t in self.COMB_DELAYS_S]
        self._allpasses = [
            _Allpass(int(0.0050 * self.sr), 0.7),
            _Allpass(int(0.0017 * self.sr), 0.7),
        ]
        self._size = size

    def process(self, x: np.ndarray, params: dict) -> np.ndarray:
        size = _clipf(params.get("size"), 0.0, 1.0, 0.5)
        mix = _clipf(params.get("mix"), 0.0, 1.0, 0.35)
        if self._size != size or not self._combs:
            self._build(size)

        base_fb = min(0.70 + 0.22 * size, 0.9)
        wet = np.zeros(len(x), dtype=np.float32)
        for i, comb in enumerate(self._combs):
            wet += comb.process(x, min(base_fb + i * 0.012, 0.92))
        wet /= len(self._combs)
        for allpass in self._allpasses:
            wet = allpass.process(wet)
        return ((1.0 - mix) * x + mix * wet).astype(np.float32)


def _rbj_shelf(sample_rate: int, f0: float, gain_db: float, kind: str) -> np.ndarray:
    """RBJ audio-EQ-cookbook shelving biquad, returned as one SOS row."""
    A = 10.0 ** (gain_db / 40.0)
    w0 = 2.0 * np.pi * min(f0 / sample_rate, 0.45)
    cos_w0 = np.cos(w0)
    alpha = np.sin(w0) / 2.0 * np.sqrt(2.0)  # shelf slope S = 1
    two_sqrt_a_alpha = 2.0 * np.sqrt(A) * alpha

    if kind == "low":
        b0 = A * ((A + 1) - (A - 1) * cos_w0 + two_sqrt_a_alpha)
        b1 = 2 * A * ((A - 1) - (A + 1) * cos_w0)
        b2 = A * ((A + 1) - (A - 1) * cos_w0 - two_sqrt_a_alpha)
        a0 = (A + 1) + (A - 1) * cos_w0 + two_sqrt_a_alpha
        a1 = -2 * ((A - 1) + (A + 1) * cos_w0)
        a2 = (A + 1) + (A - 1) * cos_w0 - two_sqrt_a_alpha
    else:
        b0 = A * ((A + 1) + (A - 1) * cos_w0 + two_sqrt_a_alpha)
        b1 = -2 * A * ((A - 1) + (A + 1) * cos_w0)
        b2 = A * ((A + 1) + (A - 1) * cos_w0 - two_sqrt_a_alpha)
        a0 = (A + 1) - (A - 1) * cos_w0 + two_sqrt_a_alpha
        a1 = 2 * ((A - 1) - (A + 1) * cos_w0)
        a2 = (A + 1) - (A - 1) * cos_w0 - two_sqrt_a_alpha

    return np.array([b0 / a0, b1 / a0, b2 / a0, 1.0, a1 / a0, a2 / a0])


class EqEffect:
    """Low shelf (250 Hz) + high shelf (4 kHz) tone control."""

    def __init__(self, sample_rate: int) -> None:
        self.sr = sample_rate
        self._gains = None
        self._sos = None
        self._zi = None

    def process(self, x: np.ndarray, params: dict) -> np.ndarray:
        low = _clipf(params.get("low"), -15.0, 15.0, 0.0)
        high = _clipf(params.get("high"), -15.0, 15.0, 0.0)
        if (low, high) != self._gains:
            self._sos = np.vstack(
                [
                    _rbj_shelf(self.sr, 250.0, low, "low"),
                    _rbj_shelf(self.sr, 4000.0, high, "high"),
                ]
            )
            self._zi = np.zeros((self._sos.shape[0], 2))
            self._gains = (low, high)
        y, self._zi = sps.sosfilt(self._sos, x, zi=self._zi)
        return y.astype(np.float32)


class CompressorEffect:
    """Block-based RMS compressor with attack/release smoothing and auto make-up."""

    BLOCK = 64

    def __init__(self, sample_rate: int) -> None:
        self.sr = sample_rate
        self._env_db = -80.0
        self._attack = math.exp(-self.BLOCK / (sample_rate * 0.006))
        self._release = math.exp(-self.BLOCK / (sample_rate * 0.090))

    def process(self, x: np.ndarray, params: dict) -> np.ndarray:
        threshold = _clipf(params.get("threshold"), -60.0, 0.0, -20.0)
        ratio = _clipf(params.get("ratio"), 1.0, 20.0, 3.0)
        n = len(x)
        n_blocks = math.ceil(n / self.BLOCK)
        padded = np.zeros(n_blocks * self.BLOCK, dtype=np.float32)
        padded[:n] = x
        rms_db = 20.0 * np.log10(
            np.sqrt(np.mean(padded.reshape(n_blocks, self.BLOCK) ** 2, axis=1)) + 1e-9
        )

        gains_db = np.empty(n_blocks, dtype=np.float32)
        env = self._env_db
        for i in range(n_blocks):
            coeff = self._attack if rms_db[i] > env else self._release
            env = coeff * env + (1.0 - coeff) * rms_db[i]
            over = env - threshold
            gains_db[i] = -over * (1.0 - 1.0 / ratio) if over > 0 else 0.0
        self._env_db = float(env)

        makeup_db = -threshold * (1.0 - 1.0 / ratio) * 0.4
        gains = 10.0 ** ((gains_db + makeup_db) / 20.0)
        return (x * np.repeat(gains, self.BLOCK)[:n]).astype(np.float32)


class GateEffect:
    """Noise gate with hysteresis and smoothed gain transitions."""

    BLOCK = 64

    def __init__(self, sample_rate: int) -> None:
        self.sr = sample_rate
        self._gain = 1.0
        self._open = True

    def process(self, x: np.ndarray, params: dict) -> np.ndarray:
        threshold = _clipf(params.get("threshold"), -80.0, -10.0, -45.0)
        n = len(x)
        n_blocks = math.ceil(n / self.BLOCK)
        padded = np.zeros(n_blocks * self.BLOCK, dtype=np.float32)
        padded[:n] = x
        rms_db = 20.0 * np.log10(
            np.sqrt(np.mean(padded.reshape(n_blocks, self.BLOCK) ** 2, axis=1)) + 1e-9
        )

        gains = np.empty(n_blocks, dtype=np.float32)
        gain = self._gain
        is_open = self._open
        for i in range(n_blocks):
            if is_open and rms_db[i] < threshold - 6.0:
                is_open = False
            elif not is_open and rms_db[i] > threshold:
                is_open = True
            target = 1.0 if is_open else 0.03
            gain = 0.82 * gain + 0.18 * target
            gains[i] = gain
        self._gain = float(gain)
        self._open = is_open

        return (x * np.repeat(gains, self.BLOCK)[:n]).astype(np.float32)


class GainEffect:
    """Simple output trim."""

    def process(self, x: np.ndarray, params: dict) -> np.ndarray:
        db = _clipf(params.get("db"), -24.0, 24.0, 0.0)
        return (x * (10.0 ** (db / 20.0))).astype(np.float32)


# Post-chain processing order. The gate runs pre-model (see pre_process).
POST_CHAIN_ORDER = (
    "robot",
    "whisper",
    "distortion",
    "bitcrush",
    "telephone",
    "chorus",
    "echo",
    "reverb",
    "eq",
    "compressor",
    "gain",
)

KNOWN_EFFECTS = POST_CHAIN_ORDER + ("gate",)


class EffectsChain:
    """A stateful per-stream effect chain.

    Layout: ``pre_process`` (noise gate) runs on the raw mic signal before any
    model, ``apply_pitch`` provides model-free pitch shifting, and
    ``post_process`` runs the formant shifter plus the ordered effect rack on
    the (converted) signal.
    """

    def __init__(self, sample_rate: int) -> None:
        self.sr = int(sample_rate)
        self._pitch = PitchShifter(self.sr)
        self._formant = FormantShifter(self.sr)
        self._effects = {
            "robot": RobotEffect(self.sr),
            "whisper": WhisperEffect(self.sr),
            "distortion": DistortionEffect(),
            "bitcrush": BitcrushEffect(),
            "telephone": TelephoneEffect(self.sr),
            "chorus": ChorusEffect(self.sr),
            "echo": EchoEffect(self.sr),
            "reverb": ReverbEffect(self.sr),
            "eq": EqEffect(self.sr),
            "compressor": CompressorEffect(self.sr),
            "gain": GainEffect(),
            "gate": GateEffect(self.sr),
        }

    @staticmethod
    def _enabled(effects: dict, key: str) -> dict | None:
        entry = effects.get(key) if isinstance(effects, dict) else None
        if isinstance(entry, dict) and entry.get("enabled"):
            return entry
        return None

    @staticmethod
    def count_active(effects: dict, formant_shift: float = 0.0) -> int:
        count = 1 if abs(formant_shift) > 1e-3 else 0
        if not isinstance(effects, dict):
            return count
        for key in KNOWN_EFFECTS:
            entry = effects.get(key)
            if isinstance(entry, dict) and entry.get("enabled"):
                count += 1
        return count

    def pre_process(self, audio: np.ndarray, effects: dict) -> np.ndarray:
        """Input-side conditioning applied before model inference."""
        params = self._enabled(effects, "gate")
        if params is None or len(audio) == 0:
            return audio
        try:
            return self._effects["gate"].process(audio, params)
        except Exception:
            logger.exception("Noise gate failed — passing signal through")
            return audio

    def apply_pitch(self, audio: np.ndarray, semitones: float) -> np.ndarray:
        """Model-free pitch shift used in DSP passthrough mode."""
        try:
            return self._pitch.process(audio, semitones)
        except Exception:
            logger.exception("Pitch shifter failed — passing signal through")
            return audio

    def post_process(
        self, audio: np.ndarray, effects: dict, formant_shift: float = 0.0
    ) -> np.ndarray:
        """Output-side chain: formant shift then the ordered effect rack."""
        if len(audio) == 0:
            return audio
        y = audio

        if abs(formant_shift) > 1e-3:
            try:
                y = self._formant.process(y, formant_shift)
            except Exception:
                logger.exception("Formant shifter failed — skipping")

        if isinstance(effects, dict):
            for key in POST_CHAIN_ORDER:
                params = self._enabled(effects, key)
                if params is None:
                    continue
                try:
                    y = self._effects[key].process(y, params)
                except Exception:
                    logger.exception("Effect %r failed — skipping", key)

        return np.clip(y, -1.0, 1.0).astype(np.float32)
