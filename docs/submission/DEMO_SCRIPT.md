# Five-minute demo guide

**Preferred replacement:** [authentication-first live tour and natural narration](LIVE_TOUR_NARRATION.md).
The new recording uses real browser footage, captions and no AI-generated voice.
The screenshot-draft instructions below are retained for historical reference;
do not rerender that synthetic narrator for the current submission.

The exact editable narration is in [demo-chapters.json](demo-chapters.json).
Its ten slots total 300 seconds. All images are actual isolated-test screenshots;
the MP4 draft uses a synthetic system narrator and is explicitly labeled a
screenshot walkthrough. Do not call it a continuous live capture. The separate
`outputs/submission/live-browser-rehearsal.webm` is the real silent browser run.
The rendered draft is `outputs/submission/razorshield-five-minute-draft.mp4`
(300.02 seconds, 1080p, about 6.9 MB). Enable captions to display the chapter
labels and disclosure; the matching SRT is included for players without embedded
caption support. The narration also states the screenshot/synthetic-voice disclosure.

| Time | Show | Message |
| --- | --- | --- |
| 0:00–0:30 | Dashboard | Fraud triage needs evidence, both parties and accountable decisions. Disclose synthetic demo. |
| 0:30–1:00 | Dashboard/workflow | Explain components; bounded local investigator, not a deployed Gemini service. |
| 1:00–1:30 | `SUBMISSION-LOW` | INR 2,000; observed LOW 6/100. Missing evidence still matters. |
| 1:30–2:00 | `SUBMISSION-HIGH` | INR 120,000; novelty, deviation and velocity; observed HIGH 100/100. No guilt or auto-block claim. |
| 2:00–2:30 | Sender/receiver evidence | Names and account references are fabricated; collected is not verified. |
| 2:30–3:15 | Investigation | Structured explanation, policy and uncertainty; SHAP belongs only to separate IEEE candidate. |
| 3:15–3:30 | Reviewer escalation | Note, decision and audit; no financial action. |
| 3:30–4:15 | Monitoring + evaluation report | Separate synthetic and IEEE results, FPR and cost/workload limitations. |
| 4:15–4:40 | Audit + test report | Local checks pass; production and remote CI are separate gates. |
| 4:40–5:00 | Migration story | Duplicate enum creation, exact fix, regression evidence; measurable and reviewable decisions. |

## Render the narrated draft (macOS)

```bash
backend/.venv/bin/python scripts/build_submission_video.py
```

Requires existing `say`, `ffmpeg` and `ffprobe`. No microphone, recording
permission, voice cloning, cloud service, or paid API is used. Existing output is
never overwritten; choose `--output` with a new filename for revisions. Generated
video remains in ignored `outputs/`, not in the Git repository.

## Record the final live pitch in your own voice

1. Run the rehearsal command from [the checklist](README.md). Confirm both tests pass.
2. Use a dedicated synthetic demo database, not a live merchant dataset. Keep
   the real candidate CSV and `.env` off screen. Never show tokens or API keys.
3. Start logged in as Analyst. Submit the two golden examples through the API
   or fill the manual form with the same context. The automated API test is the
   exact reference for the fictional party fields. Do not claim a manually
   demonstrated ingestion mode if the recording uses API submissions.
4. Inspect LOW then HIGH, reveal evidence, and show missing information. The
   investigation runs automatically for sufficiently elevated risk.
5. Switch to Reviewer for escalation and the audit entry. Switch back to Analyst
   for monitoring. Roles are intentionally different; do not bypass access checks.
6. Show [the evaluation table](../EVALUATION.md). Never substitute IEEE's metrics
   for the contextual demo model's results. Mention business costs as assumptions.
7. Follow the timed narration, keeping the total near five minutes. Review audio,
   readability, provenance and URLs before uploading. Replace the draft's
   third-person narration with truthful first-person ownership where appropriate.

## Failure fallback

Sign in again if the 15-minute session expires. If a page is still loading, wait
for actual content, not just its heading. Do not retrain, upload a new dataset or
change thresholds during the demo. If an external candidate artifact is missing,
explain its exclusion and show the checked aggregate report, not a simulated
success. A test recording or screenshot walkthrough can serve as a clearly
disclosed backup; never claim it is live.
