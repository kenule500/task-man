"""Request, plan and response models for the analyzer.

The plan models mirror ``packages/contracts/plan.contract.json`` and the Node ``PlanContent`` shape.
The **request** is validated strictly: it comes from our own API, so an unknown field is a bug worth
reporting. The **plan** is validated the way the Node ``modelPlanSchema`` treated it: the model's
small deviations are repaired instead of refused, so a stray extra field or a reference that points
nowhere no longer throws away a generation that was already paid for. What cannot be repaired at all
(unreadable, cut-off or empty output) never reaches these models; ``app.parsing`` refuses it.
"""

from __future__ import annotations

import re
from enum import StrEnum
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator, model_validator

from .plan_limits import PLAN_LIMITS

# The same reference pattern the Node schema and plan.contract.json use
_REF = re.compile(r"^[A-Za-z0-9_-]{1,24}$")


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class LenientModel(BaseModel):
    """A model answer: unknown fields are dropped, and the validators below repair the rest."""

    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)


def _nearest_points(value: int | None) -> int | None:
    """The nearest step of the Fibonacci scale up to 13, or null when there is no estimate.

    Mirrors ``snapStoryPoints`` in the Node schema: on a tie the larger step wins, because an
    estimate that is too small is worse than one that is too large.
    """
    if value is None or value <= 0:
        return None
    return min(PLAN_LIMITS.points, key=lambda step: (abs(step - value), -step))


def _free_ref(prefix: str, index: int, used: set[str]) -> str:
    """``prefix`` followed by a number nobody uses yet, starting at ``index + 1``."""
    number = index + 1
    while f"{prefix}{number}".lower() in used:
        number += 1
    return f"{prefix}{number}"


class Locale(StrEnum):
    EN = "en"
    FR = "fr"
    AR = "ar"


class DocumentMime(StrEnum):
    PDF = "application/pdf"
    DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    TEXT = "text/plain"
    MARKDOWN = "text/markdown"


class ItemType(StrEnum):
    STORY = "story"
    TASK = "task"
    BUG = "bug"
    SPIKE = "spike"


