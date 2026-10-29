"""Canonical owner administration routes; auth/CSRF use the real identity seams."""

from typing import Annotated

from fastapi import APIRouter, Depends, Header, Path, Query, Request
from featherlane_contracts import ContractVersion, Cursor, Identifier
from featherlane_contracts.people import (
    AccessChangeEnvelope,
    ChangeProjectPeopleRequest,
    DomainRuleEnvelope,
    DomainRuleListEnvelope,
    EmailGrantEnvelope,
    EmailGrantListEnvelope,
    JoinExclusionListEnvelope,
    OrganizationAccessEnvelope,
    OrganizationPeopleEnvelope,
    ProjectPeopleEnvelope,
    SaveDomainRuleRequest,
    SaveEmailGrantRequest,
)
from featherlane_contracts.projects import ProjectListEnvelope
from sqlalchemy.ext.asyncio import AsyncSession

from featherlane_api.http.dependencies import get_session
from featherlane_api.http.errors import ERROR_RESPONSES
from featherlane_api.modules.access.people import PeopleService
from featherlane_api.modules.identity.application import IdentityService
from featherlane_api.modules.identity.dependencies import (
    get_identity_service,
    get_principal,
    require_csrf,
    session_handle,
)
from featherlane_api.modules.identity.domain import Principal

OrgId = Annotated[Identifier, Path(alias="orgId")]
RuleId = Annotated[Identifier, Path(alias="ruleId")]
ProjectId = Annotated[Identifier, Path(alias="projectId")]
ReadPrincipal = Annotated[Principal, Depends(get_principal)]
WritePrincipal = Annotated[Principal, Depends(require_csrf)]
Csrf = Annotated[str, Header(alias="x-csrf-token", min_length=64, max_length=64)]
PageLimit = Annotated[int, Query(ge=1, le=100)]
PageCursor = Annotated[Cursor | None, Query()]


def require_contract_version(
    version: Annotated[ContractVersion, Header(alias="x-flf-contract-version")],
) -> None:
    pass


def get_people_service(
    session: Annotated[AsyncSession, Depends(get_session)],
    identity: Annotated[IdentityService, Depends(get_identity_service)],
) -> PeopleService:
    return PeopleService(session, identity)


Service = Annotated[PeopleService, Depends(get_people_service)]
router = APIRouter(
    prefix="/api/v1/orgs/{orgId}",
    responses=ERROR_RESPONSES,
    dependencies=[Depends(require_contract_version)],
)


@router.get(
    "/access",
    operation_id="getOrganizationAccess",
    response_model=OrganizationAccessEnvelope,
)
async def overview(
    request: Request, organization_id: OrgId, principal: ReadPrincipal, service: Service
) -> OrganizationAccessEnvelope:
    return await service.overview(principal, session_handle(request), organization_id)


@router.get(
    "/people",
    operation_id="listOrganizationPeople",
    response_model=OrganizationPeopleEnvelope,
)
async def people(
    request: Request,
    organization_id: OrgId,
    principal: ReadPrincipal,
    service: Service,
    limit: PageLimit = 50,
    cursor: PageCursor = None,
) -> OrganizationPeopleEnvelope:
    return await service.people(
        principal, session_handle(request), organization_id, limit, cursor
    )


@router.get(
    "/email-grants",
    operation_id="listEmailGrants",
    response_model=EmailGrantListEnvelope,
)
async def email_grants(
    request: Request,
    organization_id: OrgId,
    principal: ReadPrincipal,
    service: Service,
    limit: PageLimit = 50,
    cursor: PageCursor = None,
) -> EmailGrantListEnvelope:
    return await service.email_grants(
        principal, session_handle(request), organization_id, limit, cursor
    )


@router.post(
    "/email-grants", operation_id="saveEmailGrant", response_model=EmailGrantEnvelope
)
async def save_email(
    request: Request,
    organization_id: OrgId,
    body: SaveEmailGrantRequest,
    principal: WritePrincipal,
    service: Service,
    csrf: Csrf,
) -> EmailGrantEnvelope:
    return await service.save_email(
        principal, session_handle(request), csrf, organization_id, body.email
    )


@router.delete(
    "/email-grants/{ruleId}",
    operation_id="removeEmailGrant",
    response_model=AccessChangeEnvelope,
)
async def remove_email(
    request: Request,
    organization_id: OrgId,
    rule_id: RuleId,
    principal: WritePrincipal,
    service: Service,
    csrf: Csrf,
) -> AccessChangeEnvelope:
    return await service.remove_email(
        principal, session_handle(request), csrf, organization_id, rule_id
    )


