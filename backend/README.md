# WhatsApp Token Copies

## Intake And Accessibility Priority

Public issuance requires `customer_cnic` as exactly 13 ASCII digits in a JSON string (leading zeros preserved) and `referral_source` (`website`, `institution`, or `other`). `other` additionally requires a nonblank `referral_organization`; other sources must omit it. Authenticated issuance may omit intake. Raw intake is stored privately on the token, never returned by ticket/list/queue snapshot schemas. Application validation responses omit Pydantic input/context, and database errors are logged by exception class only, not PostgreSQL row details. Keep request-body tracing/APM capture disabled and independently restrict database statement/error logs, backups and database access; application redaction does not control infrastructure logging.

Only hospitals accept `requested_priority: accessibility`, with `priority_reason: elderly|disability`. Requests remain normal until an admin or active linked staff account approves a waiting token at `POST /api/v1/tokens/{id}/priority` with `decision: approve|reject|normal`. One counter queue keeps called/in-service work first, then approved accessibility, then normal, FIFO by issue time and ID within each band. Public tickets expose only `requested_priority`, `effective_priority`, and `priority_review`, never the reason. Review broadcasts are best effort after commit; clients must not interpret a missing realtime refresh as failure.

### Bot Contract Handoff

Both endpoints require `X-Internal-API-Key`; phone is supplied in the JSON body as full international ASCII digits without `+`.

- `POST /api/v1/internal/bot/profile {phone, institution_id}` returns `{available: true, profile_ref: 123}` or `{available: false, profile_ref: null}`. It does not return identity or referral details.
- The bot must retain that exact `profile_ref` in its confirmation session. On explicit same-person confirmation, send it as a required positive integer to `POST /api/v1/internal/bot/tokens/reuse`, alongside `phone`, `institution_id`, `counter_id`, and `confirm_same_person: true` (plus optional name/new priority request).
- The reference is a non-secret token-row version ID, not an authentication credential. Every reuse query checks the phone, institution, active institution and complete stored intake. A later profile never silently replaces the confirmed record. Missing references return 422; unavailable or out-of-scope records return 409 and require fresh intake. Clear saved references when changing phone/institution or abandoning confirmation.
- This does not prove identity on shared/recycled phones; explicit confirmation and the existing authenticated bot ingress remain necessary. No bot/session code was changed by the backend audit.

### Deployment

Coordinate the bot contract above with the mandatory public intake rollout. Back up the database, then run `alembic upgrade head` from the backend deployment before starting the new application. Revision `e91a42b7c603` adds nullable private intake, normal/not-requested defaults for old rows, review audit columns and matching ORM check constraints. This revision is currently an untracked worktree migration; if any environment has already applied an earlier version of `e91`, do not downgrade it to rerun: add a forward constraint migration after checking that environment's data. Downgrade intentionally drops intake and review data. No production migration was run during verification.

The isolated PostgreSQL check is `tests/postgres_intake_check.py`, hardwired to a disposable `aiqms-intake-postgres` host with test-only credentials. It verifies real migrated-versus-ORM column/check contracts, invalid data rejection, legacy defaults, downgrade/upgrade, two dispatch races, and eight concurrent issuances. Never point it at application data. API tests are `tests/test_intake_priority.py`; the complete suite runs with `python -m unittest discover -s /workspace/tests -v` in the disposable image with read-only backend and ML pipeline mounts and a safe `/tmp` working directory. TestClient additionally needs the HTTP test dependency required by the installed Starlette (the current image requires `httpx2`).

## Behavior And Security

- Both issuance APIs accept `whatsapp_copy: boolean`, default `false`. A phone alone never requests an outbound copy. Consent must be a JSON boolean, not a truthy string.
- An opted-in request requires `customer_phone` in full international `+` format (7-15 ASCII digits, first digit nonzero). Spaces, parentheses, periods and dashes are removed. No country is guessed. This is format validation, not proof of number ownership, reachability or WhatsApp registration. Existing non-opted-in API phone input remains supported for bot callers; the two website forms require international format for new phone input.
- Public `/api/v1/public/tokens` retains the existing IP issuance limiter. It NEVER sends an outbound message, even with consent and valid Meta configuration. It returns a server-configured bot link with `status` prefilled. The customer must open it and send from the entered phone. Opening the link alone does not send anything.
- That inbound message is authenticated by the bot's existing Meta HMAC signature and business phone ID checks. Existing `status` handling calls the authenticated, phone-scoped internal lookup and replies only to the inbound sender. It never issues another token. Multiple active tickets require selection. Served/declined/no-show tokens are not retrievable through this active-only flow. The public form explains this handoff rather than promising automatic delivery.
- Admin `/api/v1/tokens` permits opt-in copies only for an authenticated user with role `admin`, in that user's institution. The checkbox attests the customer explicitly requested one copy at the supplied number. Other authenticated roles can continue issuing tokens without a copy. Administrators must obtain genuine consent and verify the intended recipient; the API cannot prove that attestation.
- The backend makes one Meta utility-template submission after committing issuance, using Python's standard-library HTTPS client in a worker thread with an 8-second socket timeout. There is no new HTTP dependency or public send endpoint. Template name, language, recipient and parameters cannot be overridden by browser-provided template/text fields. The recipient is the validated issued-token phone, parameters come from the issued token and owned counter.
- No free-form proactive messages are used: website entry does not open WhatsApp's 24-hour customer-service window. Bot status replies are in response to a customer's actual inbound message and use the existing session-message flow. Existing bot notification helpers have other hard-coded templates, so they are not repurposed for admin token copies.
- Delivery failure never rolls back issuance or triggers another token or automatic send retry. Broadcast failures after issuance are also best effort. The UI keeps the issued ticket and explicitly warns against creating another token to retry delivery.

