import {
  Button,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { OrganizationView } from "@featherlane/contracts";

type OrganizationSettingsProps = {
  organizations: readonly OrganizationView[];
  organizationId: string;
  onChange: (organizationId: string) => void;
  onMore?: () => void;
  loadingMore?: boolean;
};

export function OrganizationSettings({
  organizations,
  organizationId,
  onChange,
  onMore,
  loadingMore,
}: OrganizationSettingsProps) {
  return (
    <Paper variant="outlined" sx={{ p: 5 }}>
      <Stack spacing={4}>
        <Typography component="h2" variant="h2">
          Organization
        </Typography>
        <TextField
          select
          label="Organization"
          value={organizationId}
          onChange={(event) => onChange(event.target.value)}
          sx={{ width: "100%", maxWidth: 360 }}
        >
          {organizations.map((organization) => (
            <MenuItem
              key={organization.id}
              value={organization.id}
              sx={{ whiteSpace: "normal", overflowWrap: "anywhere" }}
            >
              {organization.name}
            </MenuItem>
          ))}
        </TextField>
        {onMore && (
          <Button
            variant="outlined"
            onClick={onMore}
            disabled={loadingMore}
            sx={{ alignSelf: "flex-start" }}
          >
            {loadingMore ? "Loading…" : "More organizations"}
          </Button>
        )}
        <Typography variant="body2" color="text.secondary">
          Projects below belong to this organization.
        </Typography>
      </Stack>
    </Paper>
  );
}
