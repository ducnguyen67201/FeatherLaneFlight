"""Bounded local suite operator workflow; no browser/machine publication API."""

import argparse
import asyncio
import json
import sys
from pathlib import Path

from featherlane_contracts import Digest, Identifier
from featherlane_contracts.registration import integration_digest, integration_identity
from featherlane_contracts.suites import (
    PublishedSuiteDefinition,
    RevisionNumber,
    suite_digest,
)
from pydantic import TypeAdapter, ValidationError
from sqlalchemy.exc import DBAPIError

from featherlane_api.config import ConfigurationError, load_settings
from featherlane_api.http.errors import ApiError
from featherlane_api.infrastructure.database import Database
from featherlane_api.modules.access.domain import AccessNotFound
from featherlane_api.modules.identity.application import IdentityService
from featherlane_api.modules.identity.domain import SessionSecrets
from featherlane_api.modules.identity.persistence import IdentityStore
from featherlane_api.modules.suites.builtin import synthetic_nominal
from featherlane_api.modules.suites.importing import SuiteImporter
from featherlane_api.modules.suites.persistence import SuiteRevisionConflict
from featherlane_api.modules.suites.qualification import reference_profile


def identifier(value: str) -> str:
    try:
        return TypeAdapter(Identifier).validate_python(value)
    except ValidationError:
        raise argparse.ArgumentTypeError("Expected a resource identifier") from None


def unique_keys(pairs: list[tuple[str, object]]) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON keys are not accepted")
        result[key] = value
    return result


def load_definition(path: Path) -> PublishedSuiteDefinition:
    if not path.is_file():
        raise ValueError("Expected a regular suite JSON file")
    with path.open("rb") as stream:
        content = stream.read(65_537)
    if len(content) > 65_536:
        raise ValueError("Suite JSON exceeds 64 KiB")
    data = json.loads(content, object_pairs_hook=unique_keys)
    return PublishedSuiteDefinition.model_validate(data)


async def import_suite(args: argparse.Namespace) -> str:
    if args.file:
        definition = load_definition(args.file)
    else:
        if not all((args.profile_id, args.profile_revision, args.profile_digest)):
            raise ValueError("A built-in import needs exact registered profile inputs")
        definition = synthetic_nominal(
            identifier(args.profile_id),
            TypeAdapter(RevisionNumber).validate_python(args.profile_revision),
            TypeAdapter(Digest).validate_python(args.profile_digest),
        )
    settings = load_settings()
    database = Database(settings)
    try:
        async with database.session_factory() as session:
            identity = IdentityService(
                IdentityStore(session),
                SessionSecrets(settings.session_hash_key.get_secret_value()),
                settings.session_ttl_seconds,
                settings.oidc_ttl_seconds,
            )
            view = await SuiteImporter(session, identity).import_definition(
                issuer=args.issuer,
                subject=args.subject,
                project_id=args.project_id,
                definition=definition,
            )
            return f"Published synthetic revision: {view.id}; digest: {view.digest}"
    finally:
        await database.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser(
        "describe-profile", help="Print the reference metadata for P09 registration"
    )
    validate = commands.add_parser(
        "validate", help="Validate structure only; does not qualify or publish"
    )
    validate.add_argument("file", type=Path)
    publish = commands.add_parser(
        "import", help="Atomically bind, qualify, import and audit a synthetic revision"
    )
    publish.add_argument("--issuer", required=True)
    publish.add_argument("--subject", required=True)
    publish.add_argument("--project-id", type=identifier, required=True)
    source = publish.add_mutually_exclusive_group(required=True)
    source.add_argument("--file", type=Path)
    source.add_argument("--builtin", choices=["synthetic-nominal"])
    publish.add_argument("--profile-id")
    publish.add_argument("--profile-revision", type=int)
    publish.add_argument("--profile-digest")
    args = parser.parse_args()
    try:
        if args.command == "describe-profile":
            profile = reference_profile()
            result = json.dumps(
                {
                    "profile": profile.model_dump(mode="json"),
                    "id": integration_identity(profile),
                    "digest": integration_digest(profile),
                },
                indent=2,
            )
        elif args.command == "validate":
            result = (
                "Structure valid; not published or qualified. Digest: "
                + suite_digest(load_definition(args.file))
            )
        else:
            result = asyncio.run(import_suite(args))
    except SuiteRevisionConflict:
        print(
            "An immutable revision already exists with different content.",
            file=sys.stderr,
        )
        raise SystemExit(1) from None
    except (ValueError, OSError, ConfigurationError):
        print(
            "Invalid suite/configuration; use bounded input and an exact profile.",
            file=sys.stderr,
        )
        raise SystemExit(2) from None
    except AccessNotFound:
        print(
            "Existing identity or required project membership/resource not found.",
            file=sys.stderr,
        )
        raise SystemExit(1) from None
    except ApiError as error:
        print(f"{error.code}: {error.message}", file=sys.stderr)
        raise SystemExit(1) from None
    except DBAPIError:
        print(
            "Database operation failed; verify migrations/state before retrying.",
            file=sys.stderr,
        )
        raise SystemExit(1) from None
    print(result)


if __name__ == "__main__":
    main()
