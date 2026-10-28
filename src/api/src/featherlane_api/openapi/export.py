"""Deterministic offline snapshot and provenance export."""

import argparse
import json
from pathlib import Path

from featherlane_contracts import CONTRACT_VERSION, PROTOCOL_VERSION
from openapi_spec_validator import validate

from featherlane_api.openapi.schema import create_schema_app, schema_digest, schema_json


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    schema = create_schema_app().openapi()
    validate(schema)
    content = schema_json(schema)
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "openapi.json").write_text(content)
    manifest = {
        "contractVersion": CONTRACT_VERSION,
        "protocolVersion": PROTOCOL_VERSION,
        "schemaDigest": schema_digest(schema),
    }
    (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
