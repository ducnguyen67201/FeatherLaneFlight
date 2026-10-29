"""Interactive enrollment, recovery and an idle heartbeat loop; no job execution."""

import argparse
import getpass
import platform
import secrets
import sys
import time
from pathlib import Path
from uuid import uuid4

from featherlane_contracts import CONTRACT_VERSION, PROTOCOL_VERSION
from featherlane_contracts.runners import EnrollRunnerRequest, RunnerDiagnostic
from pydantic import ValidationError

from featherlane_runner.inventory import declaration_heartbeat
from featherlane_runner.registration import LocalRegistrationError
from featherlane_runner.storage import LocalStateError, RunnerState, StateStore
from featherlane_runner.transport import (
    RunnerTransport,
    RunnerTransportError,
    validate_origin,
)


def enroll(store: StateStore, origin: str | None) -> None:
    state = store.read()
    if state and state.runner_id:
        raise LocalStateError()
    if state is None:
        if not sys.stdin.isatty():
            raise LocalStateError()
        selected_origin = validate_origin(
            origin or input("FeatherLane origin: ").strip()
        )
        token = getpass.getpass("One-use enrollment grant (hidden): ")
        state = RunnerState(
            origin=selected_origin,
            credential=secrets.token_hex(32),
            request_id=uuid4().hex,
            host_platform=f"{platform.system()} {platform.machine()}",
            enrollment_token=token,
        )
        # Validate before persisting or transmitting any data.
        EnrollRunnerRequest(
            enrollmentToken=token,
            requestId=state.request_id,
            credential=state.credential,
            hostPlatform=state.host_platform,
            contractVersion=CONTRACT_VERSION,
            protocolVersion=PROTOCOL_VERSION,
        )
        store.save(state)
    elif origin is not None and validate_origin(origin) != state.origin:
        raise LocalStateError()
    transport = RunnerTransport(state.origin)
    try:
        if state.enrollment_token is None:
            raise LocalStateError()
        result = transport.enroll(
            EnrollRunnerRequest(
                enrollmentToken=state.enrollment_token,
                requestId=state.request_id,
                credential=state.credential,
                hostPlatform=state.host_platform,
                contractVersion=CONTRACT_VERSION,
                protocolVersion=PROTOCOL_VERSION,
            )
        )
        state.runner_id = result.data.runner.id
        state.project_id = result.data.runner.project_id
        state.enrollment_token = None
        state.sequence = result.data.last_heartbeat_sequence
        store.save(state)
        print(
            "Runner enrolled. Identity saved privately; "
            "simulation execution is not installed."
        )
    finally:
        transport.close()


def recover(store: StateStore) -> None:
    state = store.read()
    if state is None:
        raise LocalStateError()
    transport = RunnerTransport(state.origin)
    try:
        result = transport.me(state.credential)
        if state.runner_id and state.runner_id != result.data.runner.id:
            raise LocalStateError()
        if state.project_id and state.project_id != result.data.runner.project_id:
            raise LocalStateError()
        state.runner_id = result.data.runner.id
        state.project_id = result.data.runner.project_id
        state.enrollment_token = None
        state.sequence = max(state.sequence, result.data.last_heartbeat_sequence)
        # Never discard a pending uncertain heartbeat. Start replays it unchanged.
        store.save(state)
        print(
            "Runner identity recovered. Enrollment and health only; "
            "no simulation is executing."
        )
    finally:
        transport.close()


def start(store: StateStore, once: bool, inventory: Path | None = None) -> None:
    state = store.read()
    if state is None or state.runner_id is None:
        raise LocalStateError()
    transport = RunnerTransport(state.origin)
    failures = 0
    try:
        while True:
            if state.pending_heartbeat is None:
                state.sequence += 1
                try:
                    state.pending_heartbeat = declaration_heartbeat(
                        state.sequence, inventory
                    )
                except (LocalRegistrationError, ValidationError, OSError, ValueError):
                    # Withdraw drifted/invalid input declarations without exposing
                    # private paths or skipping the durable heartbeat journal.
                    state.pending_heartbeat = declaration_heartbeat(
                        state.sequence, None
                    )
                    state.pending_heartbeat.diagnostics = [
                        RunnerDiagnostic(code="LOCALLY_DISABLED")
                    ]
                    print(
                        "Approved inputs are unavailable; declarations withdrawn.",
                        file=sys.stderr,
                    )
                store.save(state)
            try:
                result = transport.heartbeat(state.credential, state.pending_heartbeat)
                if (
                    result.data.runner.id != state.runner_id
                    or result.data.runner.project_id != state.project_id
                ):
                    raise LocalStateError()
                state.sequence = result.data.last_heartbeat_sequence
                state.pending_heartbeat = None
                store.save(state)
                failures = 0
                print(
                    "Idle heartbeat accepted. Simulation execution is not configured.",
                    flush=True,
                )
            except RunnerTransportError as exc:
                if exc.status in (400, 401, 403, 404, 409, 422):
                    raise
                failures += 1
                print(
                    "Heartbeat unconfirmed; retaining the same request for retry.",
                    file=sys.stderr,
                )
                if once:
                    raise
            if once:
                return
            time.sleep(min(60, 10 * 2 ** min(failures, 3)))
    finally:
        transport.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="FeatherLane runner enrollment and idle health. "
        "No simulator execution."
    )
    parser.add_argument(
        "--state-dir", type=Path, default=Path.home() / ".featherlane-runner"
    )
    commands = parser.add_subparsers(dest="command", required=True)
    enrolling = commands.add_parser(
        "enroll", help="Enroll or retry a saved interrupted enrollment"
    )
    enrolling.add_argument(
        "--origin", help="Pinned HTTPS service origin (loopback HTTP for development)"
    )
    commands.add_parser(
        "recover", help="Recover identity using the already saved credential"
    )
    running = commands.add_parser(
        "start", help="Send idle heartbeats; does not claim or execute jobs"
    )
    running.add_argument("--once", action="store_true")
    running.add_argument(
        "--inventory",
        type=Path,
        help="Owner-only approved local inventory JSON; metadata only",
    )
    args = parser.parse_args()
    store = StateStore(args.state_dir)
    try:
        with store.lock():
            if args.command == "enroll":
                enroll(store, args.origin)
            elif args.command == "recover":
                recover(store)
            else:
                start(store, args.once, args.inventory)
    except KeyboardInterrupt:
        print("Runner stopped. Saved state is retained.")
    except (
        RunnerTransportError,
        LocalStateError,
        ValidationError,
        OSError,
        ValueError,
        EOFError,
    ):
        # Exceptions can include raw credentials, filesystem paths or response bodies.
        print(
            "Runner operation failed. Check the service version, private state "
            "permissions and enrollment/access status. "
            "Saved requests are retained for recovery.",
            file=sys.stderr,
        )
        raise SystemExit(1) from None
