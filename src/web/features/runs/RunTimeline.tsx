import { useMemo, useState, type ComponentProps } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { ApiError } from "@featherlane/contracts";
import { tokens } from "../../design/theme";
import { RunEventLog } from "./RunEventLog";
import { RunTraceChart } from "./RunTraceChart";
import {
  traceSnapshot,
  traceSeconds,
  traceTickMs,
  type TraceSnapshot,
} from "./runTraceModel";

type Props = ComponentProps<typeof RunEventLog>;
export function RunTimeline(props: Props) {
  const denied =
    props.error instanceof ApiError &&
    [401, 403, 404].includes(props.error.status);
  if (denied)
    return (
      <Alert
        severity="warning"
        action={<Button onClick={props.onRetry}>Retry</Button>}
      >
        Timeline access could not be confirmed. Recorded activity is hidden.
      </Alert>
    );
  if (props.pending && !props.page)
    return (
      <Paper sx={{ p: 5 }} role="status" aria-label="Loading trace timeline">
        <Typography>Loading recorded activity…</Typography>
        <Skeleton height={tokens.component.minTouchTargetPx} />
        <Skeleton height={tokens.layoutPx.trace.viewportHeight} />
      </Paper>
    );
  return (
    <Stack spacing={4}>
      {props.error && (
        <Alert
          severity="error"
          action={<Button onClick={props.onRetry}>Retry</Button>}
        >
          Activity could not be refreshed.{" "}
          {props.page
            ? "The last recorded snapshot remains visible."
            : "No activity is available."}
        </Alert>
      )}
      {props.page && props.attemptId ? (
        <TraceView
          key={`${props.detail.id}:${props.attemptId}`}
          {...props}
          page={props.page}
          attemptId={props.attemptId}
        />
      ) : (
        <Paper sx={{ p: 5 }}>
          <Typography component="h2" variant="h2">
            Activity waterfall
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 3 }}>
            No attempt activity is recorded yet.
          </Typography>
        </Paper>
      )}
    </Stack>
  );
}
function TraceView(
  props: Props & { page: NonNullable<Props["page"]>; attemptId: string },
) {
  const current = useMemo(
    () => traceSnapshot(props.detail, props.page, props.attemptId),
    [props.detail, props.page, props.attemptId],
  );
  const [paused, setPaused] = useState<TraceSnapshot | null>(null);
  const [selectedId, setSelectedId] = useState(
    props.trial?.id ?? current.rows[0]?.id,
  );
  const [rowHeight, setRowHeight] = useState<number>(
    tokens.layoutPx.trace.rowHeight,
  );
  const [zoom, setZoom] = useState(1);
  const [initialTick] = useState(() => traceTickMs(current.maxMs / 8));
  const displayed = paused ?? current;
  const selected =
    displayed.rows.find((row) => row.id === selectedId) ?? displayed.rows[0];
  const shownIds = new Set(
    displayed.records.map((record) => record.event.eventId),
  );
  const newCount = current.records.filter(
    (record) => !shownIds.has(record.event.eventId),
  ).length;
  const pause = () => setPaused((value) => value ?? current);
  const duration =
    selected?.startMs !== null &&
    selected?.startMs !== undefined &&
    selected.observedThroughMs !== null
      ? selected.observedThroughMs - selected.startMs
      : null;
  return (
    <>
      <Paper sx={{ p: 5, minWidth: 0 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          sx={{ justifyContent: "space-between", gap: 3, mb: 4 }}
        >
          <Box>
            <Typography component="h2" variant="h2">
              Activity waterfall
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {props.attemptId} · elapsed time on this attempt’s monotonic clock
            </Typography>
          </Box>
          <Chip
            variant="outlined"
            label={
              paused ? "Viewing earlier activity" : "Following event updates"
            }
          />
        </Stack>
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 2, mb: 4 }}>
          <Button
            variant="outlined"
            onClick={() => (paused ? setPaused(null) : pause())}
          >
            {paused
              ? `Jump to latest${newCount ? ` · ${newCount} new` : ""}`
              : "Pause view"}
          </Button>
          <TextField
            select
            label="Activity height"
            value={rowHeight}
            onChange={(event) => setRowHeight(Number(event.target.value))}
            slotProps={{ select: { native: true } }}
            sx={{ minWidth: 148 }}
          >
            {tokens.layoutPx.trace.rowHeights.map((value, index) => (
              <option key={value} value={value}>
                {["Compact", "Comfortable", "Spacious"][index]}
              </option>
            ))}
          </TextField>
          <TextField
            select
            label="Time scale"
            value={zoom}
            onChange={(event) => {
              pause();
              setZoom(Number(event.target.value));
            }}
            slotProps={{ select: { native: true } }}
            sx={{ minWidth: 125 }}
          >
            <option value={0.75}>Fit more time</option>
            <option value={1}>Standard</option>
            <option value={2.5}>Zoom in</option>
          </TextField>
          <Button onClick={props.onRetry} disabled={props.refreshing}>
            Refresh events
          </Button>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {displayed.records.length} displayed / {current.records.length}{" "}
          recorded in this event page · latest displayed +
          {traceSeconds(displayed.maxMs)}
        </Typography>
        {props.refreshing && (
          <Typography
            variant="caption"
            role="status"
            sx={{ display: "block", mb: 3 }}
          >
            Refreshing recorded activity…
          </Typography>
        )}
        {displayed.page.meta.nextCursor && (
          <Alert severity="info" sx={{ mb: 3 }}>
            This event page is incomplete. Unseen boundaries are shown as
            unavailable; durations are not inferred.
          </Alert>
        )}
        {paused && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mb: 3 }}
            role="status"
          >
            View paused for inspection. {newCount} new records waiting.
          </Typography>
        )}
        {displayed.records.length ? (
          <RunTraceChart
            rows={displayed.rows}
            maxMs={displayed.maxMs}
            selectedId={selected?.id}
            rowHeight={rowHeight}
            zoom={zoom}
            initialTick={initialTick}
            following={!paused}
            onExplore={pause}
            onSelect={(id) => {
              pause();
              setSelectedId(id);
            }}
          />
        ) : (
          <Alert severity="info">
            No recorded events are available for this attempt.
          </Alert>
        )}
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mt: 3 }}
        >
          Solid end: recorded finish. Dashed end: no finish in this page. Open
          intervals stop at the latest recorded activity; they do not advance on
          the browser clock. Scroll vertically for activities and horizontally
          for time.
        </Typography>
      </Paper>
      {selected && (
        <Paper sx={{ p: 5 }}>
          <Stack
            direction="row"
            sx={{ justifyContent: "space-between", gap: 3, mb: 4 }}
          >
            <Typography component="h2" variant="h2">
              {selected.title}
            </Typography>
            <Chip variant="outlined" label={selected.state} />
          </Stack>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "repeat(3,1fr)" },
              gap: 4,
            }}
          >
            <Box>
              <Typography variant="caption" color="text.secondary">
                START OFFSET
              </Typography>
              <Typography variant="h2">
                {selected.startMs === null
                  ? "Not recorded"
                  : `+${traceSeconds(selected.startMs)}`}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                END OFFSET
              </Typography>
              <Typography variant="h2">
                {selected.endMs === null
                  ? "Not recorded"
                  : `+${traceSeconds(selected.endMs)}`}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                {selected.endMs === null ? "OBSERVED SO FAR" : "DURATION"}
              </Typography>
              <Typography variant="h2">
                {duration === null ? "Unavailable" : traceSeconds(duration)}
              </Typography>
            </Box>
          </Box>
          {selected.issue && (
            <Alert severity="info" sx={{ mt: 4 }}>
              {selected.issue}. A complete duration cannot be displayed.
            </Alert>
          )}
        </Paper>
      )}
      <RunEventLog
        {...props}
        detail={displayed.detail}
        page={displayed.page}
        trial={selected?.trial}
        pending={false}
        error={null}
        refreshing={props.refreshing && !paused}
      />
    </>
  );
}
