"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { IntakePayload, PriorityReason, ReferralSource } from "@/types";

export interface IntakeValues {
  customer_cnic: string;
  referral_source: ReferralSource | "";
  referral_organization: string;
  priority_reason: PriorityReason | "";
}
export const emptyIntake: IntakeValues = { customer_cnic: "", referral_source: "", referral_organization: "", priority_reason: "" };

export function intakePayload(value: IntakeValues, required: true, hospital: boolean): IntakePayload & { customer_cnic: string; referral_source: ReferralSource };
export function intakePayload(value: IntakeValues, required: boolean, hospital: boolean): IntakePayload;
export function intakePayload(value: IntakeValues, required: boolean, hospital: boolean): IntakePayload {
  if ((required || value.customer_cnic) && !/^[0-9]{13}$/.test(value.customer_cnic))
    throw new Error("CNIC must contain exactly 13 ASCII digits, without spaces or dashes");
  if (required && !value.referral_source) throw new Error("Select a referring organization");
  if (value.referral_source && !["website", "institution", "other"].includes(value.referral_source))
    throw new Error("Select a valid referring organization");
  if (value.referral_source === "other" && !value.referral_organization.trim())
    throw new Error("Enter the other organization name");
  if (value.referral_source === "other" && value.referral_organization.trim().length > 255)
    throw new Error("Organization name must be at most 255 characters");
  if (hospital && value.priority_reason && !["elderly", "disability"].includes(value.priority_reason))
    throw new Error("Select a valid accessibility reason");
  return {
    customer_cnic: value.customer_cnic || null,
    referral_source: value.referral_source || null,
    referral_organization: value.referral_source === "other" ? value.referral_organization.trim() : null,
    requested_priority: hospital && value.priority_reason ? "accessibility" : "normal",
    priority_reason: hospital ? value.priority_reason || null : null,
  };
}

export function IntakeFields({ value, onChange, required, hospital, institutionName }: {
  value: IntakeValues; onChange: (value: IntakeValues) => void; required: boolean;
  hospital: boolean; institutionName: string;
}) {
  const prefix = required ? "public-intake" : "admin-intake";
  return <fieldset className="space-y-3">
    <legend className="text-sm font-medium">Customer intake {required ? "(required)" : "(optional)"}</legend>
    <Label htmlFor={`${prefix}-cnic`}>CNIC</Label>
    <Input id={`${prefix}-cnic`} inputMode="numeric" autoComplete="off" required={required} pattern="[0-9]{13}"
      value={value.customer_cnic} onChange={(event) => onChange({ ...value, customer_cnic: event.target.value })}
      aria-describedby={`${prefix}-hint`} />
    <p id={`${prefix}-hint`} className="text-xs text-muted-foreground">Exactly 13 digits. Leading zeros are retained. Demo only: use dummy CNIC, stored as plaintext. No identity verification.</p>
    <Label htmlFor={`${prefix}-referral`}>Referring organization (not a medical referral)</Label>
    <select id={`${prefix}-referral`} required={required} className="w-full rounded-md border bg-background p-2 text-sm"
      value={value.referral_source} onChange={(event) => onChange({ ...value, referral_source: event.target.value as IntakeValues["referral_source"], referral_organization: "" })}>
      <option value="">{required ? "Choose an option" : "Not provided"}</option>
      <option value="website">Website</option>
      <option value="institution">Selected institution: {institutionName}</option>
      <option value="other">Other organization</option>
    </select>
    {value.referral_source === "other" && <>
      <Label htmlFor={`${prefix}-organization`}>Other organization name</Label>
      <Input id={`${prefix}-organization`} required maxLength={255} value={value.referral_organization}
        onChange={(event) => onChange({ ...value, referral_organization: event.target.value })} />
    </>}
    {hospital && <>
      <Label htmlFor={`${prefix}-priority`}>Accessibility priority request (optional)</Label>
      <select id={`${prefix}-priority`} className="w-full rounded-md border bg-background p-2 text-sm"
        value={value.priority_reason} onChange={(event) => onChange({ ...value, priority_reason: event.target.value as IntakeValues["priority_reason"] })}>
        <option value="">Normal</option><option value="elderly">Accessibility: elderly</option>
        <option value="disability">Accessibility: disability</option>
      </select>
      <p className="text-xs text-muted-foreground">Staff/admin approval is required. Pending requests keep normal queue order. This is not medical triage or emergency ranking.</p>
    </>}
  </fieldset>;
}
