import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Link,
  Paper,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import Add from "@mui/icons-material/Add";
import LockOutlined from "@mui/icons-material/LockOutlined";
import PeopleOutlined from "@mui/icons-material/PeopleOutlined";
import type {
  ChangeProjectPeopleRequest,
  DomainRuleView,
  EmailGrantView,
  JoinExclusionView,
  OrganizationAccessView,
  OrganizationPersonView,
  ProjectPersonView,
  ProjectView,
  SaveDomainRuleRequest,
  SaveEmailGrantRequest,
} from "@featherlane/contracts";
import { PageLayout } from "../../layouts/PageLayout";
import type { AccessPagination } from "./AccessSection";
import { AdmissionDialog } from "./AdmissionDialog";
import {
  AutomaticJoiningSection,
  RemovedPeopleSection,
} from "./AutomaticJoiningSection";
import { OrganizationPeopleSection } from "./OrganizationPeopleSection";
import { ProjectPeopleSection } from "./ProjectPeopleSection";
import { RemoveAccessDialog, type AccessRemoval } from "./RemoveAccessDialog";

export type PeopleAccessPageProps = {
  currentUserId: string;
  organizationId: string;
  accessRevoked: boolean;
  access: OrganizationAccessView | null;
  loading: boolean;
  error: boolean;
  people: readonly OrganizationPersonView[];
  emails: readonly EmailGrantView[];
  domains: readonly DomainRuleView[];
  exclusions: readonly JoinExclusionView[];
  projects: readonly ProjectView[];
  project: ProjectView | null;
  projectPeople: readonly ProjectPersonView[];
  pagination?: {
    people?: AccessPagination;
    emails?: AccessPagination;
    domains?: AccessPagination;
    exclusions?: AccessPagination;
    projects?: AccessPagination;
    projectPeople?: AccessPagination;
  };
  onRetry: () => void;
  onSelectProject: (id: string) => void;
  onSaveEmail: (body: SaveEmailGrantRequest) => Promise<void>;
  onSaveDomain: (body: SaveDomainRuleRequest) => Promise<void>;
  onRemovePerson: (userId: string) => Promise<void>;
  onRemoveEmail: (ruleId: string) => Promise<void>;
  onRemoveDomain: (ruleId: string) => Promise<void>;
  onAllowJoining: (exclusionId: string) => Promise<void>;
  onChangeProjectPeople: (
    projectId: string,
    body: ChangeProjectPeopleRequest,
  ) => Promise<void>;
};

// Temporary read errors keep local input; identity/org/access changes retire it.
export function PeopleAccessPage(props: PeopleAccessPageProps) {
  return (
    <PeopleAccessContent
      key={`${props.currentUserId}:${props.organizationId}:${props.accessRevoked}`}
      {...props}
    />
  );
}

