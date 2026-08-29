"""Origin validation for CORS and the audio WebSocket handshake."""

import pytest

from backend.config import DEFAULT_ALLOWED_ORIGINS
from backend.security import (
    cors_origins,
    is_origin_allowed,
    is_same_origin,
    normalize_origin,
)

LOCAL = DEFAULT_ALLOWED_ORIGINS


class TestNormalizeOrigin:
    def test_canonicalizes_case_and_trailing_slash(self):
        assert normalize_origin("HTTP://LocalHost:5173/") == "http://localhost:5173"

    def test_fills_in_the_default_port(self):
        assert normalize_origin("http://example.com") == "http://example.com:80"
        assert normalize_origin("https://example.com") == "https://example.com:443"

    def test_rejects_unparseable_values(self):
        assert normalize_origin("not-a-url") is None
        assert normalize_origin("") is None


class TestIsSameOrigin:
    def test_page_served_by_this_backend_on_a_lan_address(self):
        # The scenario that keeps intentional LAN use working unconfigured.
        assert is_same_origin("http://192.168.1.50:8000", "192.168.1.50:8000")

    def test_default_port_absent_from_host_header(self):
        assert is_same_origin("http://ovc.local", "ovc.local")

    def test_different_port_is_not_same_origin(self):
        assert not is_same_origin("http://localhost:9999", "localhost:8000")

    def test_different_host_is_not_same_origin(self):
        assert not is_same_origin("https://evil.example", "192.168.1.50:8000")

    def test_ipv6_literal(self):
        assert is_same_origin("http://[::1]:8000", "[::1]:8000")

    def test_missing_host_header(self):
        assert not is_same_origin("http://localhost:8000", None)


class TestIsOriginAllowed:
    def test_allows_configured_origins(self):
        assert is_origin_allowed("http://localhost:5173", "localhost:8000", LOCAL)

    @pytest.mark.parametrize(
        "origin",
        ["https://evil.example", "http://attacker.localhost:8000", "http://localhost:9999"],
    )
    def test_rejects_cross_site_origins(self, origin):
        assert not is_origin_allowed(origin, "localhost:8000", LOCAL)

    def test_allows_same_origin_not_in_the_list(self):
        assert is_origin_allowed("http://192.168.1.50:8000", "192.168.1.50:8000", LOCAL)

    def test_allows_a_missing_origin_header(self):
        # Only browsers send Origin; its absence means a client an attacker
        # cannot drive from a victim's session (curl, tests, native apps).
        assert is_origin_allowed(None, "localhost:8000", LOCAL)
        assert is_origin_allowed("", "localhost:8000", LOCAL)
        assert is_origin_allowed("   ", "localhost:8000", LOCAL)

    def test_rejects_the_opaque_null_origin(self):
        assert not is_origin_allowed("null", "localhost:8000", LOCAL)

    def test_rejects_a_malformed_origin(self):
        assert not is_origin_allowed("javascript:alert(1)", "localhost:8000", LOCAL)

    def test_allow_any_opt_in_permits_everything(self):
        assert is_origin_allowed("https://evil.example", "localhost:8000", [], allow_any=True)

    def test_explicit_wildcard_entry_still_works(self):
        assert is_origin_allowed("https://evil.example", "localhost:8000", ["*"])

    def test_empty_allowlist_still_permits_same_origin(self):
        assert is_origin_allowed("http://localhost:8000", "localhost:8000", [])
        assert not is_origin_allowed("http://localhost:5173", "localhost:8000", [])


class TestCorsOrigins:
    def test_passes_the_configured_allowlist_through(self):
        assert cors_origins(LOCAL, allow_any=False) == LOCAL

    def test_wildcards_only_on_explicit_opt_in(self):
        assert cors_origins(LOCAL, allow_any=True) == ["*"]

    def test_drops_empty_entries(self):
        assert cors_origins(["http://a.test", ""], allow_any=False) == ["http://a.test"]


class TestSecureDefaults:
    def test_default_bind_host_is_loopback(self):
        from backend.config import settings

        assert settings.HOST == "127.0.0.1"

    def test_default_origins_are_not_a_wildcard(self):
        from backend.config import settings

        assert "*" not in settings.CORS_ORIGINS
        assert settings.ALLOW_ANY_ORIGIN is False

    def test_unsafe_checkpoint_loading_is_off_by_default(self):
        from backend.config import settings

        assert settings.RVC_ALLOW_UNSAFE_CHECKPOINTS is False
