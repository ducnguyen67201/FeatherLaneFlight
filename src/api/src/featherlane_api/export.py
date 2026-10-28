"""Deterministic offline snapshot and provenance export."""

import argparse
import hashlib
import json
from pathlib import Path

from featherlane_contracts import CONTRACT_VERSION, PROTOCOL_VERSION
from openapi_spec_validator import validate

from featherlane_api.schema import create_schema_app


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    schema = create_schema_app().openapi()
    validate(schema)
    content = json.dumps(schema, indent=2, sort_keys=True) + "\n"
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "openapi.json").write_text(content)
    manifest = {
        "contractVersion": CONTRACT_VERSION,
        "protocolVersion": PROTOCOL_VERSION,
        "schemaDigest": hashlib.sha256(content.encode()).hexdigest(),
    }
    (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
