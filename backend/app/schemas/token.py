from datetime import datetime
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, model_validator

from app.models.token import TokenStatus


class TokenCreate(BaseModel):
    model_config = ConfigDict(hide_input_in_errors=True)

    counter_id: int
    customer_name: str | None = Field(default=None, max_length=255)
    customer_phone: str | None = Field(default=None, max_length=32)
    whatsapp_copy: StrictBool = False
    customer_cnic: str | None = Field(default=None, pattern=r"^[0-9]{13}$", min_length=13, max_length=13)
    referral_source: Literal["website", "institution", "other"] | None = None
    referral_organization: str | None = Field(default=None, max_length=255)
    requested_priority: Literal["normal", "accessibility"] = "normal"
    priority_reason: Literal["elderly", "disability"] | None = None

    @model_validator(mode="after")
    def validate_intake(self):
        if self.referral_organization is not None:
            self.referral_organization = self.referral_organization.strip() or None
        if self.referral_source == "other" and not self.referral_organization:
            raise ValueError("Other organization requires an organization name")
        if self.referral_source != "other" and self.referral_organization:
            raise ValueError("Organization name is only used for Other organization")
        if (self.requested_priority == "accessibility") != (self.priority_reason is not None):
            raise ValueError("Accessibility requests require elderly or disability reason; normal requests have no reason")
        return self

    @model_validator(mode="after")
    def validate_copy_phone(self):
        if self.customer_phone:
            self.customer_phone = re.sub(r"[\s().-]", "", self.customer_phone)
        if self.whatsapp_copy and not re.fullmatch(r"\+[1-9][0-9]{6,14}", self.customer_phone or ""):
            raise ValueError("WhatsApp copy requires a full international phone, e.g. +923111234567")
        return self


class CopyNotification(BaseModel):
    status: Literal["not_requested", "action_required", "unavailable", "accepted", "failed", "unknown"]
    action_url: str | None = None


class DeclineRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=255)


class TokenOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    token_number: str
    customer_name: str | None
    customer_phone: str | None
    status: TokenStatus
    decline_reason: str | None = None
    served_by_personnel_id: int | None = None
    issued_at: datetime
    called_at: datetime | None
    completed_at: datetime | None
    counter_id: int
    position: int | None = None
    # Computed by the snapshot/queue builders, never read off the ORM row.
    served_by_name: str | None = None
    eta_min: float | None = None
    notification: CopyNotification | None = None
    requested_priority: str = "normal"
    effective_priority: str = "normal"
    priority_reason: str | None = None
    priority_review: str = "not_requested"


class TokenPage(BaseModel):
    items: list[TokenOut]
    total: int


class PublicTokenIssue(TokenCreate):
    institution_id: int
    customer_cnic: str = Field(pattern=r"^[0-9]{13}$", min_length=13, max_length=13)
    referral_source: Literal["website", "institution", "other"]


class PriorityReview(BaseModel):
    decision: Literal["approve", "reject", "normal"]


class PublicTicketOut(BaseModel):
    requested_priority: Literal["normal", "accessibility"] = "normal"
    effective_priority: Literal["normal", "accessibility"] = "normal"
    priority_review: Literal["not_requested", "pending", "approved", "rejected", "normal"] = "not_requested"
    token_number: str
    status: TokenStatus
    counter_id: int
    counter_name: str
    issued_at: datetime
    called_at: datetime | None
    completed_at: datetime | None
    position: int | None = None
    people_ahead: int | None = None
    estimated_wait_min: float | None = None
    notification: CopyNotification | None = None
