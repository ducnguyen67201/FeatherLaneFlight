"""Organization and project display contracts; membership has no role hierarchy."""

from typing import Annotated

from pydantic import Field

from featherlane_contracts import (
    CursorMeta,
    DisplayName,
    Identifier,
    SuccessEnvelope,
    WireModel,
)

ProjectName = Annotated[str, Field(min_length=1, max_length=100, pattern=r"\S")]


class OrganizationView(WireModel):
    id: Identifier
    name: DisplayName


class ProjectView(WireModel):
    id: Identifier
    organization_id: Identifier
    name: ProjectName


class CreateProjectRequest(WireModel):
    name: ProjectName


class OrganizationListEnvelope(WireModel):
    data: Annotated[list[OrganizationView], Field(max_length=100)]
    meta: CursorMeta


class ProjectListEnvelope(WireModel):
    data: Annotated[list[ProjectView], Field(max_length=100)]
    meta: CursorMeta


class ProjectEnvelope(SuccessEnvelope[ProjectView]):
    pass