function PeopleAccessContent(props: PeopleAccessPageProps) {
  const { access, currentUserId, loading, error, pagination } = props;
  const [tab, setTab] = useState(0);
  const [admission, setAdmission] = useState<{
    kind: "email" | "domain";
    value: string;
  } | null>(null);
  const [projectDraft, setProjectDraft] = useState<{
    projectId: string;
    values: Record<string, boolean>;
  } | null>(null);
  const [removal, setRemoval] = useState<AccessRemoval | null>(null);
  const [notice, setNotice] = useState("");
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (notice) feedback.current?.focus();
  }, [notice]);
  const ready = !loading && !error && access !== null;
  const owner = ready && access.owner?.id === currentUserId;
  function add(kind: "email" | "domain") {
    setNotice("");
    setAdmission({ kind, value: "" });
  }
  function remove(target: AccessRemoval) {
    setNotice("");
    setRemoval(target);
  }
  async function confirmRemove(target: AccessRemoval) {
    if (target.kind === "person")
      await props.onRemovePerson(target.person.user.id);
    else if (target.kind === "email")
      await props.onRemoveEmail(target.email.id);
    else if (target.kind === "domain")
      await props.onRemoveDomain(target.domain.id);
    else await props.onAllowJoining(target.exclusion.id);
  }
  return (
    <PageLayout
      breadcrumbs={[
        <Link
          key="settings"
          href="/settings"
          variant="body2"
          color="text.secondary"
          underline="hover"
        >
          Settings
        </Link>,
        <Typography key="org" variant="body2">
          {access?.organization.name ?? "Organization"}
        </Typography>,
      ]}
      title="People & access"
      description="Manage who can join your organization and which projects they can access."
      actions={
        owner ? (
          <Button
            startIcon={<Add />}
            variant="contained"
            onClick={() => add("email")}
          >
            Add by email
          </Button>
        ) : undefined
      }
    >
      {loading ? (
        <Paper
          variant="outlined"
          sx={{ p: 5 }}
          aria-label="Loading access settings"
          aria-busy="true"
        >
          <Skeleton width="40%" height={35} />
          <Skeleton height={65} />
          <Skeleton height={65} />
          <Skeleton height={65} />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
            Loading access settings…
          </Typography>
        </Paper>
      ) : error || !access ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" onClick={props.onRetry}>
              Retry
            </Button>
          }
        >
          Access settings could not be loaded. Retry to view and manage access.
          {(admission || projectDraft) &&
            " Your open draft is kept while access is checked again."}
        </Alert>
      ) : (
        <>
          <Paper variant="outlined" sx={{ px: 5, py: 4, mb: 6 }}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={3}
              sx={{
                justifyContent: "space-between",
                alignItems: { sm: "center" },
              }}
            >
              <Stack direction="row" spacing={3} sx={{ alignItems: "center" }}>
                <PeopleOutlined color="primary" />
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {access.organization.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {owner
                      ? `${access.memberCount} ${access.memberCount === 1 ? "member" : "members"} · ${access.savedEmailCount} saved ${access.savedEmailCount === 1 ? "email" : "emails"}`
                      : "Organization access"}
                  </Typography>
                </Box>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                Owner:{" "}
                <Box component="span" sx={{ color: "text.primary" }}>
                  {access.owner?.displayName ?? "Not configured"}
                </Box>
              </Typography>
            </Stack>
          </Paper>
          {!access.owner ? (
            <Alert severity="error">
              The organization owner has not been configured. Ask an operator to
              assign a specific existing member.
            </Alert>
          ) : !owner ? (
            <Box
              sx={{
                p: 6,
                py: 12,
                border: 1,
                borderColor: "divider",
                borderRadius: 1,
                textAlign: "center",
              }}
            >
              <LockOutlined color="primary" sx={{ fontSize: 32, mb: 3 }} />
              <Typography variant="h2" component="h2">
                Only the owner can manage access
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 2, maxWidth: 500, mx: "auto" }}
              >
                Ask {access.owner.displayName} to add people, change automatic
                join rules or assign project access. Only the owner can create
                projects.
              </Typography>
            </Box>
          ) : (
            <>
              <Tabs
                value={tab}
                onChange={(_, value: number) => {
                  setTab(value);
                  setNotice("");
                }}
                aria-label="Access settings"
                sx={{ borderBottom: 1, borderColor: "divider", mb: 6 }}
                variant="scrollable"
                allowScrollButtonsMobile
              >
                <Tab
                  label="People"
                  id="people-tab-0"
                  aria-controls="people-panel-0"
                />
                <Tab
                  label="Automatic joining"
                  id="people-tab-1"
                  aria-controls="people-panel-1"
                />
                <Tab
                  label="Project access"
                  id="people-tab-2"
                  aria-controls="people-panel-2"
                />
              </Tabs>
              {notice && (
                <Box ref={feedback} tabIndex={-1} sx={{ mb: 5 }}>
                  <Alert severity="success" onClose={() => setNotice("")}>
                    {notice}
                  </Alert>
                </Box>
              )}
              <Box
                role="tabpanel"
                id="people-panel-0"
                aria-labelledby="people-tab-0"
                hidden={tab !== 0}
              >
                <Stack spacing={6}>
                  <OrganizationPeopleSection
                    people={props.people}
                    emails={props.emails}
                    ownerId={access.owner.id}
                    currentUserId={currentUserId}
                    peoplePagination={pagination?.people}
                    emailPagination={pagination?.emails}
                    onRemovePerson={(person) =>
                      remove({ kind: "person", person })
                    }
                    onRemoveEmail={(email) => remove({ kind: "email", email })}
                    onProjectAccess={() => setTab(2)}
                  />
                  <RemovedPeopleSection
                    exclusions={props.exclusions}
                    pagination={pagination?.exclusions}
                    onRestore={(exclusion) =>
                      remove({ kind: "exclusion", exclusion })
                    }
                  />
                </Stack>
              </Box>
              <Box
                role="tabpanel"
                id="people-panel-1"
                aria-labelledby="people-tab-1"
                hidden={tab !== 1}
              >
                <AutomaticJoiningSection
                  domains={props.domains}
                  pagination={pagination?.domains}
                  onAdd={() => add("domain")}
                  onRemove={(domain) => remove({ kind: "domain", domain })}
                />
              </Box>
              <Box
                role="tabpanel"
                id="people-panel-2"
                aria-labelledby="people-tab-2"
                hidden={tab !== 2}
              >
                <ProjectPeopleSection
                  key={props.project?.id ?? "no-project"}
                  projects={props.projects}
                  project={props.project}
                  people={props.projectPeople}
                  ownerId={access.owner.id}
                  draft={
                    projectDraft && projectDraft.projectId === props.project?.id
                      ? projectDraft.values
                      : {}
                  }
                  onDraftChange={(values) =>
                    setProjectDraft(
                      props.project && Object.keys(values).length
                        ? { projectId: props.project.id, values }
                        : null,
                    )
                  }
                  projectPagination={pagination?.projects}
                  peoplePagination={pagination?.projectPeople}
                  onSelectProject={props.onSelectProject}
                  onSave={props.onChangeProjectPeople}
                  onSaved={setNotice}
                />
              </Box>
              {admission && (
                <AdmissionDialog
                  kind={admission.kind}
                  value={admission.value}
                  onValueChange={(value) =>
                    setAdmission({ kind: admission.kind, value })
                  }
                  organizationName={access.organization.name}
                  onClose={() => setAdmission(null)}
                  onSaveEmail={props.onSaveEmail}
                  onSaveDomain={props.onSaveDomain}
                  onSaved={setNotice}
                />
              )}
              {removal && (
                <RemoveAccessDialog
                  target={removal}
                  onClose={() => setRemoval(null)}
                  onConfirm={confirmRemove}
                  onRemoved={setNotice}
                />
              )}
            </>
          )}
        </>
      )}
    </PageLayout>
  );
}
