"""Local API process entry point with sanitized configuration failures."""

import sys

import uvicorn

from featherlane_api.app import create_app
from featherlane_api.config import ConfigurationError, load_settings


def main() -> None:
    try:
        settings = load_settings()
    except ConfigurationError as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(2) from None
    uvicorn.run(
        create_app(settings),
        host=settings.host,
        port=settings.port,
        proxy_headers=False,
        access_log=False,
    )
