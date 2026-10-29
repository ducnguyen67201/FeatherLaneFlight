"""Bounded lease expiry entry point; shares API rules and never runs a job."""

import argparse
import asyncio

from featherlane_api.config import load_settings
from featherlane_api.infrastructure.database import Database
from featherlane_api.modules.leases.application import LeaseService
from featherlane_api.modules.leases.persistence import LeaseStore
from featherlane_api.modules.runners.domain import RunnerSecrets


async def run(once: bool) -> None:
    settings = load_settings()
    database = Database(settings)
    try:
        await database.check_ready()
        async with database.session_factory() as session, session.begin():
            await LeaseStore(session).check_ready()
        while True:
            async with database.session_factory() as session:
                service = LeaseService(
                    session,
                    RunnerSecrets(
                        settings.session_hash_key.get_secret_value(),
                        settings.runner_key_id,
                    ),
                )
                count = await service.sweep()
                print(f"Lease expiry batch: {count} expired.", flush=True)
            if once:
                return
            await asyncio.sleep(5)
    finally:
        await database.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Expire leases; never reassign or execute jobs."
    )
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    try:
        asyncio.run(run(args.once))
    except KeyboardInterrupt:
        return
    except Exception:
        # Configuration/driver exceptions may include private connection data.
        raise SystemExit(
            "Lease worker failed; check configuration and migrations."
        ) from None


if __name__ == "__main__":
    main()
