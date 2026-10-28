import { useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import Close from "@mui/icons-material/Close";
import CompareArrows from "@mui/icons-material/CompareArrows";
import FlightOutlined from "@mui/icons-material/FlightOutlined";
import MenuIcon from "@mui/icons-material/Menu";
import PlayArrowOutlined from "@mui/icons-material/PlayArrowOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import StorageOutlined from "@mui/icons-material/StorageOutlined";
import ViewListOutlined from "@mui/icons-material/ViewListOutlined";
import { tokens } from "../design/theme";

export const navigation = [
  { label: "Runs", path: "/runs", icon: PlayArrowOutlined },
  { label: "Compare", path: "/compare", icon: CompareArrows },
  { label: "Test suites", path: "/suites", icon: ViewListOutlined },
  { label: "Runners", path: "/runners", icon: StorageOutlined },
  { label: "Settings", path: "/settings", icon: SettingsOutlined },
];

type AppShellProps = {
  activePath: string;
  projectSelector: ReactNode;
  userMenu: ReactNode;
  children: ReactNode;
};

export function AppShell({
  activePath,
  projectSelector,
  userMenu,
  children,
}: AppShellProps) {
  const theme = useTheme();
  const narrow = useMediaQuery(theme.breakpoints.down("md"));
  const [drawer, setDrawer] = useState(false);
  const layout = tokens.layoutPx;
  const sidebar = (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
      <Stack
        direction="row"
        spacing={3}
        sx={{
          alignItems: "center",
          px: 5,
          minHeight: layout.headerHeight.desktop,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        {!narrow && <FlightOutlined sx={{ color: "primary.main" }} />}
        <Box sx={{ minWidth: 0, flex: 1, overflowWrap: "anywhere" }}>
          <Typography variant="body1" sx={{ fontWeight: 700 }}>
            FeatherLane
            <Typography
              component="span"
              color="primary"
              sx={{ fontWeight: 700 }}
            >
              Flight
            </Typography>
          </Typography>
          <Typography variant="caption" color="text.secondary">
            SIMULATION WORKSPACE
          </Typography>
        </Box>
        {narrow && (
          <IconButton
            aria-label="Close navigation"
            onClick={() => setDrawer(false)}
          >
            <Close />
          </IconButton>
        )}
      </Stack>
      <Box sx={{ px: 4, pt: 6, pb: 4, minWidth: 0 }}>{projectSelector}</Box>
      <Box component="nav" aria-label="Primary navigation" sx={{ px: 3 }}>
        <List disablePadding>
          {navigation.map(({ label, path, icon: Icon }) => (
            <ListItemButton
              key={path}
              component="a"
              href={path}
              selected={activePath === path}
              aria-current={activePath === path ? "page" : undefined}
              onClick={() => setDrawer(false)}
              sx={{ mb: 1 }}
            >
              <ListItemIcon
                sx={{
                  minWidth:
                    tokens.component.minTouchTargetPx -
                    tokens.spacing.unitPx * 2,
                  color: "inherit",
                }}
              >
                <Icon fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary={label}
                slotProps={{
                  primary: {
                    variant: "body2",
                    sx: {
                      fontWeight:
                        activePath === path
                          ? tokens.typography.weight.semibold
                          : tokens.typography.weight.regular,
                    },
                  },
                }}
              />
            </ListItemButton>
          ))}
        </List>
      </Box>
    </Box>
  );

  return (
    <>
      <Link className="skip-link" href="#main">
        Skip to content
      </Link>
      {narrow ? (
        <Drawer
          open={drawer}
          onClose={() => setDrawer(false)}
          slotProps={{
            paper: { sx: { width: layout.sidebarWidth, maxWidth: "100vw" } },
          }}
        >
          {sidebar}
        </Drawer>
      ) : (
        <Box
          component="aside"
          sx={{
            position: "fixed",
            inset: "0 auto 0 0",
            width: layout.sidebarWidth,
            borderRight: 1,
            borderColor: "divider",
            bgcolor: "background.paper",
            overflowY: "auto",
          }}
        >
          {sidebar}
        </Box>
      )}
      <Box sx={{ ml: narrow ? 0 : `${layout.sidebarWidth}px`, minWidth: 0 }}>
        <Box
          component="header"
          sx={{
            minHeight: narrow
              ? layout.headerHeight.narrow
              : layout.headerHeight.desktop,
            px: narrow ? 4 : 6,
            py: 1,
            borderBottom: 1,
            borderColor: "divider",
            bgcolor: "background.paper",
            display: "flex",
            alignItems: "center",
            gap: 3,
            flexWrap: "wrap",
          }}
        >
          {narrow && (
            <IconButton
              aria-label="Open navigation"
              aria-expanded={drawer}
              onClick={() => setDrawer(true)}
              sx={{ ml: -2 }}
            >
              <MenuIcon />
            </IconButton>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
            {navigation.find((item) => item.path === activePath)?.label ??
              "Workspace"}
          </Typography>
          {userMenu}
        </Box>
        <Box
          component="main"
          id="main"
          tabIndex={-1}
          sx={{
            p: {
              xs: `${layout.pagePadding.narrow}px`,
              md: `${layout.pagePadding.desktop}px`,
            },
            minWidth: 0,
          }}
        >
          {children}
        </Box>
      </Box>
    </>
  );
}
