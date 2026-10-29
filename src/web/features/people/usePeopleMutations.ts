import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  contractManifest,
  saveEmailGrant,
  saveDomainRule,
  removeEmailGrant,
  removeDomainRule,
  removeOrganizationPerson,
  allowAutomaticJoining,
  changeProjectPeople,
  type ChangeProjectPeopleRequest,
  type SaveEmailGrantRequest,
  type SaveDomainRuleRequest,
  type createValidatedClient,
} from "@featherlane/contracts";

type Props = {
  organizationId: string;
  userId: string;
  csrfToken: string;
  client: ReturnType<typeof createValidatedClient>;
  cacheScope: readonly unknown[];
  scope: readonly unknown[];
  captureAccess: () => () => boolean;
  onFailure: (error: unknown) => Promise<void>;
};

export function usePeopleMutations({
  organizationId,
  userId,
  csrfToken,
  client,
  cacheScope,
  scope,
  captureAccess,
  onFailure,
}: Props) {
  const queries = useQueryClient();
  const headers = {
    "x-flf-contract-version": contractManifest.contractVersion,
    "x-csrf-token": csrfToken,
  };
  const path = { orgId: organizationId };
  const email = useMutation({ mutationFn: saveEmailGrant, retry: false });
  const domain = useMutation({ mutationFn: saveDomainRule, retry: false });
  const deleteEmail = useMutation({
    mutationFn: removeEmailGrant,
    retry: false,
  });
  const deleteDomain = useMutation({
    mutationFn: removeDomainRule,
    retry: false,
  });
  const removePerson = useMutation({
    mutationFn: removeOrganizationPerson,
    retry: false,
  });
  const allowJoining = useMutation({
    mutationFn: allowAutomaticJoining,
    retry: false,
  });
  const projectPeople = useMutation({
    mutationFn: changeProjectPeople,
    retry: false,
  });

  async function run(operation: () => Promise<unknown>): Promise<void> {
    const current = captureAccess();
    if (!current()) throw new DOMException("Access has changed.", "AbortError");
    try {
      await operation();
      if (!current())
        throw new DOMException("Access has changed.", "AbortError");
      await Promise.all([
        queries.invalidateQueries({ queryKey: scope }, { throwOnError: true }),
        queries.invalidateQueries(
          { queryKey: [...cacheScope, userId, "project-access"] },
          { throwOnError: true },
        ),
      ]);
      if (!current())
        throw new DOMException("Access has changed.", "AbortError");
    } catch (error) {
      if (current()) await onFailure(error);
      throw error;
    }
  }
  return {
    saveEmail: (body: SaveEmailGrantRequest) =>
      run(() => email.mutateAsync({ client, headers, path, body })),
    saveDomain: (body: SaveDomainRuleRequest) =>
      run(() => domain.mutateAsync({ client, headers, path, body })),
    removeEmail: (ruleId: string) =>
      run(() =>
        deleteEmail.mutateAsync({ client, headers, path: { ...path, ruleId } }),
      ),
    removeDomain: (ruleId: string) =>
      run(() =>
        deleteDomain.mutateAsync({
          client,
          headers,
          path: { ...path, ruleId },
        }),
      ),
    removePerson: (userId: string) =>
      run(() =>
        removePerson.mutateAsync({
          client,
          headers,
          path: { ...path, userId },
        }),
      ),
    allowJoining: (ruleId: string) =>
      run(() =>
        allowJoining.mutateAsync({
          client,
          headers,
          path: { ...path, ruleId },
        }),
      ),
    changeProjectPeople: (
      projectId: string,
      body: ChangeProjectPeopleRequest,
    ) =>
      run(() =>
        projectPeople.mutateAsync({
          client,
          headers,
          path: { ...path, projectId },
          body,
        }),
      ),
  };
}
