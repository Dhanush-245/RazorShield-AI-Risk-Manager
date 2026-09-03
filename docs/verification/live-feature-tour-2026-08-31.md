# Authentication-first recording validation — 2026-08-31

## Preferred original-voice revision

The owner subsequently preferred the first draft's synthetic voice. The file
`outputs/submission/razorshield-authentication-feature-tour-original-voice.mp4`
uses the original generator's default macOS `say` voice setting, starting at
155 words/minute. It is 300.000 seconds, 26,691,919 bytes, H.264/AAC. All 22 spoken
sections fit their slots. The video stream hash matches the source and previous
narrated version below; the walkthrough and captions are unchanged. All earlier
versions are preserved. This comparison verifies the voice configuration used
by the original generator, not a subjective listening assessment.

## Subsequent owner-authorized AI narration

`outputs/submission/razorshield-authentication-feature-tour-narrated.mp4` adds
local macOS Rishi synthesized speech at the owner's request. It is 300.000 seconds,
27,706,896 bytes, with 1440 × 1000 H.264 video and 48 kHz mono AAC audio. All 22
spoken segments fit their allotted slots without clipping. The opening identifies
the narration as AI-generated; the earlier silent version is preserved.

Full audio/video decode completed successfully. Measured audio mean is -16.7 dB
and peak -1.4 dB. The source and narrated files' compressed video streams share
SHA-256 `bb22fad850c43ef75fc5726a27a9e950beef4e7c4b974ed9f72da7e1dfce6422`:
the recorded visuals and captions were not re-encoded or changed. Ruff and git
whitespace checks pass. This is technical validation, not a claim of a human
listening review. Exact shortened narration and timings are in the adjacent
`.json` report. No application code, database, or model was changed.

## Deliverable

- MP4: `outputs/submission/razorshield-authentication-feature-tour.mp4`
- Exactly **300.000 seconds**, 1440 × 1000, H.264, 21,302,453 bytes.
- Continuous isolated-browser recording at normal speed, with visible caption
  annotations and a labeled pitch-summary card at the end. Not a screenshot slideshow.
- **No audio track or synthetic narrator.** An applicant voice recording is still
  needed for a voiced pitch; see [the natural narration guide](../submission/LIVE_TOUR_NARRATION.md).
- Original 302.480-second WebM preserved beside the MP4. Export trims only the
  last 2.48 seconds of the closing card. Earlier draft recordings remain intact.

The repository was confirmed PUBLIC via `gh repo view` after the owner changed
visibility. No video upload, GitHub push, or form submission occurred in this task.

## Verification performed

| Check | Result |
| --- | --- |
| Fast, authentication-first 22-chapter rehearsal | Passed, 7.4 seconds test time |
| Full paced recording | Passed, approximately 5.1 minutes including setup |
| Ordinary browser suite after recording | 2 passed, 1 intentionally skipped opt-in tour; 9.6 seconds total |
| Application TypeScript check | Passed |
| Explicit TypeScript check of recording spec/config from frontend package | Passed |
| Prettier check for spec/config | Passed |
| Ruff format/check for export script | Passed |
| Git whitespace check | Passed |
| Export metadata | 300 seconds, H.264, correct dimensions, video-only |
| Visual review | Login, low/high scores, party evidence, chargeback, monitoring, evaluation and closing card inspected |

The backend/ML suite was not rerun for this recording-only change. The 70-test
result on the closing card comes from the earlier same-day validation report;
it is labeled local evidence, not a fresh remote CI run. The latest inspected
remote run remained failed at Python test collection.

## Actual workflow coverage

The tour signs in as Admin, uploads the 24-row/48-column fictional party dataset,
and assesses two additional manual transactions. Observed outputs were LOW **7/100**
and HIGH **100/100**, with manual review recommended for the latter. These are
functional examples, not evaluation estimates.

It shows the ledger, fusion/explanation, sender and receiver details, bounded
investigation, Reviewer login, escalation, audit, fraud intelligence, network,
Customer 360, returns, chargeback drafting/review, analytics, monitoring,
evaluation, settings and Viewer access. It verifies the no-financial-action
indicator and excludes mutation links from Viewer navigation. It does not
exercise every permission boundary, every engine failure or every settings control.

The pitch covers track, project, problem, workflow architecture, public source,
measured ML limitations, business-cost assumptions and “what broke / how we got
out.” Personal form fields, resume and hosted video URL remain owner inputs.

## Known issue discovered, not fixed

The initial chargeback rehearsal returned **404: Chargeback case not found** for
transaction `TOUR-HIGH`. In `backend/app/api/v1/endpoints/platform.py`,
`chargeback_view` removes an optional `TX-` prefix when generating the case ID,
but `chargeback_assessment` always adds `TX-` back. That mapping is not reversible
for uploaded transaction IDs without the prefix, including `FULL-TX-0002`.

The final recording uses `TX-TOUR-HIGH` for the successful chargeback demonstration
and explicitly discloses the format limitation in its caption and narration guide.
Application code was not modified for this recording request. The root-cause
finding must not be described as fixed or as an all-features production pass.

## Isolation and scope

- Fresh UUID SQLite database per rehearsal; temporary ports 5003 and 5175.
- No reuse of the user's running database or servers on 5001/5173.
- No real customer data, raw IEEE files, tokens or private secrets displayed.
- Only public local-demo account identifiers; passwords remain masked.
- No training, model promotion, financial action, OTP delivery or external submission.
- No frontend redesign, backend behavior change or ML/RAG changes.
- Recording additions are opt-in and do not add a five-minute default CI test.

Reproduction commands are in the [submission checklist](../submission/README.md).
