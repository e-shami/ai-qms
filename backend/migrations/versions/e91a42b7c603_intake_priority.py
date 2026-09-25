"""Private intake and nonclinical accessibility priority.

Revision ID: e91a42b7c603
Revises: fa2b9b2dc743
"""
from alembic import op
import sqlalchemy as sa

revision = "e91a42b7c603"
down_revision = "fa2b9b2dc743"
branch_labels = None
depends_on = None


def upgrade():
    for name, length in (("customer_cnic", 13), ("referral_source", 32),
                         ("referral_organization", 255), ("priority_reason", 32)):
        op.add_column("tokens", sa.Column(name, sa.String(length), nullable=True))
    for name, default in (("requested_priority", "normal"), ("effective_priority", "normal"),
                          ("priority_review", "not_requested")):
        op.add_column("tokens", sa.Column(name, sa.String(32), nullable=False, server_default=default))
    op.add_column("tokens", sa.Column("priority_reviewed_by", sa.Integer(),
                                     sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True))
    op.add_column("tokens", sa.Column("priority_reviewed_at", sa.DateTime(timezone=True), nullable=True))
    for name, expression in (
        ("cnic", "customer_cnic IS NULL OR customer_cnic ~ '^[0-9]{13}$'"),
        ("referral_source", "referral_source IS NULL OR referral_source IN ('website', 'institution', 'other')"),
        ("referral_organization", "(referral_source IS NOT NULL AND referral_source = 'other' AND referral_organization IS NOT NULL AND length(trim(referral_organization)) > 0) OR ((referral_source IS NULL OR referral_source <> 'other') AND referral_organization IS NULL)"),
        ("requested_priority", "requested_priority IN ('normal', 'accessibility')"),
        ("effective_priority", "effective_priority IN ('normal', 'accessibility')"),
        ("priority_reason", "(requested_priority = 'normal' AND priority_reason IS NULL) OR (requested_priority = 'accessibility' AND priority_reason IS NOT NULL AND priority_reason IN ('elderly', 'disability'))"),
        ("priority_review", "priority_review IN ('not_requested', 'pending', 'approved', 'rejected', 'normal')"),
        ("priority_approval", "effective_priority = 'normal' OR (requested_priority = 'accessibility' AND priority_review = 'approved')"),
    ):
        op.create_check_constraint(f"ck_tokens_{name}", "tokens", expression)


def downgrade():
    for name in ("cnic", "referral_source", "referral_organization", "requested_priority",
                 "effective_priority", "priority_reason", "priority_review", "priority_approval"):
        op.drop_constraint(f"ck_tokens_{name}", "tokens", type_="check")
    for name in ("priority_reviewed_at", "priority_reviewed_by", "priority_review", "effective_priority",
                 "requested_priority", "priority_reason", "referral_organization", "referral_source", "customer_cnic"):
        op.drop_column("tokens", name)
