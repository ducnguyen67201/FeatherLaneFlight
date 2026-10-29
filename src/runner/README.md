# Runner identity and idle health

P08 supplies an outbound Python client for enrollment, identity recovery and idle
heartbeats. It does not install PX4/SIH, resolve local execution inputs, claim
jobs or run simulations. P09 binds the canonical local inventory to the typed
heartbeat transport; empty default declarations do not claim available inputs.

From a prepared checkout, run `uv sync --all-packages --frozen`, then:

```sh
uv run --frozen --package featherlane-runner flf-runner enroll
uv run --frozen --package featherlane-runner flf-runner start
```

Enrollment prompts for one HTTPS service origin (loopback HTTP is permitted for
local development) and a hidden, one-use project grant created in the Runners UI.
Never put the grant or machine credential in command arguments, URLs or logs.
The host must run a supported POSIX Python 3.12 environment; a standalone installer,
Windows support and simulator setup are not supplied by P08.

The client creates a random 256-bit credential and enrollment request ID, then
saves them **before** the exchange. Its default directory is
`~/.featherlane-runner`, outside the checkout, with directory mode 0700 and file
mode 0600. This release uses the protected-file fallback, not an OS keychain.
It refuses insecure permissions, symlinked/writable ancestors, checkout storage
and a second process holding the same identity lock. Writes replace the private
state atomically and fsync it. It never overwrites an existing enrolled identity.
For distinct machines/projects use an explicitly separate private directory:
`flf-runner --state-dir /absolute/private/directory enroll`.

If the enrollment response is lost, repeat `enroll`; it reuses the saved exact
request. `flf-runner recover` authenticates with the saved credential to recover
an identity already created by the server. A rejected/expired initial grant with
no server identity cannot be recovered through `/runner/me`: revoke any known
identity, preserve uncertain state until resolved, and use a new private directory
with a fresh grant. There is no automatic identity replacement or token refresh.

`start --once` sends one idle heartbeat. `start` repeats every 10 seconds, with a
bounded backoff after unconfirmed requests. Pending heartbeat payloads are saved
before sending and retried unchanged. A replay never advances server contact time.
The shipped CLI reports `DISABLED`/`NOT_CONFIGURED` and empty local inputs until
P09's real inventory binding is present. The typed `RunnerTransport.heartbeat`
accepts canonical `RunnerHeartbeat` declarations; reporting metadata is not
qualification or permission to execute. Confirmed `NEEDS_CLEANUP` cannot be cleared
through an ordinary idle heartbeat. Revoked/expired credentials stop authenticating.
