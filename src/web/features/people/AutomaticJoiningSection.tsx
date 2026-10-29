import {
  Box,
  Button,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import Add from "@mui/icons-material/Add";
import DomainOutlined from "@mui/icons-material/DomainOutlined";
import LockOutlined from "@mui/icons-material/LockOutlined";
import type { DomainRuleView, JoinExclusionView } from "@featherlane/contracts";
import {
  AccessPageNavigation,
  AccessSection,
  type AccessPagination,
} from "./AccessSection";

export function AutomaticJoiningSection({
  domains,
  pagination,
  onAdd,
  onRemove,
}: {
  domains: readonly DomainRuleView[];
  pagination?: AccessPagination;
  onAdd: () => void;
  onRemove: (rule: DomainRuleView) => void;
}) {
  return (
    <Stack spacing={6}>
      <AccessSection
        title="Email domain rules"
        description="Let people join automatically when they sign in with a matching verified email."
        action={
          <Button variant="outlined" startIcon={<Add />} onClick={onAdd}>
            Add domain
          </Button>
        }
      >
        {domains.length ? (
          <TableContainer
            tabIndex={0}
            aria-label="Domain rules; scroll horizontally if needed"
          >
            <Table aria-label="Automatic domain rules" sx={{ minWidth: 570 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Domain</TableCell>
                  <TableCell>Matches</TableCell>
                  <TableCell>Project access</TableCell>
                  <TableCell align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {domains.map((domain) => (
                  <TableRow key={domain.id}>
                    <TableCell>
                      <Stack
                        direction="row"
                        spacing={3}
                        sx={{ alignItems: "center" }}
                      >
                        <DomainOutlined color="primary" fontSize="small" />
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {domain.domain}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        name@{domain.domain}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Exact domain only
                      </Typography>
                    </TableCell>
                    <TableCell>Assigned separately</TableCell>
                    <TableCell align="right">
                      <Button
                        color="secondary"
                        size="small"
                        aria-label={`Remove ${domain.domain}`}
                        onClick={() => onRemove(domain)}
                      >
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Box sx={{ px: 5, pb: 6 }}>
            <Typography variant="body2" color="text.secondary">
              No domain rules on this page. Add your company’s email domain to
              let your team join automatically.
            </Typography>
          </Box>
        )}
        {pagination && <AccessPageNavigation {...pagination} />}
        <Box sx={{ p: 5, bgcolor: "background.default" }}>
          <Typography variant="body2" color="text.secondary">
            Rules apply on the next sign-in, including first-time accounts.
            Subdomains do not match automatically.
          </Typography>
        </Box>
      </AccessSection>
      <Box
        sx={{
          p: 5,
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          display: "flex",
          gap: 3,
        }}
      >
        <LockOutlined sx={{ color: "text.secondary", mt: 0.5 }} />
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Organization access first. Project access stays explicit.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Automatic joining creates organization membership only. Removed
            people stay excluded until you allow automatic joining again.
          </Typography>
        </Box>
      </Box>
    </Stack>
  );
}

export function RemovedPeopleSection({
  exclusions,
  pagination,
  onRestore,
}: {
  exclusions: readonly JoinExclusionView[];
  pagination?: AccessPagination;
  onRestore: (exclusion: JoinExclusionView) => void;
}) {
  if (
    !exclusions.length &&
    !pagination?.onPrevious &&
    !pagination?.onNext &&
    !pagination?.pending
  )
    return null;
  return (
    <AccessSection
      title="Removed people"
      description="These emails cannot rejoin automatically, even if a domain rule matches."
    >
      <Stack divider={<Box sx={{ borderBottom: 1, borderColor: "divider" }} />}>
        {exclusions.map((exclusion) => (
          <Stack
            key={exclusion.id}
            direction={{ xs: "column", sm: "row" }}
            spacing={3}
            sx={{
              px: 5,
              py: 3,
              alignItems: { sm: "center" },
              justifyContent: "space-between",
            }}
          >
            <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
              {exclusion.email}
            </Typography>
            <Button color="secondary" onClick={() => onRestore(exclusion)}>
              Allow automatic joining
            </Button>
          </Stack>
        ))}
      </Stack>
      {pagination && <AccessPageNavigation {...pagination} />}
    </AccessSection>
  );
}
