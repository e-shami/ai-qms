# Wait-Time Integration

## Runtime Policy

Customer estimates use the existing tenant-local mean service duration (at least
five served samples by default), or the configurable five-minute-per-person cold
start. Neither is claimed to outperform ML without a prospective comparison.

`GET /api/v1/predictions/wait?counter_id=...` remains authenticated and tenant-scoped.
It returns the live `estimated_wait_min`, `method`, and `avg_service_min`, plus:

- `ml_mode: "shadow_only"`: model output never controls live estimates.
- `ml_estimate_min`: a model-only value, or `null` if no valid inference exists.
- `ml_status`: `shadow`, `unavailable`, `invalid_contract`, `invalid_input`,
  `unknown_service`, or `inference_failed`.

The nullable ML field is an intentional correction to the old API: peak-table
fallbacks must not be labelled model predictions. The web UI displays only the
live estimate. Public tickets, staff queue ETAs, and bot tickets retain their
existing estimation paths. The optimizer now omits invalid ML estimates rather
than presenting the global mean as one; its allocation algorithm is unchanged.
It is a helper, not a newly exposed optimizer endpoint.

## Historical Artifact Audit

The tracked `models/` artifacts are already included by the backend Dockerfile.
They were not retrained or replaced in this integration. The existing metadata
contains `service_time_min` among service one-hot columns: the trainer selected
all `service_*` names and accidentally included a post-service measurement.
Runtime had no such measurement and filled the feature as zero. Runtime also
used `[8:]` rather than the seven-character `service_` prefix when matching
categories. The encoder is fixed, but that cannot repair a fitted model.

The packaged artifact is rejected as `invalid_contract` BEFORE deserialization.
Do not edit its metadata to remove the feature: the fitted trees still need it.
Even corrected contracts are shadow-only: importer IDs are dataset-local numeric
codes (including overlapping institution codes across sources), not live tenant
identities. Hospital queue lengths were absent and imputed to zero; the missing
flag was not a model feature. Free-text counter types also need a validated
mapping to training categories. Unknown categories are explicitly rejected.

The retained live baseline also has limits: it pools service durations across an
institution, uses called-to-completed duration (including call delay), and the
next-token endpoint counts waiting/called tokens rather than residual in-service
work. Public/staff positions include in-service tokens. These pre-existing
semantics are not recalibrated by this change and need a separate measured review.

Recorded historical holdout metrics, NOT corrected-model accuracy:

| Model | MAE (min) | RMSE (min) | R2 | Shuffled CV RMSE (min) |
| --- | ---: | ---: | ---: | ---: |
| Random Forest | 30.84 | 43.20 | 0.1285 | 41.90 |
| Linear regression | 31.38 | 43.30 | 0.1244 | 41.71 |

No significance test supports the old "statistically indistinguishable" wording.
The post-outcome feature and train/serve mismatch prevent treating these scores
as deployment evidence. In a real artifact smoke test with institution 9001,
counter 9002, Monday 10:00 UTC and the legacy zero service vector, RF predictions
for queues 0/1/5/10 were 51.36/51.36/5.82/5.82 minutes. LR raw values were negative
(about -244451 minutes). Those probes demonstrate failure, not accuracy metrics.

## Candidate Workflow

The original collected/processed data is absent from this checkout. Restore it
from a trusted source before running `python -m pipeline.train` in `ml-notebooks`.
The corrected script selects only verified one-hot category columns, learns the
category list from the chronological training partition, keeps the 20% holdout
out of temporal CV, and writes RF plus LR baseline candidates under
`ml-notebooks/data/candidates/`. It does NOT overwrite packaged artifacts.
Candidate scores must be freshly measured; the historical scores do not transfer.

Promotion remains a separate review: use inference-time-only, preferably
identity-free features; retain missing-queue information; agree on target
(arrival-to-service-start versus remaining wait), service mapping, and UTC/local
time semantics. Evaluate chronological and held-out-tenant/source splits against
the empirical/heuristic baseline, check empty/increasing queues and unknown
counters, then validate on prospective real queue outcomes. Do not tune against
the final holdout or claim that removing IDs guarantees improvement.

## Safety And Verification

Joblib/pickle can execute code. Load only reviewed, operator-controlled local
artifacts, never uploads or downloaded third-party pickles. Paths are fixed by
code, not request parameters. Compatible scikit-learn versions are required;
version-mismatch warnings fail inference. Backend pins scikit-learn 1.9.0.
Metadata and dimensional checks are consistency checks, not a security sandbox
or proof of artifact authenticity. Deploy artifact files read-only and restart
workers after replacement (loaded model and metadata are cached).

`backend/tests/test_predictions.py` covers isolated SQLite APIs, tenant boundaries,
model failures, correct encoding, actual historical RF/LR inference, optimizer
behavior, and a temporary fixture-trained candidate serialization round trip.
The fixture is a software test only; no product accuracy claim is made.
Run unittest discovery with `backend` and `ml-notebooks` on `PYTHONPATH`, test
dependencies including `httpx`, and no production environment or database.
