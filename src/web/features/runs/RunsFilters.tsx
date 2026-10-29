import { Button, MenuItem, Stack, TextField } from "@mui/material";
import { evaluation, execution } from "../../design/statusPresentation";
import type { RunsListContext } from "./RunsPage";
type Filters = Pick<
  RunsListContext,
  "search" | "executionState" | "evaluationOutcome"
>;
export function RunsFilters({
  search,
  executionState,
  evaluationOutcome,
  onChange,
  onClear,
}: Filters & {
  onChange: (value: Partial<Filters>) => void;
  onClear: () => void;
}) {
  const selectStyle = { minWidth: { xs: "100%", sm: 180 }, flex: 1 };
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={4}
      useFlexGap
      sx={{ flexWrap: "wrap" }}
    >
      <TextField
        label="Find run, build or suite"
        size="small"
        value={search}
        slotProps={{ htmlInput: { maxLength: 128 } }}
        onChange={(e) => {
          onChange({ search: e.target.value });
        }}
        sx={{ flex: 2, minWidth: { sm: 220 } }}
      />
      <TextField
        select
        label="Execution"
        size="small"
        value={executionState ?? ""}
        sx={selectStyle}
        onChange={(e) => {
          const key = Object.keys(execution).find(
            (key): key is keyof typeof execution => key === e.target.value,
          );
          onChange({ executionState: key ?? null });
        }}
      >
        <MenuItem value="">All execution states</MenuItem>
        {Object.entries(execution).map(([key, value]) => (
          <MenuItem key={key} value={key}>
            {value.label}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        label="Test outcome"
        size="small"
        value={evaluationOutcome ?? ""}
        sx={selectStyle}
        onChange={(e) => {
          const key = Object.keys(evaluation).find(
            (key): key is keyof typeof evaluation => key === e.target.value,
          );
          onChange({ evaluationOutcome: key ?? null });
        }}
      >
        <MenuItem value="">All outcomes</MenuItem>
        {Object.entries(evaluation).map(([key, value]) => (
          <MenuItem key={key} value={key}>
            {value.label}
          </MenuItem>
        ))}
      </TextField>
      <Button color="secondary" onClick={onClear}>
        Clear filters
      </Button>
    </Stack>
  );
}
