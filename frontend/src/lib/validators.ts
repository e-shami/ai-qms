/**
 * Centralized zod schemas — every user input in the app validates here.
 * Limits mirror the backend's Pydantic constraints so clients never send
 * something the server must reject.
 */
import { z } from "zod";

// --- primitives -------------------------------------------------------------

/**
 * Pakistani mobile numbers only. Accepts local and international forms with
 * optional space/dash separators:
 *   03111234567 · 0311 1234567 · 0311-1234567
 *   +923111234567 · +92 311 1234567 · +92-311-1234567
 */
export const PHONE_REGEX = /^(?:\+92[ -]?|0)3\d{2}[ -]?\d{7}$/;
export const PHONE_HINT = "Pakistani mobile: 0311 1234567 or +92 311 1234567";

export const emailField = z.email("Enter a valid email address");

export const passwordField = z
  .string()
  .min(8, "At least 8 characters")
  .max(128, "At most 128 characters");

export const requiredName = (max: number) =>
  z
    .string()
    .trim()
    .min(1, "This field is required")
    .max(max, `At most ${max} characters`);

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `At most ${max} characters`)
    .optional()
    .or(z.literal(""));

/** Optional phone stored normalized or empty when untouched. */
export const optionalPhone = z
  .string()
  .trim()
  .regex(PHONE_REGEX, PHONE_HINT)
  .optional()
  .or(z.literal(""));

/** Select placeholder value representing "no counter chosen". */
export const NO_COUNTER = "__none__";

/** yyyy-mm-dd date-input value or empty. */
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date picker")
  .optional()
  .or(z.literal(""));

// --- auth --------------------------------------------------------------------

/** Institution short code: three letters + at least three digits (SHR016). */
export const INSTITUTION_CODE_REGEX = /^[A-Za-z]{3}\d{3,}$/;

export const institutionCodeField = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => INSTITUTION_CODE_REGEX.test(value), {
    message: "Format: three letters + digits, e.g. SHR016",
  });

export const verifyInstitutionSchema = z.object({
  code: institutionCodeField,
});
export type VerifyInstitutionValues = z.infer<typeof verifyInstitutionSchema>;

export const loginSchema = z.object({
  code: institutionCodeField,
  email: emailField,
  password: z.string().min(1, "Password is required"),
});
export type LoginFormValues = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  fullName: requiredName(255),
  institutionName: requiredName(255),
  institutionType: optionalText(64),
  email: emailField,
  password: passwordField,
});
export type RegisterFormValues = z.infer<typeof registerSchema>;

// --- profile ------------------------------------------------------------------

export const profileSchema = z.object({
  fullName: requiredName(255),
  email: emailField,
});
export type ProfileFormValues = z.infer<typeof profileSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: passwordField,
    confirmPassword: z.string().min(1, "Confirm the new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });
export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;

// --- staff-account ------------------------------------------------------------

export const staffAccountSchema = z.object({
  email: emailField,
  password: passwordField,
});
export type StaffAccountFormValues = z.infer<typeof staffAccountSchema>;

/** Single-step staff creation: person fields plus their login credentials. */
export const staffCreateSchema = z.object({
  name: requiredName(255),
  title: optionalText(128),
  counterId: z.union([
    z.literal(NO_COUNTER),
    z.string().regex(/^\d+$/, "Pick a counter"),
  ]),
  email: emailField,
  password: passwordField,
});
export type StaffCreateFormValues = z.infer<typeof staffCreateSchema>;

export const resetPasswordSchema = z
  .object({
    newPassword: passwordField,
    confirmPassword: z.string().min(1, "Confirm the new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });
export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

// --- decline ------------------------------------------------------------------

export const declineSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "A reason is required")
    .max(255, "At most 255 characters"),
});
export type DeclineFormValues = z.infer<typeof declineSchema>;

// --- institution ----------------------------------------------------------------

export const institutionSchema = z.object({
  name: requiredName(255),
  type: optionalText(64),
  whatsappNumber: optionalPhone,
});
export type InstitutionFormValues = z.infer<typeof institutionSchema>;

// --- counters ---------------------------------------------------------------------

export const counterFormSchema = z.object({
  name: requiredName(128),
  type: optionalText(64),
});
export type CounterFormValues = z.infer<typeof counterFormSchema>;

// --- personnel -----------------------------------------------------------------------

export const personnelFormSchema = z.object({
  name: requiredName(255),
  title: optionalText(128),
  email: emailField.optional().or(z.literal("")),
  counterId: z.union([
    z.literal(NO_COUNTER),
    z.string().regex(/^\d+$/, "Pick a counter"),
  ]),
});
export type PersonnelFormValues = z.infer<typeof personnelFormSchema>;
export const personnelEditFormSchema = personnelFormSchema.omit({
  counterId: true,
});
export const NO_COUNTER_VALUE = NO_COUNTER;

// --- tokens ------------------------------------------------------------------------------

export const issueTokenSchema = z.object({
  counterId: z.string().regex(/^\d+$/, "Select a counter"),
  customerName: optionalText(255),
  customerPhone: optionalPhone,
});
export type IssueTokenFormValues = z.infer<typeof issueTokenSchema>;

// --- public join flow ------------------------------------------------------------------------

export const joinDetailsSchema = z.object({
  customerName: optionalText(255),
  customerPhone: optionalPhone,
});
export type JoinDetailsFormValues = z.infer<typeof joinDetailsSchema>;

/** Public ticket lookup params (token page). */
export const ticketLookupSchema = z.object({
  tokenNumber: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{1,10}-\d{1,8}$/, "Malformed token number"),
  institutionId: z.coerce.number().int().positive(),
});
export type TicketLookupValues = z.infer<typeof ticketLookupSchema>;

// --- date ranges -------------------------------------------------------------------------------

export const dateRangeSchema = z
  .object({
    from: dateString,
    to: dateString,
  })
  .refine(
    (data) => {
      if (!data.from || !data.to) return true;
      return (
        new Date(`${data.from}T00:00:00`) <= new Date(`${data.to}T00:00:00`)
      );
    },
    { path: ["to"], message: "'To' must be on or after 'From'" },
  );
export type DateRangeValues = z.infer<typeof dateRangeSchema>;

/** Parse-and-validate dynamic route/query input; null when invalid. */
export function parseTicketLookup(
  raw: string | undefined,
  institutionRaw: string | null,
): TicketLookupValues | null {
  const parsed = ticketLookupSchema.safeParse({
    tokenNumber: raw ?? "",
    institutionId: institutionRaw ?? "",
  });
  return parsed.success ? parsed.data : null;
}
