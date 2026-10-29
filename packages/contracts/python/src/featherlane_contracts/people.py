"""Owner administration and admission rules; identity remains issuer/subject based."""

from enum import StrEnum
from typing import Annotated, Literal

from pydantic import AfterValidator, BeforeValidator, Field

from featherlane_contracts import (
    CursorMeta,
    Identifier,
    SessionUser,
    SuccessEnvelope,
    WireModel,
    _require_true_constant,
)
from featherlane_contracts.projects import OrganizationView

DOMAIN_PATTERN = (
    r"^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+"
    r"[a-z]{2,63}$"
)
EMAIL_PATTERN = (
    r"^[a-z0-9!#$%&'*+/=?^_`{|}~-]+"
    r"(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@"
    r"(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$"
)


def normalize_address(value: object) -> object:
    # No provider-specific dot/plus rewriting, account linking or suffix matching.
    return value.strip().lower() if isinstance(value, str) else value


def email_local_length(value: str) -> str:
    if len(value.split("@", 1)[0]) > 64:
        raise ValueError("Email local part exceeds 64 characters")
    return value


AdmissionDomain = Annotated[
    str,
    Field(min_length=3, max_length=253, pattern=DOMAIN_PATTERN),
    BeforeValidator(normalize_address),
]
AdmissionEmail = Annotated[
    str,
    Field(min_length=3, max_length=320, pattern=EMAIL_PATTERN),
    BeforeValidator(normalize_address),
    AfterValidator(email_local_length),
]


class AdmissionSource(StrEnum):
    OWNER = "OWNER"
    OPERATOR = "OPERATOR"
    EMAIL = "EMAIL"
    DOMAIN = "DOMAIN"


class OrganizationAccessView(WireModel):
    organization: OrganizationView
    owner: SessionUser | None
    member_count: Annotated[int, Field(ge=0)]
    saved_email_count: Annotated[int, Field(ge=0)]


class OrganizationAccessEnvelope(SuccessEnvelope[OrganizationAccessView]):
    pass


class OrganizationPersonView(WireModel):
    user: SessionUser
    source: AdmissionSource
    matched_domain: AdmissionDomain | None
    project_count: Annotated[int, Field(ge=0)]


class OrganizationPeopleEnvelope(WireModel):
    data: Annotated[list[OrganizationPersonView], Field(max_length=100)]
    meta: CursorMeta


class SaveEmailGrantRequest(WireModel):
    email: AdmissionEmail


class EmailGrantView(WireModel):
    id: Identifier
    email: AdmissionEmail
    waiting_for_sign_in: bool


class EmailGrantEnvelope(SuccessEnvelope[EmailGrantView]):
    pass


class EmailGrantListEnvelope(WireModel):
    data: Annotated[list[EmailGrantView], Field(max_length=100)]
    meta: CursorMeta


class SaveDomainRuleRequest(WireModel):
    domain: AdmissionDomain


class DomainRuleView(WireModel):
    id: Identifier
    domain: AdmissionDomain


class DomainRuleEnvelope(SuccessEnvelope[DomainRuleView]):
    pass


class DomainRuleListEnvelope(WireModel):
    data: Annotated[list[DomainRuleView], Field(max_length=100)]
    meta: CursorMeta


class JoinExclusionView(WireModel):
    id: Identifier
    email: Annotated[str, Field(min_length=1, max_length=320)]


class JoinExclusionListEnvelope(WireModel):
    data: Annotated[list[JoinExclusionView], Field(max_length=100)]
    meta: CursorMeta


class ProjectPersonView(WireModel):
    user: SessionUser
    has_access: bool


class ProjectPeopleEnvelope(WireModel):
    data: Annotated[list[ProjectPersonView], Field(max_length=100)]
    meta: CursorMeta


class ProjectMembershipChange(WireModel):
    user_id: Identifier
    has_access: bool


class ChangeProjectPeopleRequest(WireModel):
    changes: Annotated[
        list[ProjectMembershipChange], Field(min_length=1, max_length=100)
    ]


class AccessChangeResult(WireModel):
    applied: Annotated[Literal[True], BeforeValidator(_require_true_constant)]


class AccessChangeEnvelope(SuccessEnvelope[AccessChangeResult]):
    pass
