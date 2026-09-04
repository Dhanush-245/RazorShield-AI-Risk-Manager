# RazorShield — application answers

Aligned to the 12 fields supplied by the applicant. This is a preparation sheet,
not a submitted form. Bracketed fields require the applicant's information.
Word/character limits have not been supplied. Review the technical account and
describe your own contributions accurately before submitting.

## About you

### 1. Full name

[Your full name as it should appear on the application]

### 2. College

[Official college name]

### 3. Graduation year

[Your graduation year]

### 4. In-person from September

[Yes or No — confirm your actual availability]

### 5. Internship duration

[6 months or 12 months — your choice]

### 6. Resume file

[Attach your current resume in a format accepted by the form]

No resume was supplied for this submission kit. Do not invent education,
experience, achievements or personal contributions. Check that resume claims
match the project's demonstrated capabilities and evaluation limitations.

## About the build

### 7. Your track

Track 02 — AI Risk Manager

### 8. Project name

RazorShield AI

### 9. What it solves

RazorShield AI helps merchant risk teams investigate potentially fraudulent
transactions instead of acting on a score alone. It combines trained fraud
models with anomaly, behavioral, velocity, graph and rule signals, then shows
the supporting evidence, sender and receiver account details, and missing
information. A human reviewer records the final decision with an audit trail;
the investigator cannot execute financial actions. The local demo uses
synthetic data, while a separate IEEE-CIS candidate has reproducible held-out
evaluation and false-positive cost analysis. Neither is presented as an
approved production fraud detector.

### 10. GitHub repository URL — public

https://github.com/Dhanush-245/RazorShield-AI-Risk-Manager

**Verified PUBLIC on 2026-08-31** using GitHub's repository API after the owner
changed visibility. Review the latest GitHub Actions result, repository history,
secret scan, and dataset licensing before submitting. Public visibility alone does
not establish that the newest commit passes remote CI.

### 11. Five-minute pitch video

[Paste the reviewed public or unlisted video URL]

Local materials already prepared:

- `outputs/submission/razorshield-final-submission-1080p-natural-voice.mp4`: latest
  local native-1080p product recording with disclosed AI narration, synchronized
  values, natural pacing, and no bottom caption strip. Generated media is excluded
  from Git and must be hosted separately.
- [Exact final narration and timing](FINAL_1080P_NARRATION.md).
- `outputs/submission/razorshield-authentication-feature-tour-no-captions.mp4`:
  earlier authentication-first delivery, retaining the original synthetic voice without the bottom caption strip.
- `outputs/submission/razorshield-authentication-feature-tour-original-voice.mp4`:
  preferred revision using the first draft's default synthetic voice with the new live tour.
- `outputs/submission/razorshield-authentication-feature-tour-narrated.mp4`:
  five-minute live browser tour with AI-generated narration, added at the owner's request.
- `outputs/submission/razorshield-authentication-feature-tour.mp4`: new continuous
  authentication-first browser tour with visible captions; no synthetic voice.
- [Natural own-voice narration and tour coverage](LIVE_TOUR_NARRATION.md).
- `outputs/submission/razorshield-five-minute-draft.mp4`: 5:00.02 narrated
  screenshot walkthrough with a synthetic system voice. Superseded; retained only
  as an earlier draft. Not continuous live footage.
- `outputs/submission/live-browser-rehearsal.webm`: actual silent browser-test recording.
- [Recording guide and script](DEMO_SCRIPT.md).

A local file path is not a submission link. Review the full video, preferably
record the pitch in your own voice, publish it to your chosen host, and verify
that reviewers can play it without requesting access. Do not expose credentials
or licensed raw datasets. No video has been uploaded by this work.

### 12. What broke, and how you got out

During validation, the PostgreSQL migration failed with `type "user_role"
already exists`, even on a fresh database. The problem was duplicate ownership
of enum creation: the auth migration explicitly created the type, then
SQLAlchemy's table-create hook tried to create it again.

We reproduced the failure, traced all 11 Alembic revisions, and changed the enum
declaration to PostgreSQL `ENUM(..., create_type=False)`, retaining the explicit
checked create/drop calls. We did not delete the enum or blindly stamp migration
history. Regression tests now verify fresh databases, existing revisions,
preserved user records, pre-existing enum reuse, and downgrade/re-upgrade safety.

A later GitHub Actions failure exposed an import-path dependency hidden by the
local shell: tests could not import `ml`. Explicit pytest paths and module-based
test invocation fixed it. GitHub Actions run `33718111412` now passes migrations,
backend/ML tests, dependency audits, browser E2E, and both Docker builds.

The lesson was that “works locally” is not sufficient evidence. The environment,
migration history and verification command must be reproducible too.

#### Short version, if the form has a tight limit

PostgreSQL migrations failed because `user_role` was created twice: explicitly
by the auth migration and implicitly by SQLAlchemy's table hook. We reproduced
it, inspected all 11 revisions, and disabled implicit creation while retaining
checked enum lifecycle calls. Regression tests cover fresh/existing databases,
user preservation and safe downgrades. We also fixed a CI import-path dependency.
Locally, 70 backend/ML tests and two browser tests pass; remote CI still needs a
new run. The lesson: verify a reproducible environment, not just a working laptop.

## Supporting evidence — not extra form fields

- [Held-out metrics, cost tradeoffs and limitations](../EVALUATION.md).
- [PostgreSQL root cause and regression results](../verification/postgresql-enum-migration-2026-08-31.md).
- [Final local validation and remote CI distinction](../verification/submission-validation-2026-08-31.md).

Submission remains pending the applicant's personal details, resume, duration
choice, reviewed repository updates, hosted video and final review.
