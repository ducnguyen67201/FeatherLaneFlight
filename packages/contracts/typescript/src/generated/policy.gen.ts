// Generated from OpenAPI by scripts/contracts.mjs. Do not edit.
import * as validators from "./zod.gen";
export const contractManifest = {
  contractVersion: "0.1.0",
  protocolVersion: "1",
  schemaDigest:
    "be3e45abb9f69ef2f7a43d2c317c54572c556cde72557c2d51656b3d77215785",
} as const;
export const operationPolicies = {
  getContractMeta: {
    method: "GET",
    path: "/api/v1/meta",
    responses: {
      "200": validators.zContractMetaEnvelope,
      "400": validators.zErrorEnvelope,
      "401": validators.zErrorEnvelope,
      "403": validators.zErrorEnvelope,
      "404": validators.zErrorEnvelope,
      "422": validators.zErrorEnvelope,
      "500": validators.zErrorEnvelope,
      "501": validators.zErrorEnvelope,
    },
  },
  listRuns: {
    method: "GET",
    path: "/api/v1/projects/{projectId}/runs",
    responses: {
      "200": validators.zRunListEnvelope,
      "400": validators.zErrorEnvelope,
      "401": validators.zErrorEnvelope,
      "403": validators.zErrorEnvelope,
      "404": validators.zErrorEnvelope,
      "422": validators.zErrorEnvelope,
      "500": validators.zErrorEnvelope,
      "501": validators.zErrorEnvelope,
    },
  },
} as const;