class Priority(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ProjectColor(StrEnum):
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


class WorkspaceLlm(StrictModel):
    """The provider of the workspace that queued this plan (BYOK), sent with every request.

    The API holds the decrypted key and the analyzer has no database, so the credentials travel
    with the request. They are handed straight to the SDK: never logged, never stored, and never
    echoed in an error or an answer. Only HTTPS is accepted, the same rule the workspace settings
    already enforce (``normalizeBaseURL`` in the API), so a stored value cannot redirect a key.

    Every workspace preset is an OpenAI-compatible endpoint, which is the SDK's ``custom``
    provider; that is why there is no provider name here.
    """

    model: str = Field(min_length=1, max_length=120)
    apiKey: str = Field(min_length=1, max_length=400)
    baseUrl: str = Field(min_length=1, max_length=300)

    @field_validator("baseUrl")
    @classmethod
    def https_only(cls, value: str) -> str:
        """HTTPS with nothing else in it: the same rule the workspace settings already enforce.

        The API validates the endpoint before sending it (``normalizeBaseURL``), so this is the
        second lock on the same door: this service is what dials it, and a stored value must not be
        able to carry a key elsewhere or smuggle one through userinfo or a query string.
        """
        parsed = urlsplit(value)
        if parsed.scheme != "https" or not parsed.hostname:
            raise ValueError("the workspace endpoint must be an https URL")
        if parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError(
                "the workspace endpoint must not carry credentials, a query or a fragment"
            )
        return value.rstrip("/")


class AnalyzeRequest(StrictModel):
    contractVersion: Literal[1]
    requestId: str = Field(min_length=8, max_length=64)
    document: DocumentPayload
    options: PlanOptions
    # Absent only for a caller that predates the workspace provider block; the service then runs
    # on its own DOCUMIND_LLM_* settings.
    llm: WorkspaceLlm | None = None


class AnalyzerInfo(StrictModel):
    engine: Literal["documind"] = "documind"
    sdkVersion: str
    model: str
    latencyMs: int = Field(ge=0)


class ErrorEnvelope(StrictModel):
    requestId: str
    code: str
    message: str


class PlanProject(LenientModel):
    name: str = Field(min_length=1, max_length=60)
    key: str = Field(pattern=r"^[A-Z0-9]{2,6}$")
    description: str = Field(default="", max_length=500)
    color: ProjectColor = ProjectColor.BLUE

    @field_validator("key", mode="before")
    @classmethod
    def upper_key(cls, value: object) -> object:
        return value.upper() if isinstance(value, str) else value


class PlanSprint(LenientModel):
    name: str = Field(default="", max_length=60)
    goal: str = Field(default="", max_length=300)
    startDate: str = Field(default="", max_length=10)
    endDate: str = Field(default="", max_length=10)


class PlanEpic(LenientModel):
    ref: str = Field(default="", max_length=24)
    title: str = Field(min_length=1, max_length=140)
    description: str = Field(default="", max_length=500)

    @field_validator("ref")
    @classmethod
    def known_ref(cls, value: str) -> str:
        # An unreadable ref is replaced (the plan validator gives it a free one), never refused
        return value if _REF.match(value) else ""


class PlanSubtask(LenientModel):
    title: str = Field(min_length=1, max_length=140)
    acceptanceCriteria: list[str] = Field(default_factory=list, max_length=6)

    @field_validator("acceptanceCriteria")
    @classmethod
    def bound_criteria(cls, values: list[str]) -> list[str]:
        return [value[:300] for value in values]


class PlanItem(LenientModel):
    ref: str = Field(default="", max_length=24)
    sprintIndex: int | None = Field(default=None, ge=0)
    epicRef: str | None = Field(default=None, max_length=24)
    title: str = Field(min_length=1, max_length=140)
    description: str = Field(default="", max_length=1000)
    type: ItemType = ItemType.TASK
    priority: Priority = Priority.MEDIUM
    storyPoints: int | None = None
    labels: list[str] = Field(default_factory=list, max_length=5)
    acceptanceCriteria: list[str] = Field(default_factory=list, max_length=6)
    subtasks: list[PlanSubtask] = Field(default_factory=list, max_length=8)

    @field_validator("ref")
    @classmethod
    def known_ref(cls, value: str) -> str:
        return value if _REF.match(value) else ""

    @field_validator("epicRef")
    @classmethod
    def known_epic_ref(cls, value: str | None) -> str | None:
        return value if value is not None and _REF.match(value) else None

    @field_validator("storyPoints", mode="before")
    @classmethod
    def number(cls, value: object) -> object:
        # An estimate is a number; a model that sends "4.5" or 4.5 still gets a usable one
        if isinstance(value, float):
            return round(value)
        if isinstance(value, str) and value.strip().replace(".", "", 1).isdigit():
            return round(float(value))
        return value

    @field_validator("storyPoints")
    @classmethod
    def fibonacci(cls, value: int | None) -> int | None:
        return _nearest_points(value)

    @field_validator("labels")
    @classmethod
    def bound_labels(cls, values: list[str]) -> list[str]:
        return [value[:40] for value in values]

    @field_validator("acceptanceCriteria")
    @classmethod
    def bound_criteria(cls, values: list[str]) -> list[str]:
        return [value[:300] for value in values]


class PlanContract(LenientModel):
    project: PlanProject
    # Trimmed rather than refused: Node keeps the first N too, and a long plan is still a plan
    sprints: list[PlanSprint] = Field(default_factory=list)
    epics: list[PlanEpic] = Field(default_factory=list)
    items: list[PlanItem] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)

    @field_validator("sprints", "epics", "items", "assumptions", "risks", mode="before")
    @classmethod
    def trim(cls, values: object, info: ValidationInfo) -> object:
        limit = {
            "sprints": PLAN_LIMITS.sprints,
            "epics": PLAN_LIMITS.epics,
            "items": PLAN_LIMITS.items,
            "assumptions": PLAN_LIMITS.notes,
            "risks": PLAN_LIMITS.notes,
        }[info.field_name]
        return values[:limit] if isinstance(values, list) else values

    @field_validator("items")
    @classmethod
    def needs_an_item(cls, values: list[PlanItem]) -> list[PlanItem]:
        # The one refusal a plan keeps: Node requires it too, and a plan with no work in it is not usable
        if not values:
            raise ValueError("the plan needs at least one item")
        return values

    @model_validator(mode="after")
    def references_resolve(self) -> PlanContract:
        """Repairs what needs the whole plan, the way Node's ``finalizePlan`` does.

        A missing or duplicate ref is renumbered, and an ``epicRef`` or ``sprintIndex`` that points
        outside the plan becomes null (no epic / product backlog). This is the same repair the Node
        side applies, so the two can no longer disagree about whether a plan is usable.
        """
        used: set[str] = set()
        for index, epic in enumerate(self.epics):
            if not epic.ref or epic.ref.lower() in used:
                epic.ref = _free_ref("E", index, used)
            used.add(epic.ref.lower())
        epic_refs = {epic.ref for epic in self.epics}

        for index, item in enumerate(self.items):
            if not item.ref or item.ref.lower() in used:
                item.ref = _free_ref("T", index, used)
            used.add(item.ref.lower())
            if item.epicRef is not None and item.epicRef not in epic_refs:
                item.epicRef = None
            if item.sprintIndex is not None and not 0 <= item.sprintIndex < len(self.sprints):
                item.sprintIndex = None

        # The plan as a whole is limited, not just each item
        left = PLAN_LIMITS.subtasks_total
        for item in self.items:
            item.subtasks = item.subtasks[: max(0, left)]
            left -= len(item.subtasks)
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
