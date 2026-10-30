"""One DBOS application/database identity shared by API client and worker."""

from dbos import DBOSClient
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession

from featherlane_api.config import DatabaseSettings

APPLICATION = "featherlane-evaluation"
QUEUE = "attempt-evaluation-v1"
WORKFLOW = "evaluate-attempt-v1"
JUDGE_WORKFLOW = "judge-attempt-v1"


def system_database_url(settings: DatabaseSettings) -> str:
    return (
        make_url(settings.database_url.get_secret_value())
        .set(drivername="postgresql+psycopg")
        .render_as_string(hide_password=False)
    )


def create_client(settings: DatabaseSettings) -> DBOSClient:
    return DBOSClient(
        system_database_url=system_database_url(settings),
        application_name=APPLICATION,
        lazy=True,
        retry_connection_errors=False,
    )


async def enqueue(
    client: DBOSClient, session: AsyncSession, attempt_id: str, *, judge: bool = False
) -> None:
    connection = await session.connection()
    await connection.run_sync(
        lambda sync_connection: client.enqueue_in_transaction(
            sync_connection,
            {
                "workflow_name": JUDGE_WORKFLOW if judge else WORKFLOW,
                "queue_name": QUEUE,
                "workflow_id": f"attempt-evaluation-v1:{attempt_id}",
                "workflow_id_reuse_policy": "reject",
                "app_version": "evaluation-v1",
                "application_name": APPLICATION,
            },
            attempt_id,
        )
    )
