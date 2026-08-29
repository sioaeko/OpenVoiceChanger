"""The binary frame format is unchanged by this release.

A new client must still talk to an old server and vice versa, so the header
layout and the reserved timing field are pinned here.
"""

import struct

import numpy as np
import pytest

from backend.services.audio_processor import (
    HEADER_SIZE,
    audio_to_bytes,
    bytes_to_audio,
    resample,
)


class TestFrameFormat:
    def test_header_is_still_two_little_endian_uint32(self):
        assert HEADER_SIZE == 8
        frame = audio_to_bytes(np.zeros(4, dtype=np.float32), seq_num=7, reserved=1234)
        seq, reserved = struct.unpack("<II", frame[:8])
        assert (seq, reserved) == (7, 1234)

    def test_round_trip_preserves_samples_and_metadata(self):
        audio = np.linspace(-1.0, 1.0, 256, dtype=np.float32)
        decoded, seq, reserved = bytes_to_audio(audio_to_bytes(audio, 42, reserved=99))

        np.testing.assert_allclose(decoded, audio, rtol=0, atol=0)
        assert seq == 42
        assert reserved == 99
        assert decoded.dtype == np.float32

    def test_empty_payload_is_valid(self):
        decoded, seq, _ = bytes_to_audio(audio_to_bytes(np.zeros(0, dtype=np.float32), 1))
        assert len(decoded) == 0
        assert seq == 1

    def test_reserved_field_wraps_instead_of_raising(self):
        frame = audio_to_bytes(np.zeros(1, dtype=np.float32), 0, reserved=0x1_FFFF_FFFF)
        _, _, reserved = bytes_to_audio(frame)
        assert reserved == 0xFFFFFFFF

    @pytest.mark.parametrize("data", [b"", b"\x00" * 7])
    def test_short_frames_are_rejected(self, data):
        with pytest.raises(ValueError):
            bytes_to_audio(data)

    def test_misaligned_payload_is_rejected(self):
        with pytest.raises(ValueError):
            bytes_to_audio(struct.pack("<II", 1, 0) + b"\x00\x00\x00")

    def test_decoded_samples_are_writable(self):
        """Processing mutates the array in place, so it cannot be a read-only view."""
        decoded, _, _ = bytes_to_audio(audio_to_bytes(np.ones(8, dtype=np.float32), 0))
        decoded[0] = 5.0
        assert decoded[0] == 5.0


class TestResample:
    def test_identity_when_rates_match(self):
        audio = np.ones(64, dtype=np.float32)
        assert resample(audio, 48000, 48000) is audio

    def test_length_scales_with_the_rate_ratio(self):
        # The path the browser's real 48 kHz stream takes into RVC's 16 kHz.
        audio = np.zeros(4800, dtype=np.float32)
        assert len(resample(audio, 48000, 16000)) == 1600
        assert len(resample(audio, 48000, 40000)) == 4000

    def test_empty_input(self):
        empty = np.zeros(0, dtype=np.float32)
        assert len(resample(empty, 48000, 16000)) == 0

    def test_output_is_float32(self):
        out = resample(np.ones(100, dtype=np.float32), 44100, 16000)
        assert out.dtype == np.float32
