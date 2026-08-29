"""Origin validation shared by the CORS middleware and the WebSocket handshake.

The studio is a local-first app: the browser page and the API almost always
share an origin. That makes the safe default easy — accept same-origin traffic
plus an explicit allowlist, and reject everything else — while still letting an
operator run the frontend on a different host or port by configuring
``OVC_CORS_ORIGINS``.
"""

from urllib.parse import urlsplit

# Ports that never appear in an Origin header because they are the scheme
# default, but which a Host header may or may not include.
_DEFAULT_PORTS = {"http": "80", "https": "443", "ws": "80", "wss": "443"}


def _split_origin(origin: str) -> tuple[str, str, str] | None:
    """Split an origin into (scheme, host, port), or None if unparseable."""
    parts = urlsplit(origin.strip().rstrip("/"))
    if not parts.scheme or not parts.hostname:
        return None
    scheme = parts.scheme.lower()
    port = str(parts.port) if parts.port else _DEFAULT_PORTS.get(scheme, "")
    return scheme, parts.hostname.lower(), port


def normalize_origin(origin: str) -> str | None:
    """Return a canonical ``scheme://host:port`` string, or None if invalid."""
    split = _split_origin(origin)
    if split is None:
        return None
    scheme, host, port = split
    return f"{scheme}://{host}:{port}" if port else f"{scheme}://{host}"


def _authority(host_header: str) -> tuple[str, str] | None:
    """Split a Host header into (host, port). Port may be an empty string."""
    host_header = host_header.strip()
    if not host_header:
        return None
    # Reuse urlsplit so IPv6 literals like [::1]:8000 are handled correctly.
    parts = urlsplit(f"//{host_header}")
    if not parts.hostname:
        return None
    return parts.hostname.lower(), str(parts.port) if parts.port else ""


def is_same_origin(origin: str, host_header: str | None) -> bool:
    """True when ``origin``'s authority matches the request's Host header.

    A page served by this backend always satisfies this, on loopback and on a
    LAN address alike, which is what keeps intentional LAN use working without
    configuration. A cross-site attacker page cannot satisfy it: the browser
    sets Origin to the attacker's own site while Host stays ours.
    """
    if not host_header:
        return False
    split = _split_origin(origin)
    authority = _authority(host_header)
    if split is None or authority is None:
        return False

    _scheme, origin_host, origin_port = split
    host, port = authority
    if origin_host != host:
        return False
    # An absent Host port means the scheme default was used.
    return origin_port == port or (not port and origin_port in _DEFAULT_PORTS.values())


def is_origin_allowed(
    origin: str | None,
    host_header: str | None,
    allowed_origins: list[str],
    allow_any: bool = False,
) -> bool:
    """Decide whether a browser origin may talk to this backend.

    A missing Origin header is allowed: only browsers attach one, so its
    absence means a non-browser client (curl, a test, a native app) that an
    attacker cannot drive from a victim's session. The literal ``"null"``
    origin — sandboxed iframes and ``file://`` pages — is rejected because it
    is not attributable to any site.
    """
    if allow_any:
        return True
    if origin is None or not origin.strip():
        return True
    if origin.strip().lower() == "null":
        return False

    normalized = normalize_origin(origin)
    if normalized is None:
        return False
    for candidate in allowed_origins:
        if candidate == "*":
            return True
        if normalize_origin(candidate) == normalized:
            return True

    return is_same_origin(origin, host_header)


def cors_origins(allowed_origins: list[str], allow_any: bool) -> list[str]:
    """Origin list for Starlette's CORS middleware.

    Same-origin requests never reach CORS, so the middleware only needs the
    configured allowlist.
    """
    if allow_any:
        return ["*"]
    return [origin for origin in allowed_origins if origin]
