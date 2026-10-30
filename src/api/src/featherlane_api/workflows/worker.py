"""Control-plane worker: DBOS evaluation plus independent lifecycle maintenance."""

import argparse
import asyncio

from dbos import DBOS
from sqlalchemy import text

from featherlane_api.config import ApiSettings, load_settings
from featherlane_api.infrastructure.database import Database
from featherlane_api.modules.evaluation.judge_provider import JudgeProvider
from featherlane_api.modules.evidence.storage import LocalPrivateArtifactStorage
from featherlane_api.modules.finalization.processing import EvaluationProcessor
from featherlane_api.modules.leases.application import LeaseService
from featherlane_api.modules.leases.persistence import LeaseStore
from featherlane_api.modules.runners.domain import RunnerSecrets
from featherlane_api.workflows.evaluation import configure
from featherlane_api.workflows.runtime import APPLICATION, QUEUE, system_database_url


async def run(once: bool) -> None:
    settings = load_settings()
    database = Database(settings)
    launched = False
    try:
        await database.check_ready()
        async with database.session_factory() as session, session.begin():
            await LeaseStore(session).check_ready()
        storage = LocalPrivateArtifactStorage(settings.artifact_root)
        storage.prepare()
        evaluation = EvaluationProcessor(database, storage)
        # A stable executor is a single-process recovery mode, not distributed HA.
        # Keep the connection open for the worker lifetime to own this advisory lock.
        async with database.engine.connect() as owner:
            owned = await owner.scalar(text("SELECT pg_try_advisory_lock(170017, 1)"))
            await owner.commit()
            if not owned:
                raise RuntimeError("An evaluation worker already owns this database")
            if not once:
                configure(settings, storage)
                DBOS(
                    config={
                        "name": APPLICATION,
                        "system_database_url": system_database_url(settings),
                        "application_version": "evaluation-v1",
                        "executor_id": "evaluation-single-worker-v1",
                        "enable_otlp": False,
                        "sys_db_pool_size": 5,
                        "max_executor_threads": 4,
                    }
                )
                DBOS.listen_queues([QUEUE])
                await asyncio.to_thread(DBOS.launch)
                launched = True
                judge_config = JudgeProvider().config
                await DBOS.register_queue_async(
                    QUEUE,
                    worker_concurrency=min(2, judge_config.max_concurrent_requests)
                    if judge_config
                    else 2,
                    global_concurrency=2,
                )
            await maintenance(database, settings, evaluation, once)
    finally:
        if launched:
            await asyncio.to_thread(DBOS.destroy)
        await database.close()


async def maintenance(
    database: Database,
    settings: ApiSettings,
    evaluation: EvaluationProcessor,
    once: bool,
) -> None:
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
            expired = await evaluation.expire()
            print(
                f"Maintenance: {count} leases and {expired} evaluations expired.",
                flush=True,
            )
        if once:
            return
        await asyncio.sleep(5)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run server evaluation and expiry; never execute simulations."
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
