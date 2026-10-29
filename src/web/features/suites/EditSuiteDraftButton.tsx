import { useEffect, useRef, useState } from "react";
import { Alert, Button, Stack } from "@mui/material";
import {
  ApiError,
  contractManifest,
  createSuiteDraft,
} from "@featherlane/contracts";
import type { DraftEditorConnection } from "./useSuiteDraftEditor";
import { draftPath } from "./navigation";
export function EditSuiteDraftButton({
  connection,
  organizationId,
  revisionId,
}: {
  connection: DraftEditorConnection;
  organizationId: string;
  revisionId: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef(false),
    active = useRef(true),
    key = useRef(crypto.randomUUID());
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function open() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await createSuiteDraft({
        client: connection.client,
        path: { projectId: connection.projectId },
        headers: {
          "x-flf-contract-version": contractManifest.contractVersion,
          "x-csrf-token": connection.csrfToken,
          "idempotency-key": key.current,
        },
        body: { sourceRevisionId: revisionId },
      });
      if (active.current)
        window.location.assign(
          draftPath(organizationId, connection.projectId, r.data.suiteId),
        );
    } catch (e) {
      if (!active.current) return;
      if (
        e instanceof ApiError &&
        (e.status === 401 || e.status === 403 || e.status === 404)
      )
        connection.onAccessFailure(e.status);
      else setError(e instanceof Error ? e.message : "Could not open draft.");
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  return (
    <Stack spacing={2}>
      <Button variant="contained" disabled={busy} onClick={() => void open()}>
        {busy ? "Opening…" : "Edit draft"}
      </Button>
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}
