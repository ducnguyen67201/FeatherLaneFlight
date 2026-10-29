import { useEffect, type MouseEvent, type ReactNode } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Link,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import ArrowBack from "@mui/icons-material/ArrowBack";
import ExpandMore from "@mui/icons-material/ExpandMore";
import ScienceOutlined from "@mui/icons-material/ScienceOutlined";
import type { SuiteRevisionView } from "@featherlane/contracts";
import { PageLayout } from "../../layouts/PageLayout";
import { SyntheticSuitePlan } from "./SyntheticSuitePlan";

type Props = {
  editAction?: ReactNode;
  suite: SuiteRevisionView | undefined;
  projectName: string;
  catalogHref: string;
  loading: boolean;
  failed: boolean;
  onBack: (event: MouseEvent<HTMLAnchorElement>) => void;
  onRetry: () => void;
};
function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography component="dt" variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography
        component="dd"
        variant={mono ? "code" : "body2"}
        sx={{ m: 0, mt: 1, overflowWrap: "anywhere" }}
      >
        {value}
      </Typography>
    </Box>
  );
}
export function SuiteDetailPage({
  suite,
  editAction,
  projectName,
  catalogHref,
  loading,
  failed,
  onBack,
  onRetry,
}: Props) {
  useEffect(() => {
    document.getElementById("main")?.focus();
  }, [suite?.id]);
  return (
    <PageLayout
      breadcrumbs={[
        <Typography key="p" variant="body2" color="text.secondary">
          {projectName}
        </Typography>,
        <Link key="s" href={catalogHref} onClick={onBack}>
          Test suites
        </Link>,
        <Typography key="r" variant="body2">
          {suite ? `Revision ${suite.revision}` : "Published revision"}
        </Typography>,
      ]}
      title={suite?.title ?? "Suite revision"}
      description={
        suite
          ? `Published revision ${suite.revision} · immutable definition`
          : undefined
      }
      actions={
        <Stack direction="row" spacing={3}>
          {editAction}
          <Button
            component="a"
            href={catalogHref}
            startIcon={<ArrowBack />}
            onClick={onBack}
          >
            Back to catalog
          </Button>
        </Stack>
      }
    >
      {loading ? (
        <Paper variant="outlined" sx={{ p: 6 }}>
          <Typography role="status" variant="body2">
            Loading published revision…
          </Typography>
          <Skeleton height={120} />
        </Paper>
      ) : failed || !suite ? (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" onClick={onRetry}>
              Retry
            </Button>
          }
        >
          This exact revision is unavailable, or you no longer have access to
          it.
        </Alert>
      ) : (
        <Stack spacing={5}>
          <Alert severity="info" icon={<ScienceOutlined />}>
            This suite generates fake mission observations. It sends no movement
            commands and does not qualify PX4 or real flight behavior.
          </Alert>
          <SyntheticSuitePlan key={suite.id} suite={suite} />
          <Accordion
            disableGutters
            elevation={0}
            sx={{
              border: 1,
              borderColor: "divider",
              "&:before": { display: "none" },
            }}
          >
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography variant="body2">
                Details · evidence, qualification, and immutable inputs
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={6}>
                <Typography variant="body2" color="text.secondary">
                  {suite.description}
                </Typography>
                <Box
                  component="dl"
                  sx={{
                    m: 0,
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" },
                    gap: 4,
                  }}
                >
                  <Field label="Suite" value={suite.suiteId} mono />
                  <Field label="Revision ID" value={suite.id} mono />
                  <Field label="Suite SHA-256" value={suite.digest} mono />
                  <Field label="Published (UTC)" value={suite.createdAt} />
                  <Field
                    label="Integration profile"
                    value={`${suite.integrationProfileId} · revision ${suite.integrationProfileRevision}`}
                    mono
                  />
                  <Field
                    label="Profile SHA-256"
                    value={suite.integrationProfileDigest}
                    mono
                  />
                  <Field
                    label="Required evidence"
                    value={suite.evidencePolicy.requiredKinds.join(" · ")}
                  />
                  <Field
                    label="Maximum per artifact"
                    value={`${suite.evidencePolicy.maximumArtifactBytes.toLocaleString()} bytes`}
                  />
                  <Field
                    label="Contract / protocol / evaluator"
                    value={`${suite.versionRequirements.contractVersion} / ${suite.versionRequirements.protocolVersion} / ${suite.versionRequirements.evaluatorVersion}`}
                  />
                  <Field
                    label="Required capabilities"
                    value={suite.requiredCapabilities
                      .map((item) => `${item.key} v${item.version}`)
                      .join(" · ")}
                  />
                  <Field
                    label="Synthetic reference qualification"
                    value={`${suite.qualification.supportLevel} · ${suite.qualification.id}`}
                    mono
                  />
                  <Field
                    label="Reference report SHA-256"
                    value={suite.qualification.reportSha256}
                    mono
                  />
                  <Field
                    label="Verified (UTC)"
                    value={suite.qualification.verifiedAt}
                  />
                  <Field
                    label="Verifier"
                    value={`${suite.qualification.verifierId} v${suite.qualification.verifierVersion}`}
                  />
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {suite.qualification.limitation} Registration and runner
                  availability remain separate; publication does not establish
                  admission eligibility.
                </Typography>
                <Box>
                  <Typography component="h2" variant="h2" sx={{ mb: 3 }}>
                    When checks are inconclusive
                  </Typography>
                  <Stack spacing={3}>
                    {suite.checks.map((check) => (
                      <Typography key={check.id} variant="body2">
                        <strong>{check.title}:</strong> {check.inconclusiveWhen}
                      </Typography>
                    ))}
                  </Stack>
                </Box>
              </Stack>
            </AccordionDetails>
          </Accordion>
        </Stack>
      )}
    </PageLayout>
  );
}
