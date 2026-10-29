import { useState } from "react";
import {
  Avatar,
  Box,
  Button,
  InputAdornment,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import Search from "@mui/icons-material/Search";
import type {
  EmailGrantView,
  OrganizationPersonView,
} from "@featherlane/contracts";
import {
  AccessPageNavigation,
  AccessSection,
  type AccessPagination,
} from "./AccessSection";
import { PersonStatus } from "./PersonStatus";

type Props = {
  people: readonly OrganizationPersonView[];
  emails: readonly EmailGrantView[];
  ownerId: string;
  currentUserId: string;
  peoplePagination?: AccessPagination;
  emailPagination?: AccessPagination;
  onRemovePerson: (person: OrganizationPersonView) => void;
  onRemoveEmail: (email: EmailGrantView) => void;
  onProjectAccess: () => void;
};
const sourceLabels = {
  OWNER: "Organization owner",
  OPERATOR: "Added by operator",
  EMAIL: "Added by email",
  DOMAIN: "Domain rule",
};

export function OrganizationPeopleSection({
  people,
  emails,
  ownerId,
  currentUserId,
  peoplePagination,
  emailPagination,
  onRemovePerson,
  onRemoveEmail,
  onProjectAccess,
}: Props) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const members = people.filter((p) =>
    `${p.user.displayName} ${p.user.email}`.toLowerCase().includes(query),
  );
  const saved = emails.filter(
    (e) => e.waitingForSignIn && e.email.toLowerCase().includes(query),
  );
  return (
    <AccessSection
      title="Organization people"
      description="Saved emails are applied at the next sign-in. No invitation acceptance is needed."
    >
      <Box sx={{ px: 5, pb: 4 }}>
        <TextField
          label="Search loaded people or saved emails"
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          fullWidth
          sx={{ maxWidth: 420 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
      </Box>
      <TableContainer
        tabIndex={0}
        aria-label="Organization people; scroll horizontally if needed"
      >
        <Table aria-label="Organization people" sx={{ minWidth: 660 }}>
          <TableHead>
            <TableRow>
              <TableCell>Person or email</TableCell>
              <TableCell>Access</TableCell>
              <TableCell>Added through</TableCell>
              <TableCell>Projects</TableCell>
              <TableCell align="right">Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {members.map((person) => (
              <TableRow key={person.user.id}>
                <TableCell>
                  <Stack
                    direction="row"
                    spacing={3}
                    sx={{ alignItems: "center" }}
                  >
                    <Avatar
                      sx={{
                        width: 32,
                        height: 32,
                        fontSize: 12,
                        bgcolor: "action.hover",
                        color: "text.secondary",
                      }}
                    >
                      {person.user.displayName.slice(0, 1)}
                    </Avatar>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {person.user.displayName}
                        {person.user.id === currentUserId && (
                          <Typography
                            component="span"
                            variant="caption"
                            color="text.secondary"
                          >
                            {" "}
                            (you)
                          </Typography>
                        )}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ overflowWrap: "anywhere" }}
                      >
                        {person.user.email}
                      </Typography>
                    </Box>
                  </Stack>
                </TableCell>
                <TableCell>
                  <PersonStatus owner={person.user.id === ownerId} />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    {person.user.id === ownerId
                      ? "Organization owner"
                      : person.matchedDomain
                        ? `Domain · ${person.matchedDomain}`
                        : sourceLabels[person.source]}
                  </Typography>
                </TableCell>
                <TableCell>{person.projectCount}</TableCell>
                <TableCell align="right">
                  {person.user.id === ownerId ? (
                    <Typography variant="caption" color="text.secondary">
                      Owner
                    </Typography>
                  ) : (
                    <Button
                      color="secondary"
                      size="small"
                      aria-label={`Remove ${person.user.email}`}
                      onClick={() => onRemovePerson(person)}
                    >
                      Remove
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {saved.map((email) => (
              <TableRow key={email.id}>
                <TableCell>
                  <Stack
                    direction="row"
                    spacing={3}
                    sx={{ alignItems: "center" }}
                  >
                    <Avatar
                      sx={{
                        width: 32,
                        height: 32,
                        fontSize: 12,
                        bgcolor: "action.hover",
                        color: "text.secondary",
                      }}
                    >
                      @
                    </Avatar>
                    <Box>
                      <Typography
                        variant="body2"
                        sx={{ overflowWrap: "anywhere" }}
                      >
                        {email.email}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Saved for their next sign-in
                      </Typography>
                    </Box>
                  </Stack>
                </TableCell>
                <TableCell>
                  <PersonStatus waiting />
                </TableCell>
                <TableCell>Added by email</TableCell>
                <TableCell>None yet</TableCell>
                <TableCell align="right">
                  <Button
                    color="secondary"
                    size="small"
                    aria-label={`Remove ${email.email}`}
                    onClick={() => onRemoveEmail(email)}
                  >
                    Remove
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!members.length && !saved.length && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ py: 5 }}
                  >
                    {query
                      ? "No matches on the loaded pages."
                      : "No people or saved emails on this page."}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {peoplePagination && <AccessPageNavigation {...peoplePagination} />}
      {(emailPagination?.onPrevious || emailPagination?.onNext) && (
        <Box sx={{ px: 5 }}>
          <Typography variant="caption" color="text.secondary">
            Saved email pages
          </Typography>
          <AccessPageNavigation {...emailPagination} />
        </Box>
      )}
      <Box sx={{ p: 5, bgcolor: "background.default" }}>
        <Typography variant="body2" color="text.secondary">
          Joining the organization does not grant access to a project. Assign
          projects in{" "}
          <Button
            size="small"
            onClick={onProjectAccess}
            sx={{
              p: 0,
              minWidth: 0,
              minHeight: "auto",
              verticalAlign: "baseline",
            }}
          >
            Project access
          </Button>
          .
        </Typography>
      </Box>
    </AccessSection>
  );
}
