# Phases — AI-QMS

> Maps your proposal's methodology (Section 8) onto concrete build phases, so work can be picked up mid-project without losing track of where things stand. This file describes the plan; `memory.md` tracks actual progress against it.

## Phase 0 — Project Setup
- Repo scaffold matching `architecture.md`, `docker-compose.yml`, `.env.example`, base FastAPI app, base Next.js app
- *Depends on:* nothing · *Blocks:* everything else

## Phase 1 — Research & Requirements *(maps to proposal Step 1)*
- Mostly complete via the proposal itself; finalize dataset sources
- ML approach decided: Random Forest (primary) + linear regression baseline for wait-time prediction, pandas aggregation for peak/off-peak detection — see `architecture.md` §2

## Phase 2 — Data Collection & Preprocessing *(maps to Step 2)*
- Run the Google Form survey, gather public datasets
- Build the cleaning/normalization pipeline: missing values, time-based normalization, categorical encoding

## Phase 3 — Backend Foundation
- DB models: `User` (with `role`: admin/staff), `Institution`, `Counter`, `Personnel`, `Token`
- Alembic migrations
- Auth (`api/v1/auth.py`): JWT access + refresh tokens, bcrypt password hashing, role checks, institution-scoped query access — see `architecture.md` §5
- Base institution CRUD

## Phase 4 — Core Queue/Token APIs
- `queue_service`, `token_service`
- `api/v1/counters.py`, `tokens.py`, `queue.py`
- WebSocket manager for live queue state

## Phase 5 — ML Model Development *(maps to Step 3)*
- Train/evaluate Random Forest against the linear regression baseline in `ml-notebooks/`; try XGBoost/LightGBM if data volume justifies it
- Build the peak/off-peak aggregation logic (pandas groupby on hour-of-day / day-of-week)
- Promote the winning wait-time model + `predictor.py` into `backend/app/ml/`
- Build `optimizer.py` for counter/staff allocation — this consumes `predictor.py`'s and the peak-detection output rather than being its own trained model

## Phase 6 — Web Application *(maps to Step 4)*
- Dashboard pages: `overview`, `tokens`, `counters`, `personnel`, `live-queue`, `analytics`
- Wire real-time updates into the UI

## Phase 7 — WhatsApp Integration
- Conversational token generation and active-token lookup implemented, including institution-scoped confirmed intake reuse and priority-review status.
- One-off consent-based copies retained. Lifecycle notifications (called/served/rescheduled) explicitly deferred by user; no automatic event delivery is claimed.

## Committee Follow-Up — Intake And Accessibility Priority
- Implemented: required customer CNIC/referral (optional admin), hospital-only requested accessibility priority, staff/admin verification, shared ordering/positions and nonpreemptive dispatch, frontend/bot flows and privacy tests.
- Migration and coordinated rollout required; actual application DB migration and live Meta smoke remain pending. See current `memory.md` checkpoint, not older completion entries.

## Phase 7-v2 — Role-Based Workflow & Institution IDs *(user-directed rework of the web app's auth/UX)*
- Institution short codes (`SHR016`) generated at registration; two-step login (code → verify → credentials)
- Admin/staff route split: admin dashboard + management tabs (staff/counters) + settings w/ institution danger zone; staff workspace (counter claim, presence, decline-with-reason) + settings
- Backend: staff self-service router, admin overview aggregate, presence over WS envelopes, personnel create-with-account/reset-password/set-login, institution purge, `declined` token state, `served_by` stamping — see `memory.md` 2026-08-24 entry for detail

## Phase 8 — Deployment & Training *(maps to Step 5)*
- Integrate the trained model into the backend
- Guarded shadow integration verified; live RF promotion remains blocked. Historical artifact includes a post-service feature and dataset-local numeric IDs. Empirical/heuristic live estimates retained. Raw workbooks were restored but require validated preprocessing; no corrected candidate has been promoted. Synthetic-data experimentation is a separate, explicitly labelled future task.
- Demo target: local Docker Compose, then Render backend/bot plus Vercel frontend with Neon and Upstash. Configuration prepared; cloud deployment not performed. Default CI/Compose exclude CV; keep CV code and manual opt-in workflow for future work. Kubernetes/Oracle are not prerequisites for this demo.

## Phase 9 — Testing & Evaluation *(maps to Step 6)*
- Technical evaluation: prediction accuracy, latency, web performance
- User testing with real users (students, patients, staff) for usability/accessibility
- Compare before/after metrics per `prd.md` §7 success metrics
