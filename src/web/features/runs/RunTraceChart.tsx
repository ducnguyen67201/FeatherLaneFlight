import { useEffect, useRef } from "react";
import { Box, ButtonBase, Tooltip, Typography } from "@mui/material";
import { tokens } from "../../design/theme";
import { traceSeconds, traceTickMs, type TraceRow } from "./runTraceModel";

export function RunTraceChart({
  rows,
  maxMs,
  selectedId,
  rowHeight,
  zoom,
  initialTick,
  following,
  onExplore,
  onSelect,
}: {
  rows: TraceRow[];
  maxMs: number;
  selectedId: string | undefined;
  rowHeight: number;
  zoom: number;
  initialTick: number;
  following: boolean;
  onExplore: () => void;
  onSelect: (id: string) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const geometry = tokens.layoutPx.trace;
  // Keep the initial time scale stable as events arrive; bound very long views.
  const tick = Math.max(initialTick, traceTickMs(maxMs / 100));
  const spacing = geometry.tickSpacing * zoom;
  const width = Math.max(
    geometry.minPlotWidth,
    Math.ceil(maxMs / tick + 1) * spacing,
  );
  const position = (ms: number) => (ms / tick) * spacing;
  const tickCount = Math.floor(width / spacing);
  useEffect(() => {
    if (!following) return;
    const frame = window.requestAnimationFrame(() => {
      if (viewport.current)
        viewport.current.scrollLeft = Math.max(
          0,
          (maxMs / tick) * spacing -
            viewport.current.clientWidth +
            geometry.labelWidth +
            geometry.tickSpacing,
        );
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    following,
    maxMs,
    tick,
    spacing,
    geometry.labelWidth,
    geometry.tickSpacing,
  ]);
  const labelStyle = {
    position: "sticky",
    left: 0,
    zIndex: 2,
    bgcolor: "background.paper",
    borderRight: 1,
    borderColor: "divider",
    minWidth: 0,
    px: 3,
    py: 1,
  };
  return (
    <Box
      ref={viewport}
      role="region"
      aria-label="Trace waterfall; scroll vertically for activities and horizontally for time"
      tabIndex={0}
      onWheel={onExplore}
      onTouchMove={onExplore}
      onClickCapture={onExplore}
      onKeyDown={(event) => {
        if (
          [
            "ArrowLeft",
            "ArrowRight",
            "ArrowUp",
            "ArrowDown",
            "PageUp",
            "PageDown",
            "Home",
            "End",
          ].includes(event.key)
        )
          onExplore();
      }}
      sx={{
        height: geometry.viewportHeight,
        overflow: "auto",
        border: 1,
        borderColor: "divider",
        scrollbarGutter: "stable",
        "&:focus-visible": {
          outline: `${tokens.borderWidthPx.focus}px solid ${tokens.color.focus.ring}`,
          outlineOffset: -tokens.borderWidthPx.focus,
        },
      }}
    >
      <Box sx={{ width: geometry.labelWidth + width }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: `${geometry.labelWidth}px ${width}px`,
            height: tokens.component.minTouchTargetPx,
            position: "sticky",
            top: 0,
            zIndex: 4,
            bgcolor: "background.paper",
            borderBottom: 1,
            borderColor: "divider",
          }}
        >
          <Typography
            variant="caption"
            sx={{
              ...labelStyle,
              display: "flex",
              alignItems: "center",
              zIndex: 5,
            }}
          >
            ACTIVITY / TRIAL
          </Typography>
          <Box sx={{ position: "relative" }}>
            {Array.from({ length: tickCount + 1 }, (_, index) => (
              <Typography
                key={index}
                variant="caption"
                color="text.secondary"
                sx={{
                  position: "absolute",
                  left: index * spacing + tokens.spacing.unitPx,
                  top: tokens.spacing.unitPx * 3,
                  whiteSpace: "nowrap",
                }}
              >
                {traceSeconds(index * tick)}
              </Typography>
            ))}
          </Box>
        </Box>
        {rows.map((row) => {
          const selected = selectedId === row.id;
          const duration =
            row.startMs !== null && row.observedThroughMs !== null
              ? Math.max(0, row.observedThroughMs - row.startMs)
              : null;
          const closed = row.endMs !== null;
          const color = row.depth
            ? tokens.color.status.pending.foreground
            : tokens.color.text.secondary;
          const barWidth =
            duration === null ? 0 : Math.max(1, position(duration));
          const description =
            row.issue ??
            `${closed ? "Duration" : "Observed so far"}: ${traceSeconds(duration ?? 0)}. ${row.state}.`;
          return (
            <Tooltip
              key={row.id}
              describeChild
              arrow
              title={`${row.title}. ${row.startMs === null ? "Start unavailable" : `Start +${traceSeconds(row.startMs)}`}. ${description}`}
            >
              <ButtonBase
                aria-pressed={selected}
                aria-label={`${row.title}. ${description}`}
                onClick={() => onSelect(row.id)}
                sx={{
                  display: "grid",
                  gridTemplateColumns: `${geometry.labelWidth}px ${width}px`,
                  width: "100%",
                  textAlign: "left",
                  minHeight: rowHeight,
                  borderBottom: 1,
                  borderColor: "divider",
                  "&.Mui-focusVisible": {
                    outline: `${tokens.borderWidthPx.focus}px solid ${tokens.color.focus.ring}`,
                    outlineOffset: -tokens.borderWidthPx.focus,
                  },
                }}
              >
                <Box
                  sx={{
                    ...labelStyle,
                    alignSelf: "stretch",
                    pl: 3 + row.depth * 3,
                    bgcolor: selected ? "action.selected" : "background.paper",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                  }}
                >
                  <Typography
                    variant="body2"
                    noWrap
                    color={selected ? "primary" : "text.primary"}
                  >
                    {row.depth ? "↳ " : ""}
                    {row.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {row.startMs === null
                      ? row.state
                      : `Starts +${traceSeconds(row.startMs)} · ${row.state}`}
                  </Typography>
                </Box>
                <Box
                  sx={{
                    position: "relative",
                    height: rowHeight,
                    backgroundImage: `linear-gradient(to right, ${tokens.color.border.subtle} ${tokens.borderWidthPx.default}px, transparent ${tokens.borderWidthPx.default}px)`,
                    backgroundSize: `${spacing}px 100%`,
                  }}
                >
                  {duration !== null && row.startMs !== null ? (
                    <>
                      <Box
                        aria-hidden
                        sx={{
                          position: "absolute",
                          left: position(row.startMs),
                          top: (rowHeight - geometry.barHeight) / 2,
                          width: barWidth,
                          height: geometry.barHeight,
                          bgcolor: color,
                          opacity: closed ? 0.7 : 0.3,
                        }}
                      />
                      {!closed && (
                        <Box
                          aria-hidden
                          sx={{
                            position: "absolute",
                            left: position(row.startMs) + barWidth,
                            top: (rowHeight - geometry.barHeight) / 2 - 2,
                            height: geometry.barHeight + 4,
                            borderLeft: "2px dashed",
                            borderColor: color,
                          }}
                        />
                      )}
                      <Typography
                        variant="caption"
                        sx={{
                          position: "absolute",
                          top:
                            (rowHeight -
                              tokens.typography.variant.caption.lineHeightPx) /
                            2,
                          left:
                            position(row.startMs) +
                            barWidth +
                            tokens.spacing.unitPx * 2,
                          whiteSpace: "nowrap",
                          bgcolor: "background.paper",
                          px: 1,
                        }}
                      >
                        {traceSeconds(duration)}
                        {closed ? "" : " · end not received →"}
                      </Typography>
                    </>
                  ) : (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", p: 3 }}
                    >
                      {row.issue ?? "No interval recorded"}
                    </Typography>
                  )}
                </Box>
              </ButtonBase>
            </Tooltip>
          );
        })}
      </Box>
    </Box>
  );
}
