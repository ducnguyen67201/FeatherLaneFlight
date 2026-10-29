import { Chip } from "@mui/material";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import Schedule from "@mui/icons-material/Schedule";

export function PersonStatus({
  owner = false,
  waiting = false,
}: {
  owner?: boolean;
  waiting?: boolean;
}) {
  return (
    <Chip
      size="small"
      icon={waiting ? <Schedule /> : <CheckCircleOutlined />}
      label={waiting ? "Waiting for sign-in" : owner ? "Owner" : "Member"}
      sx={{
        color: waiting ? "info.main" : owner ? "primary.main" : "success.main",
        bgcolor: waiting
          ? "status.pending.background"
          : owner
            ? "action.selected"
            : "status.success.background",
        "& .MuiChip-icon": { color: "inherit" },
      }}
    />
  );
}