@router.get(
    "/domain-rules",
    operation_id="listDomainRules",
    response_model=DomainRuleListEnvelope,
)
async def domains(
    request: Request,
    organization_id: OrgId,
    principal: ReadPrincipal,
    service: Service,
    limit: PageLimit = 50,
    cursor: PageCursor = None,
) -> DomainRuleListEnvelope:
    return await service.domains(
        principal, session_handle(request), organization_id, limit, cursor
    )


@router.post(
    "/domain-rules", operation_id="saveDomainRule", response_model=DomainRuleEnvelope
)
async def save_domain(
    request: Request,
    organization_id: OrgId,
    body: SaveDomainRuleRequest,
    principal: WritePrincipal,
    service: Service,
    csrf: Csrf,
) -> DomainRuleEnvelope:
    return await service.save_domain(
        principal, session_handle(request), csrf, organization_id, body.domain
    )


@router.delete(
    "/domain-rules/{ruleId}",
    operation_id="removeDomainRule",
    response_model=AccessChangeEnvelope,
)
async def remove_domain(
    request: Request,
    organization_id: OrgId,
    rule_id: RuleId,
    principal: WritePrincipal,
    service: Service,
    csrf: Csrf,
) -> AccessChangeEnvelope:
    return await service.remove_domain(
        principal, session_handle(request), csrf, organization_id, rule_id
    )


@router.get(
    "/join-exclusions",
    operation_id="listJoinExclusions",
    response_model=JoinExclusionListEnvelope,
)
async def exclusions(
    request: Request,
    organization_id: OrgId,
    principal: ReadPrincipal,
    service: Service,
    limit: PageLimit = 50,
    cursor: PageCursor = None,
) -> JoinExclusionListEnvelope:
    return await service.exclusions(
        principal, session_handle(request), organization_id, limit, cursor
    )


@router.delete(
    "/join-exclusions/{ruleId}",
    operation_id="allowAutomaticJoining",
    response_model=AccessChangeEnvelope,
)
async def restore_joining(
    request: Request,
    organization_id: OrgId,
    rule_id: RuleId,
    principal: WritePrincipal,
    service: Service,
    csrf: Csrf,
) -> AccessChangeEnvelope:
    return await service.restore_joining(
        principal, session_handle(request), csrf, organization_id, rule_id
    )


@router.delete(
    "/people/{userId}",
    operation_id="removeOrganizationPerson",
    response_model=AccessChangeEnvelope,
)
async def remove_person(
    request: Request,
    organization_id: OrgId,
    user_id: Annotated[Identifier, Path(alias="userId")],
    principal: WritePrincipal,
    service: Service,
    csrf: Csrf,
) -> AccessChangeEnvelope:
    return await service.remove_person(
        principal, session_handle(request), csrf, organization_id, user_id
    )


@router.get(
    "/managed-projects",
    operation_id="listManagedProjects",
    response_model=ProjectListEnvelope,
)
async def projects(
    request: Request,
    organization_id: OrgId,
    principal: ReadPrincipal,
    service: Service,
    limit: PageLimit = 50,
    cursor: PageCursor = None,
) -> ProjectListEnvelope:
    return await service.projects(
        principal, session_handle(request), organization_id, limit, cursor
    )


@router.get(
    "/projects/{projectId}/people",
    operation_id="listProjectPeople",
    response_model=ProjectPeopleEnvelope,
)
async def project_people(
    request: Request,
    organization_id: OrgId,
    project_id: ProjectId,
    principal: ReadPrincipal,
    service: Service,
    limit: PageLimit = 50,
    cursor: PageCursor = None,
) -> ProjectPeopleEnvelope:
    return await service.project_people(
        principal, session_handle(request), organization_id, project_id, limit, cursor
    )


@router.patch(
    "/projects/{projectId}/people",
    operation_id="changeProjectPeople",
    response_model=AccessChangeEnvelope,
)
async def change_project_people(
    request: Request,
    organization_id: OrgId,
    project_id: ProjectId,
    body: ChangeProjectPeopleRequest,
    principal: WritePrincipal,
    service: Service,
    csrf: Csrf,
) -> AccessChangeEnvelope:
    return await service.change_project_people(
        principal, session_handle(request), csrf, organization_id, project_id, body
    )
