# Authentication-first live pitch — own-voice guide

**Latest delivery:** `outputs/submission/razorshield-authentication-feature-tour-no-captions.mp4`
removes the bottom recording-caption strip at the owner's request. Because the
captions were burned into the footage, the bottom 100 pixels were cropped,
producing 1440 × 900 video. The original-voice audio is copied unchanged. The
captioned versions remain available; this edit does not recover content that
was hidden beneath the original caption overlay.

**Preferred voice revision:** the owner preferred the initial draft's synthetic
voice. `outputs/submission/razorshield-authentication-feature-tour-original-voice.mp4`
uses that same default macOS speech setting with the updated live walkthrough.
It starts at 155 words/minute, adjusting only where needed to fit a chapter.
The silent and Rishi-narrated versions remain available; no visuals were replaced.

Preferred replacement for the synthetic-voice screenshot draft. The new recording
is continuous browser footage with visible recording captions, followed by an
explicitly labeled presentation card. It contains **no generated voice or audio**.
Read this in your own voice; leave natural pauses while the interface changes.
Use truthful ownership language when discussing work assisted by coding tools.

**AI-voiced version:** at the owner's subsequent request, a separate
`outputs/submission/razorshield-authentication-feature-tour-narrated.mp4` adds
disclosed local synthesized narration using the macOS Rishi voice. The original
silent version remains unchanged. Shortened spoken edits fit all 22 chapter slots;
the exact delivered wording and durations are in the adjacent narrated `.json`
report and the versioned `scripts/narrate_feature_tour.py` generator.

## 0:00–0:20 · Authentication / problem / track

“Hi, this is RazorShield AI, for Track Two: AI Risk Manager. A merchant needs more
than a red risk score. They need to know what happened, who paid whom, and what
to check next. I'll start at login. This is a fictional-data demo with four
different permission levels.”

## 0:20–0:34 · Dashboard

“The dashboard gives the risk team a starting point: current activity, dangerous
patterns, and cases that need attention. These numbers come from the active
dataset. They aren't claims about real customers or money saved.”

## 0:34–0:54 · Dataset upload

“I'm uploading twenty-four fictional transactions. They include customer names,
sender and receiver account references, bank information, and behavioral context.
The conversion report shows how the input was interpreted. This small file is
for testing the workflow, not for proving model accuracy or retraining a model.”

## 0:54–1:04 · Transaction ledger

“The ledger keeps the transaction and its investigation connected. Uploads,
manual entry, and the risk assessment API all feed the risk workflow.”

## 1:04–1:24 · Normal payment

“Let's assess an ordinary utility payment. The amount is close to the customer's
usual spending, the recipient is familiar, and activity is normal. The system
returns low risk. That is a recommendation—not a guarantee that every detail
has been independently verified.”

## 1:24–1:42 · Elevated risk

“Now I'll change the evidence: a much larger amount, unusual activity, failures,
and an unfamiliar recipient. The result moves to high risk and manual review.
The important point is that it does not execute a financial action.”

## 1:42–1:54 · Architecture / explanation

“Fraud, anomaly, behavior, velocity, graph, and rules feed risk fusion. The
explanation connects the score to evidence. Unusual doesn't automatically mean
fraud, and these contribution bars aren't SHAP.”

## 1:54–2:12 · Both parties

“Here's the full-party example: Diya Patel paying Rapid Digital Exchange. A
reviewer can inspect both sides: names, account references, banks, and contact
details. All of this is fictional. Having a field in a dataset isn't the same
as verifying it with a bank.”

## 2:12–2:26 · Investigation

“The investigator organizes evidence, identifies missing information, and
retrieves policy. This local version uses bounded, deterministic orchestration,
not a production LLM service. You can inspect its steps. Financial action
executed: no.”

## 2:26–2:44 · Human review

“I'll switch to the reviewer role. The reviewer can approve, reject, escalate,
or ask for evidence. Here, I add a note and escalate for recipient verification.
The decision belongs to the human, not the model.”

## 2:44–2:52 · Audit

“The audit trail preserves the assessment, investigation, and reviewer decision.
We can trace how the case reached this state.”

## 2:52–3:00 · Fraud intelligence

“Back as admin, fraud intelligence highlights concentrations that deserve a
closer look—not a verdict about a person.”

## 3:00–3:08 · Network

“The network shows shared devices and recipient relationships. Connections
provide context; they don't prove collusion.”

## 3:08–3:16 · Customer history

“Customer 360 brings the customer's history and known context into one view,
so transactions aren't investigated in isolation.”

## 3:16–3:24 · Returns

“Return risk is a separate workflow. The reviewer can inspect its drivers
without treating every return as payment fraud.”

## 3:24–3:38 · Chargebacks

“For chargebacks, the system organizes available evidence into a draft. Missing
evidence stays missing. I'll send this for review. Nothing is submitted to an
external payment provider. This path currently needs a TX-prefixed transaction ID.”

## 3:38–3:44 · Analytics

“Analytics summarizes the portfolio. Flagged value is not realized loss prevention.”

## 3:44–4:00 · Monitoring / honest results

“The deployed fusion model's held-out synthetic precision is about thirty-six
percent, and recall about fifty-two percent. Those results need improvement.
I wouldn't present a working interface as proof of production-quality fraud
detection.”

## 4:00–4:16 · Evaluation / cost

“The separate IEEE candidate reaches about fifty percent precision and
fifty-two percent recall. It hasn't passed promotion. Thresholds also change
business cost: catching more fraud can create a review workload beyond the
team's capacity.”

## 4:16–4:26 · Settings

“Admins can configure thresholds and policies. This tour doesn't change them,
retrain models, or enable autonomous financial actions.”

## 4:26–4:34 · Viewer

“Finally, viewer access is read-only. Assessment and human-review controls are
not available to this role.”

## 4:34–5:00 · What broke / repo / close

“What broke? PostgreSQL tried to create the same user-role enum twice: once in
our migration and again through SQLAlchemy's table hook. We disabled the implicit
creation and kept explicit lifecycle checks. Regression tests cover fresh and
existing databases, preserved users, and downgrades. Local checks pass; remote
CI still needs a new passing run. The repository is public. The aim is
reviewable evidence and accountable decisions, with limitations made visible.”

## Submission handoff

- Public source: https://github.com/Dhanush-245/RazorShield-AI-Risk-Manager
- Video: `outputs/submission/razorshield-authentication-feature-tour.mp4`
- Public/unlisted video URL: still needs owner upload and playback verification.
- Application fields: [all 12 answers](APPLICATION_ANSWERS.md).
- Personal name, college, graduation, September availability, duration and resume
  belong in the form; they have not been invented or added to the recording.

The tour demonstrates the principal feature areas, not every button or failure
case. API integration, OTP delivery, model training and external submission are
not performed on camera. The final card is a presentation summary, not live CI
output. Evaluation numbers come from the frozen replay linked in the submission
checklist, not from the 24-row demonstration upload.

**Known issue found during rehearsal:** chargeback actions reconstruct a `TX-`
transaction ID. Other uploaded formats such as `FULL-TX-0002` can return 404 even
though the chargeback list displays them. The recorded chargeback uses the
supported `TX-TOUR-HIGH` ID. No application fix was made in this recording task;
the limitation must not be presented as resolved.

For a voiced final version, record one clean voice memo while watching the video.
Use a quiet room and your normal speaking pace. Send the audio for synchronization;
do not replace it with another synthetic narrator unless you explicitly want one.
