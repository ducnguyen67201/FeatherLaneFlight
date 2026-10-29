import { zCheckDefinition } from "@featherlane/contracts/validators";
import type {
  CheckDefinition,
  SuiteDraftContent,
} from "@featherlane/contracts";

export class InvalidSuiteSuggestion extends Error {}

export function validateSuiteSuggestions(
  value: unknown,
  content: SuiteDraftContent,
): CheckDefinition[] {
  if (!Array.isArray(value) || value.length > 3)
    throw new InvalidSuiteSuggestion(
      "Suggestions can contain up to three supported criteria.",
    );
  const checks = value.map((item) => {
    const parsed = zCheckDefinition.safeParse(item);
    if (!parsed.success)
      throw new InvalidSuiteSuggestion(
        "Suggestion rejected: unsupported fields, check kind, unit or value. Your draft is unchanged.",
      );
    const original = content.checks?.find(
      (check) => check.id === parsed.data.id,
    );
    if (
      !original ||
      parsed.data.version !== 1 ||
      original.kind !== parsed.data.kind ||
      original.version !== parsed.data.version ||
      original.unit !== parsed.data.unit ||
      JSON.stringify(original.requiredEvidenceKinds) !==
        JSON.stringify(parsed.data.requiredEvidenceKinds)
    )
      throw new InvalidSuiteSuggestion(
        "Suggestion rejected: check identity, version and evidence requirements must match this draft.",
      );
    return parsed.data;
  });
  if (new Set(checks.map((check) => check.id)).size !== checks.length)
    throw new InvalidSuiteSuggestion(
      "Suggestion rejected: duplicate criterion identifiers.",
    );
  return checks;
}
