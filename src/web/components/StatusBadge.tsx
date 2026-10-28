import Chip from "@mui/material/Chip";
import type { Presentation } from "../design/statusPresentation";

export function StatusBadge({ value }: { value: Presentation }) {
  const Icon = value.icon;
  return (
    <Chip
      size="small"
      icon={<Icon fontSize="small" />}
      label={value.label}
      sx={(theme) => ({
        color: theme.vars.palette.status[value.role].foreground,
        bgcolor: theme.vars.palette.status[value.role].background,
        "& .MuiChip-icon": { color: "inherit", ml: 2 },
      })}
    />
  );
}
