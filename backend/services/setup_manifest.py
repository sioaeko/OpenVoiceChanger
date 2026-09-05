"""Reviewed, immutable inputs for the Windows x64 CPU inference profile."""

PROFILE = "windows-cpu-v1"
PYTHON_VERSION = "3.10.20"
MIN_FREE_BYTES = 6 * 1024**3
SETUP_BUSY = frozenset({"queued", "preparing", "python", "packages", "sources", "assets", "verifying", "switching", "restarting"})
HUBERT_SHA256 = "f54b40fd2802423a5643779c4861af1e9ee9c1564dc9d32f54f20b5ffba7db96"

# The wheel's executable bootstraps uv without installing anything globally.
UV = {
    "name": "uv.whl",
    "url": "https://files.pythonhosted.org/packages/94/5d/f8905f9af5cd46af2a688b2246dbb5a4d95b8557eeffd7f241e037659d9e/uv-0.11.14-py3-none-win_amd64.whl",
    "sha256": "f0a8b58b38e984241bca5d7a5a47bf9ffe1ca2ab392a640887db8a04c4a9ec95",
    "limit": 64 * 1024**2,
}
SOURCES = (
    {"name": "rvc.zip", "package": "rvc", "revision": "7b284a634667c34103eaaeed972b48ccdb4b893e",
     "url": "https://codeload.github.com/RVC-Project/Retrieval-based-Voice-Conversion/zip/7b284a634667c34103eaaeed972b48ccdb4b893e",
     "sha256": "f0ba5828390e2f0f007589988f8a2beee412820e7e5c8d7f22db0daf72ba641b", "limit": 64 * 1024**2},
    {"name": "fairseq.zip", "package": "fairseq", "revision": "ff08af27e302625a27d3502b0791a9367c8af0c7",
     "url": "https://codeload.github.com/Tps-F/fairseq/zip/ff08af27e302625a27d3502b0791a9367c8af0c7",
     "sha256": "d034ffb79942ae6b412bba8f23a67d3ea10173799df0084b8dc2c44756b56383", "limit": 64 * 1024**2},
)
ASSETS = (
    {"name": "hubert_base.pt", "url": "https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/e6d0c1a17da07c33557852f9dfa2bd44cc75737d/hubert_base.pt",
     "sha256": HUBERT_SHA256, "limit": 189507909},
    {"name": "rmvpe.pt", "url": "https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/e6d0c1a17da07c33557852f9dfa2bd44cc75737d/rmvpe.pt",
     "sha256": "6d62215f4306e3ca278246188607209f09af3dc77ed4232efdd069798c4ec193", "limit": 181184272},
)
