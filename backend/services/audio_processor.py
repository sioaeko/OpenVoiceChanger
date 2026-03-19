import struct

import numpy as np
from scipy.signal import resample as scipy_resample

# Binary frame header layout:
#   Bytes 0–3:  uint32 sequence number (little-endian)
#   Bytes 4–7:  uint32 reserved / latency field (little-endian)
#   Bytes 8–N:  float32 PCM samples (little-endian)
HEADER_SIZE = 8  # bytes
HEADER_FORMAT = "<II"  # two uint32 little-endian


def bytes_to_audio(data: bytes) -> tuple[np.ndarray, int, int]:
    """Parse a binary audio frame into samples and metadata.

    Args:
        data: Raw bytes with 8-byte header + float32 PCM payload.

    Returns:
        Tuple of (samples as float32 ndarray, sequence number, reserved field).

    Raises:
        ValueError: If the data is too short or has invalid size.
    """
    if len(data) < HEADER_SIZE:
        raise ValueError(f"Frame too short: {len(data)} bytes (minimum {HEADER_SIZE})")

    seq_num, reserved = struct.unpack(HEADER_FORMAT, data[:HEADER_SIZE])

    payload = data[HEADER_SIZE:]
    if len(payload) % 4 != 0:
        raise ValueError(
            f"Payload size {len(payload)} is not a multiple of 4 (float32 alignment)"
        )

    samples = np.frombuffer(payload, dtype=np.float32).copy()
    return samples, seq_num, reserved


def audio_to_bytes(audio: np.ndarray, seq_num: int) -> bytes:
    """Pack audio samples into the binary frame format.

    Args:
        audio: Float32 PCM samples.
        seq_num: Sequence number for this frame.

    Returns:
        Bytes with header + float32 payload.
    """
    header = struct.pack(HEADER_FORMAT, seq_num, 0)
    payload = audio.astype(np.float32).tobytes()
    return header + payload


def resample(audio: np.ndarray, from_sr: int, to_sr: int) -> np.ndarray:
    """Resample audio from one sample rate to another.

    Returns the original array unchanged if the rates match.

    Args:
        audio: Float32 PCM samples.
        from_sr: Source sample rate in Hz.
        to_sr: Target sample rate in Hz.

    Returns:
        Resampled float32 audio.
    """
    if from_sr == to_sr:
        return audio
    if audio.size == 0:
        return audio

    num_samples = int(round(len(audio) * to_sr / from_sr))
    resampled = scipy_resample(audio, num_samples)
    return resampled.astype(np.float32)
