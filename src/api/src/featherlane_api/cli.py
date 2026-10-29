"""Local API process entry point with sanitized configuration failures."""

import argparse
import sys
from pathlib import Path

import uvicorn

from featherlane_api.app import create_app
from featherlane_api.config import ConfigurationError, load_settings


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the FeatherLaneFlight API")
    parser.add_argument(
        "--criteria-config", type=Path, default=Path("config/criteria-generation.toml")
    )
    args = parser.parse_args()
    try:
        settings = load_settings()
    except ConfigurationError as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(2) from None
    uvicorn.run(
        create_app(settings, criteria_config_path=args.criteria_config),
        host=settings.host,
        port=settings.port,
        proxy_headers=False,
        access_log=False,
    )
