"""Local operator commands; never create or link identities or expose web admission."""

import argparse
import asyncio
import sys

from asyncpg import PostgresError
from featherlane_contracts import DisplayName, Identifier
from pydantic import TypeAdapter, ValidationError
from sqlalchemy.exc import (
    DBAPIError,
    DisconnectionError,
    OperationalError,
)
from sqlalchemy.exc import (
    TimeoutError as PoolTimeoutError,
)

from featherlane_api.config import ConfigurationError, load_settings
from featherlane_api.infrastructure.database import Database
from featherlane_api.modules.access.administration import AccessAdministration
from featherlane_api.modules.access.domain import AccessNotFound
from featherlane_api.modules.identity.application import IdentityService
from featherlane_api.modules.identity.domain import SessionSecrets
from featherlane_api.modules.identity.persistence import IdentityStore


def identifier(value: str) -> str:
    try:
        return TypeAdapter(Identifier).validate_python(value)
    except ValidationError:
        raise argparse.ArgumentTypeError("Expected a resource identifier") from None


def organization_name(value: str) -> str:
    try:
        name = TypeAdapter(DisplayName).validate_python(value.strip())
    except ValidationError:
        raise argparse.ArgumentTypeError(
            "Enter a name of 1 to 128 characters"
        ) from None
    return name


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--issuer", required=True)
    parser.add_argument("--subject", required=True)
    commands = parser.add_subparsers(dest="command", required=True)
    bootstrap = commands.add_parser(
        "bootstrap", help="Create an organization and its first grant"
    )
    bootstrap.add_argument("--name", required=True, type=organization_name)
    organization = commands.add_parser("organization-member")
    organization.add_argument("action", choices=("grant", "revoke"))
    organization.add_argument("--organization-id", required=True, type=identifier)
    project = commands.add_parser("project-member")
    project.add_argument("action", choices=("grant", "revoke"))
    project.add_argument("--project-id", required=True, type=identifier)
    return parser.parse_args()


async def execute(args: argparse.Namespace) -> str:
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
            async with session.begin():
                # Lock the existing active user before any membership locks/writes.
                user = await identity.lookup_user(args.issuer, args.subject, lock=True)
                if user is None:
                    raise AccessNotFound()
                access = AccessAdministration(session)
                if args.command == "bootstrap":
                    organization_id = await access.bootstrap(user, args.name)
                    result = f"Organization created: {organization_id}"
                elif args.command == "organization-member":
                    await access.organization_membership(
                        user, args.organization_id, args.action == "grant"
                    )
                    result = "Organization membership updated."
                else:
                    await access.project_membership(
                        user, args.project_id, args.action == "grant"
                    )
                    result = "Project membership updated."
            return result
    finally:
        await database.close()


def main() -> None:
    args = arguments()
    try:
        result = asyncio.run(execute(args))
    except ConfigurationError as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(2) from None
    except AccessNotFound:
        print(
            "Existing active identity or required membership/resource not found.",
            file=sys.stderr,
        )
        raise SystemExit(1) from None
    except (
        OSError,
        TimeoutError,
        DisconnectionError,
        PoolTimeoutError,
        DBAPIError,
        PostgresError,
    ) as error:
        disconnected = isinstance(error, DBAPIError) and error.connection_invalidated
        if (
            isinstance(error, (DBAPIError, PostgresError))
            and not isinstance(error, OperationalError)
            and not disconnected
        ):
            # Connection/authentication/resource failures are operational. SQL
            # syntax, missing columns and other programming faults still surface.
            state = getattr(error, "sqlstate", None) or getattr(
                getattr(error, "orig", None), "sqlstate", None
            )
            if not state or not (
                state.startswith(("08", "28", "53"))
                or state in {"3D000", "42501", "57P01", "57P02", "57P03"}
            ):
                raise
        print(
            "Database operation failed; verify the current state before retrying.",
            file=sys.stderr,
        )
        raise SystemExit(1) from None
    print(result)


if __name__ == "__main__":
    main()