## Configuration

Backend environment variables (never `NEXT_PUBLIC_*`):

| Variable | Value |
| --- | --- |
| `WHATSAPP_BOT_NUMBER` | The actual bot's full international number, e.g. `+15555550123`. Not a Meta phone-number ID and not an arbitrary institution contact number. Required for public handoff. |
| `WHATSAPP_TOKEN` | Server-only Meta access token authorized for the business phone. Required for admin copies. |
| `PHONE_NUMBER_ID` | Meta business phone-number ID. Required for admin copies. |
| `WHATSAPP_API_VERSION` | Supported Graph version, backend default `v23.0`; verify Meta support at deployment. |
| `WHATSAPP_COPY_TEMPLATE` | Exact name of your **approved utility template**. Empty by default disables admin sending. |
| `WHATSAPP_COPY_LANGUAGE` | Exact approved locale, e.g. `en_US`. Required explicitly; no guessed translation. |

Create and obtain Meta approval for a utility template with **two positional body parameters, in this exact order**:

1. Token number, e.g. `GEN-0001`.
2. Counter name, e.g. `General`.

Example template body: `Your requested queue token is {{1}} for {{2}}. Please keep this copy for your visit.`

Use a template without required header/button parameters; this integration sends only the two body parameters. Meta categorization/approval is not automatic. Ensure the configured business identity appropriately represents every institution using this deployment; per-tenant Meta senders/templates are not implemented. The template does not contain the customer's name or other arbitrary customer text.

Both Compose files forward these backend settings; `docker-compose.prod.yml` is ignored by the repository's existing rules. When deploying without Compose, supply them to the backend service yourself. Public handoff additionally requires the existing bot configuration, HTTPS webhook with `WHATSAPP_APP_SECRET`, matching `PHONE_NUMBER_ID`, Redis/session configuration, `BACKEND_API_URL`, and a strong shared `INTERNAL_API_KEY`. Set `PUBLIC_WEB_URL` on the bot for reachable tracking links. Missing copy settings fail closed without preventing token issuance.

**Cost:** approved utility templates can be billable under Meta's current per-message/category/market rules, particularly outside the customer-service window. Do not assume a free tier or that utility messages are always free. Review current Meta pricing, spending limits and recipient consent policy before enabling. Admin attestations are a trust boundary, not a billing quota. Public web submissions cannot amplify paid outbound messaging through this feature. The existing public limiter is process-local, not a distributed abuse-control system.

## API Result

Issuance responses add `notification: {status, action_url}`. Ordinary token lookups/lists may return `notification: null`; they do not rerun notification attempts.

| Status | Meaning |
| --- | --- |
| `not_requested` | No consent; no notification attempt or link. |
| `action_required` | Public handoff is available; `action_url` is the bot `wa.me` URL. Nothing sent yet. |
| `unavailable` | Required copy configuration is missing/invalid. Token still issued. |
| `accepted` | Meta returned a message ID. **Not a delivery receipt.** |
| `failed` | Meta rejected the request (or recipient validation failed). Token still issued. |
| `unknown` | Timeout, network failure or unexpected response; Meta may have accepted it. No automatic retry. |

These are per-request outcomes, not persisted delivery state or a durable consent audit. No delivery-receipt processor, outbox, retry endpoint or idempotency key was added. A lost entire HTTP response, process crash, or manual repeated issuance can still duplicate tokens under the pre-existing issuance contract. Do not retry issuance as a delivery retry. Phones saved at issuance are not independently verified; historical wrong/recycled/shared numbers remain attribution risks in the existing phone-linked lookup.

## Verification

Run backend unit tests from a safe directory without an environment file, using the backend on `PYTHONPATH`, an isolated test environment and SQLite. `tests/test_token_copy.py` overrides Meta settings with fake values and mocks all outbound HTTPS. It covers explicit/default consent, phone normalization, public handoff/no-send/rate limiting, admin authentication/role/tenant checks, configured template parameters, missing config, Meta rejection, timeout, malformed responses, persistence after failure and broadcast failure.

The browser test stays under `backend/tests` so frontend changes remain limited to the owned public join page and admin form. Install `esbuild` and `@playwright/test` in a disposable tooling directory, with Microsoft Edge available, then run:

```text
node backend/tests/token-copy-ui.cjs <tooling-directory>/node_modules
```

It bundles the actual forms, mocks all browser HTTP, and checks eight scenarios across desktop/mobile viewport sizes: labels and unchecked defaults, consent/phone validation, server payloads, select display labels, public handoff, unavailable/failure/unknown states, Meta acceptance wording and consent reset. No live server, credentials or real messages are used. It does not replace a styled visual/accessibility audit.

Also run `npm test` and `npm run build` in `whatsapp-bot`, plus `npm run build` and targeted ESLint in `frontend`. Full live Meta delivery, approved-template provisioning and provider billing are deployment responsibilities, not exercised by automated tests.
