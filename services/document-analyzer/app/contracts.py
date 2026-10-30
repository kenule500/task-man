"""Request, plan and response models for the analyzer.

The plan models mirror ``contracts/plan.contract.json`` and the Node ``PlanContent`` shape.
Validation is strict: unknown fields are refused, references must resolve, and counts stay
inside the limits the Node schema enforces.
"""

from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Locale(str, Enum):
    EN = "en"
    FR = "fr"
    AR = "ar"


class DocumentMime(str, Enum):
    PDF = "application/pdf"
    DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    TEXT = "text/plain"
    MARKDOWN = "text/markdown"


class ItemType(str, Enum):
    STORY = "story"
    TASK = "task"
    BUG = "bug"
    SPIKE = "spike"


class Priority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ProjectColor(str, Enum):
    BLUE = "blue"
    VIOLET = "violet"
    ROSE = "rose"
    ORANGE = "orange"
    AMBER = "amber"
    EMERALD = "emerald"
    TEAL = "teal"
    SLATE = "slate"


class DocumentPayload(StrictModel):
    fileName: str = Field(min_length=1, max_length=100)
    mimeType: DocumentMime
    text: str = Field(min_length=1)


class PlanOptions(StrictModel):
    projectName: str = Field(default="", max_length=60)
    projectKey: str = Field(default="", pattern=r"^$|^[A-Z0-9]{2,6}$")
    sprintLengthWeeks: int = Field(default=2, ge=1, le=4)
    startDate: str = Field(default="", pattern=r"^$|^[0-9]{4}-[0-9]{2}-[0-9]{2}$")
    teamSize: int | None = Field(default=None, ge=1, le=200)
    extraInstructions: str = Field(default="", max_length=500)
    language: Locale = Locale.EN
    existingProject: bool = False


class AnalyzeRequest(StrictModel):
    contractVersion: Literal[1]
    requestId: str = Field(min_length=8, max_length=64)
    document: DocumentPayload
    options: PlanOptions


class AnalyzerInfo(StrictModel):
    engine: Literal["documind"] = "documind"
    sdkVersion: str
    model: str
    latencyMs: int = Field(ge=0)


class ErrorEnvelope(StrictModel):
    requestId: str
    code: str
    message: str


class PlanProject(StrictModel):
    name: str = Field(min_length=1, max_length=60)
    key: str = Field(pattern=r"^[A-Z0-9]{2,6}$")
    description: str = Field(default="", max_length=500)
    color: ProjectColor = ProjectColor.BLUE

    @field_validator("key", mode="before")
    @classmethod
    def upper_key(cls, value: object) -> object:
        return value.upper() if isinstance(value, str) else value


class PlanSprint(StrictModel):
    name: str = Field(default="", max_length=60)
    goal: str = Field(default="", max_length=300)
    startDate: str = Field(default="", max_length=10)
    endDate: str = Field(default="", max_length=10)


class PlanEpic(StrictModel):
    ref: str = Field(pattern=r"^[A-Za-z0-9_-]{1,24}$")
    title: str = Field(min_length=1, max_length=140)
    description: str = Field(default="", max_length=500)


class PlanSubtask(StrictModel):
    title: str = Field(min_length=1, max_length=140)
    acceptanceCriteria: list[str] = Field(default_factory=list, max_length=6)

    @field_validator("acceptanceCriteria")
    @classmethod
    def bound_criteria(cls, values: list[str]) -> list[str]:
        return [value[:300] for value in values]


class PlanItem(StrictModel):
    ref: str = Field(pattern=r"^[A-Za-z0-9_-]{1,24}$")
    sprintIndex: int | None = Field(default=None, ge=0)
    epicRef: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_-]{1,24}$")
    title: str = Field(min_length=1, max_length=140)
    description: str = Field(default="", max_length=1000)
    type: ItemType = ItemType.TASK
    priority: Priority = Priority.MEDIUM
    storyPoints: int | None = None
    labels: list[str] = Field(default_factory=list, max_length=5)
    acceptanceCriteria: list[str] = Field(default_factory=list, max_length=6)
    subtasks: list[PlanSubtask] = Field(default_factory=list, max_length=8)

    @field_validator("storyPoints")
    @classmethod
    def fibonacci(cls, value: int | None) -> int | None:
        if value is not None and value not in {1, 2, 3, 5, 8, 13}:
            raise ValueError("storyPoints must be 1, 2, 3, 5, 8, 13 or null")
        return value

    @field_validator("labels")
    @classmethod
    def bound_labels(cls, values: list[str]) -> list[str]:
        return [value[:40] for value in values]

    @field_validator("acceptanceCriteria")
    @classmethod
    def bound_criteria(cls, values: list[str]) -> list[str]:
        return [value[:300] for value in values]


class PlanContract(StrictModel):
    project: PlanProject
    sprints: list[PlanSprint] = Field(default_factory=list, max_length=8)
    epics: list[PlanEpic] = Field(default_factory=list, max_length=12)
    items: list[PlanItem] = Field(default_factory=list, max_length=120)
    assumptions: list[str] = Field(default_factory=list, max_length=12)
    risks: list[str] = Field(default_factory=list, max_length=12)

    @model_validator(mode="after")
    def references_resolve(self) -> PlanContract:
        epic_refs = [epic.ref for epic in self.epics]
        if len(set(epic_refs)) != len(epic_refs):
            raise ValueError("epic refs must be unique")

        item_refs = [item.ref for item in self.items]
        if len(set(item_refs)) != len(item_refs):
            raise ValueError("item refs must be unique")

        known_epics = set(epic_refs)
        for item in self.items:
            if item.epicRef is not None and item.epicRef not in known_epics:
                raise ValueError(f"item {item.ref} points at an unknown epic")
            if item.sprintIndex is not None and item.sprintIndex >= len(self.sprints):
                raise ValueError(f"item {item.ref} points at an unknown sprint")

        subtasks = sum(len(item.subtasks) for item in self.items)
        if subtasks > 300:
            raise ValueError("too many subtasks")
        return self


class AnalyzeResponse(StrictModel):
    contractVersion: Literal[1] = 1
    requestId: str
    plan: PlanContract
    analyzer: AnalyzerInfo
    warnings: list[str] = Field(default_factory=list)


class AnalyzerError(Exception):
    """A refusal with an HTTP status and a stable code the Node client maps."""

    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        retry_after: int | None = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.retry_after = retry_after

