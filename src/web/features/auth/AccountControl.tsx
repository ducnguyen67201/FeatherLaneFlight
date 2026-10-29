import { Box, Button, Stack, Typography } from "@mui/material";
import LogoutOutlined from "@mui/icons-material/LogoutOutlined";
import type { SessionUser } from "@featherlane/contracts";
import { tokens } from "../../design/theme";

export function AccountControl({
  user,
  onSignOut,
}: {
  user: SessionUser;
  onSignOut: () => Promise<void>;
}) {
  return (
    <Stack
      direction="row"
      spacing={3}
      sx={{
        alignItems: "center",
        minWidth: 0,
        maxWidth: "100%",
        width: { xs: "100%", sm: "auto" },
      }}
    >
      <Box
        sx={{ minWidth: 0, flex: 1, maxWidth: tokens.layoutPx.sidebarWidth }}
      >
        <Typography
          variant="body2"
          title={user.displayName}
          sx={{
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {user.displayName}
        </Typography>
        <Typography
          component="div"
          variant="caption"
          color="text.secondary"
          title={user.email}
          sx={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {user.email}
        </Typography>
      </Box>
      <Button
        variant="outlined"
        startIcon={<LogoutOutlined />}
        onClick={() => {
          void onSignOut();
        }}
        sx={{ flexShrink: 0 }}
      >
        Sign out
      </Button>
    </Stack>
  );
}
