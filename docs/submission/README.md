# Submission kit — 2026-09-03

The goal is a defensible local demonstration, not an unsupported production claim.
The [official Buildathon page](https://razorpay.com/buildathon/) requests a public
repository, five-minute pitch and architecture. Track 02 emphasizes held-out
precision/recall, false-positive cost and defense-only behavior. The inspected
page does not list a public deployment URL as a requirement. Confirm any additional
requirements in the [application form](https://forms.gle/d9r2gvxp8cmoZhon9).

## Ready locally

- **Latest:** [Native-1080p recruiter pitch](FINAL_1080P_NARRATION.md), following
  dashboard → architecture → suspicious/legitimate comparison → counterfactual →
  evidence-bound investigation → human review/audit → measured ML/business impact →
  security → debugging. It uses the preferred synthetic voice and no bottom captions.
  The generated local file is intentionally excluded from Git.
- [Recruiter-pitch media verification](../verification/recruiter-pitch-2026-09-03.md).
- [Earlier risk-operations demo and narration](RISK_OPERATIONS_NARRATION.md).
- [Professional-upgrade coverage / technical decisions](../decisions.md) and [failures and fixes](../failures-and-fixes.md).

- [Architecture](../ARCHITECTURE.md) and root README setup instructions.
- [Measured evaluation, cost tradeoffs and limitations](../EVALUATION.md).
- [Aggregate frozen-model replay with hashes](../verification/submission-metrics-2026-08-31.json).
- [Current validation report](../verification/submission-validation-2026-08-31.md).
- [Five-minute demo script and recording instructions](DEMO_SCRIPT.md).
- [New authentication-first live tour and own-voice script](LIVE_TOUR_NARRATION.md).
- [Live recording verification and known limitations](../verification/live-feature-tour-2026-08-31.md).
- [12-field application answer sheet](APPLICATION_ANSWERS.md), aligned to the applicant-supplied form fields.
- [Actual synthetic-data screenshots](screenshots/), including sender/receiver evidence.
- PostgreSQL fresh/existing/downgrade coverage; the prior migration fix is preserved.
- Separate, isolated browser rehearsal with human decision/audit assertions.

## Owner approval / external steps still outstanding

1. The owner made the repository public; **PUBLIC verified on 2026-08-31** through
   GitHub's repository API. Review the publication diff and full history for
   secrets, private material and dataset licensing. Do not upload competition CSVs, candidate pickle
   files, merchant databases, `.env`, tokens or browser traces containing tokens.
2. GitHub Actions run `33718111412` passed migrations, backend/ML tests, dependency
   audits, TypeScript/build checks, browser E2E, and both Docker builds on commit
   `f21a892`. Re-check the workflow attached to the newest commit before submission.
3. Review the new **authentication-first continuous browser tour**, which uses
   visible recording captions. A separate `-narrated.mp4` now adds AI-generated
   narration at the owner's request; the silent original remains available.
   See [the narration guide](LIVE_TOUR_NARRATION.md). The earlier synthetic-
   voice screenshot draft is preserved but superseded. The final pitch-summary
   card is explicitly labeled and is not an application screen.
4. The 12 form fields are now supplied and mapped. Provide truthful personal
   details, graduation year, September availability, the 6/12-month choice and
   resume. Supply any character limits so the build responses can be shortened.
5. Publish the reviewed video, verify both links signed out, and explicitly approve
   final submission. Nothing has been submitted or uploaded by this work; the
   owner changed the repository visibility independently.

## Do not claim

- That synthetic results measure merchant production performance.
- That the ordinary app uses IEEE-CIS or that the candidate passed promotion gates.
- That contextual contribution bars are SHAP, or local lexical retrieval is a
  production embedding/Gemini service.
- That risk-index or heuristic investigation “confidence” labels are calibrated
  likelihood of guilt. Risk scores and probabilities are different quantities.
- That flagged transaction value or modeled cost reduction is realized loss prevention.
- That a passing Docker/CI/security scan is a production security certification.
- That this kit was submitted or that users/revenue exist.

## New full feature-tour recording

```bash
RAZORSHIELD_E2E_UI_PORT=5175 RAZORSHIELD_E2E_API_PORT=5003 RAZORSHIELD_RECORD_FEATURE_TOUR=1 RAZORSHIELD_E2E_RECORD=1 pnpm --filter @workspace/razorshield-ai e2e feature-tour.spec.ts --workers=1
```

Add `RAZORSHIELD_TOUR_FAST=1` for the quick rehearsal without timed pauses.
The tour is opt-in and skips in ordinary CI. It uses the same isolated temporary
database and separate ports as the shorter rehearsal below. Visible caption
annotations exist only inside the test browser; application source is unchanged.
The source recording is 1440 × 1000. No microphone or synthetic narration is used.

Export after the recording test passes, before another Playwright run cleans its
output directory:

```bash
backend/.venv/bin/python scripts/export_feature_tour.py --recording artifacts/razorshield-ai/test-results/feature-tour-authentication-first-feature-tour-chromium/video.webm
```

This preserves a source WebM beside the MP4, exports exactly five minutes at
normal speed, and refuses to overwrite existing outputs. It does not add audio.
Use `--output` with a different filename for another take.

To add the owner-authorized AI narration without modifying the source video:

```bash
backend/.venv/bin/python scripts/narrate_feature_tour.py
```

Requires macOS `say`, FFmpeg and access to the local speech service. The script
uses the Rishi voice, adjusts short spoken sections to fit the chapter timings,
normalizes audio level, and copies the original video stream without re-encoding.
The output is `outputs/submission/razorshield-authentication-feature-tour-narrated.mp4`.
Existing outputs are never overwritten. No cloud API, microphone, or cloned voice
is used. The opening narration identifies itself as AI-narrated.

The owner's latest preference is the original draft's default synthetic voice.
Apply that setting to the new live walkthrough with:

```bash
backend/.venv/bin/python scripts/narrate_feature_tour.py --voice default --output outputs/submission/razorshield-authentication-feature-tour-original-voice.mp4
```

This preserves both the silent original and the Rishi-narrated alternative.

The latest owner-requested delivery removes the burned-in bottom captions while
copying the original-voice audio unchanged:

```bash
ffmpeg -n -i outputs/submission/razorshield-authentication-feature-tour-original-voice.mp4 -map 0:v:0 -map 0:a:0 -vf 'crop=1440:900:0:0' -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -c:a copy -movflags +faststart outputs/submission/razorshield-authentication-feature-tour-no-captions.mp4
```

This trims the bottom 100 pixels, including the recording-caption strip.
All prior versions are retained. Use the `-no-captions.mp4` version for the latest handoff.

Known limitation found during rehearsal: chargeback mutation endpoints reconstruct
transaction IDs with a `TX-` prefix. Imported IDs such as `FULL-TX-0002` can be
listed but their chargeback summary action returns 404. The recorded chargeback
uses `TX-TOUR-HIGH`, which fits the current contract. This issue remains unfixed;
do not claim arbitrary-ID chargeback support or an all-features production pass.

## Stable rehearsal

Run the root README setup, then:

```bash
RAZORSHIELD_E2E_UI_PORT=5175 RAZORSHIELD_E2E_API_PORT=5003 RAZORSHIELD_E2E_RECORD=1 pnpm --filter @workspace/razorshield-ai e2e
```

This starts separate servers and a fresh UUID SQLite database, never reuses the
merchant's running instance, and stops the servers afterward. Synthetic temporary
databases remain in the OS temp directory for diagnosis; no application data is reset.
The recording and captures are under `artifacts/razorshield-ai/test-results/`.
Do not publish raw Playwright traces or authentication request attachments.

The test sends the two versioned golden examples through the authenticated API,
opens their evidence screens, verifies sender/receiver references, waits for the
bounded investigation, escalates with a reviewer note, checks audit history,
then signs in as an analyst to inspect monitoring. It does not train or move money.

Before filming, sign in afresh: access tokens expire after 15 minutes. Allow data
to finish loading before capture. Avoid uploading another dataset midway, because
that changes active scope. Explain the observed 6/100 LOW and 100/100 HIGH fixture
outputs rather than forcing the illustrative 91/100 from the original pitch idea.
