import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";

type Requester = <T>(path: string, init?: RequestInit) => Promise<T>;
type Input = Record<string, string | number | boolean | null>;
type Result = {
  score: number;
  level: string;
  recommendation: string;
  modelVersion: string;
  components: Record<string, number>;
  explanations: string[];
  protectiveEvidence: string[];
  scoreMeaning: string;
};
type Simulation = {
  baseline: Result;
  disclaimer: string;
  persisted: boolean;
  counterfactuals: {
    label: string;
    score: number;
    delta: number;
    level: string;
    changes: Input;
  }[];
  storedScore?: number;
  versionMatches?: boolean;
};
const inputClass =
  "mt-1 min-h-11 w-full rounded border border-[var(--line)] bg-[var(--canvas)] px-3 text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--teal)]";
const percent = (v: number | null | undefined) =>
  v == null ? "Unavailable" : `${(v * 100).toFixed(1)}%`;
const money = (v: number | null | undefined) =>
  v == null
    ? "Unavailable"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }).format(v);
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bench-panel min-w-0 space-y-4 p-5">
      <h2 className="font-display text-xl">{title}</h2>
      {children}
    </section>
  );
}
function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm leading-relaxed text-[var(--muted-ink)]">
      {children}
    </p>
  );
}
function Json({ value }: { value: unknown }) {
  return (
    <pre
      className="max-h-96 overflow-auto rounded bg-[var(--panel-2)] p-4 text-xs"
      tabIndex={0}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
function ErrorMessage({ error }: { error: string }) {
  return error ? (
    <p
      role="alert"
      className="border border-[var(--rust)] p-3 text-sm text-[var(--rust)]"
    >
      {error}
    </p>
  ) : null;
}
function useResource<T>(request: Requester, path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    request<T>(path)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) setError(String(e.message ?? e));
      });
    return () => {
      active = false;
    };
  }, [request, path, revision]);
  return { data, error, reload: () => setRevision((v) => v + 1) };
}
function Score({ result }: { result: Result }) {
  return (
    <Panel title="Measured model response">
      <div className="flex flex-wrap items-end gap-3">
        <strong
          className="font-display text-5xl"
          data-testid="simulation-score"
        >
          {result.score}
          <span className="text-xl"> / 100</span>
        </strong>
        <span className="mb-1 font-bold">{result.level} RISK</span>
      </div>
      <Notice>{result.scoreMeaning}</Notice>
      <div className="space-y-3">
        {Object.entries(result.components).map(([key, value]) => (
          <div key={key}>
            <div className="mb-1 flex justify-between text-sm">
              <span>{key}</span>
              <span>
                {value.toFixed(1)}
                {key === "Fraud probability" ? "%" : " / 100"}
              </span>
            </div>
            <div
              className="h-2 bg-[var(--line)]"
              role="meter"
              aria-label={key}
              aria-valuenow={value}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full bg-[var(--teal)]"
                style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="text-sm font-bold">
        Recommendation: {result.recommendation}
      </p>
      <ul className="list-disc space-y-2 pl-5 text-sm">
        {result.explanations.map((text, i) => (
          <li key={i}>{text}</li>
        ))}
      </ul>
      <details>
        <summary className="cursor-pointer py-3 font-semibold">
          Protective evidence — why not automatically fraud?
        </summary>
        {result.protectiveEvidence.length ? (
          <ul className="list-disc space-y-2 pl-5 text-sm">
            {result.protectiveEvidence.map((text, i) => (
              <li key={i}>{text}</li>
            ))}
          </ul>
        ) : (
          <Notice>
            No protective rule fired for these inputs. A high score is still not
            proof of fraud.
          </Notice>
        )}
      </details>
    </Panel>
  );
}
function Comparisons({ data }: { data: Simulation }) {
  return (
    <Panel title="What would change the decision?">
      <Notice>{data.disclaimer}</Notice>
      {data.storedScore != null && (
        <p className="text-sm">
          Stored score: {data.storedScore}. Recomputed baseline:{" "}
          {data.baseline.score}. Model version{" "}
          {data.versionMatches ? "matches" : "differs — not a historical rerun"}
          .
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--line)]">
              <th className="py-3">Hypothetical change</th>
              <th>Score</th>
              <th>Δ points</th>
              <th>Risk</th>
            </tr>
          </thead>
          <tbody>
            {data.counterfactuals.map((row) => (
              <tr key={row.label} className="border-b border-[var(--line)]">
                <td className="py-3 pr-3">
                  <details>
                    <summary className="cursor-pointer">{row.label}</summary>
                    <Json value={row.changes} />
                  </details>
                </td>
                <td>{row.score}</td>
                <td>
                  {row.delta > 0 ? "+" : ""}
                  {row.delta}
                </td>
                <td>{row.level}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function RiskSimulator({ request }: { request: Requester }) {
  const presets = useResource<Record<string, Input>>(
    request,
    "/workbench/presets",
  );
  const [input, setInput] = useState<Input | null>(null);
  const [data, setData] = useState<Simulation | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (presets.data) setInput(presets.data["Suspicious transfer"]);
  }, [presets.data]);
  const change = (key: string, value: string | number | boolean) => {
    setInput((old) => old && { ...old, [key]: value });
    setData(null);
  };
  return (
    <div className="risk-workbench space-y-5" data-testid="risk-simulator">
      <Notice>
        Sandbox · uses the current risk engines and merchant rules. No
        transaction, case, payment, policy, or training label is saved. Presets
        are fictional examples.
      </Notice>
      <ErrorMessage error={presets.error || error} />
      <div className="flex flex-wrap gap-2">
        {Object.entries(presets.data ?? {}).map(([label, value]) => (
          <button
            className="bench-button"
            key={label}
            disabled={busy}
            onClick={() => {
              setInput(value);
              setData(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {!input && (
        <button className="bench-button" onClick={presets.reload}>
          Reload presets
        </button>
      )}
      {input && (
        <div className="grid items-start gap-5 xl:grid-cols-2">
          <Panel title="Change the evidence">
            <form
              className="space-y-5"
              onSubmit={async (event) => {
                event.preventDefault();
                setBusy(true);
                setError("");
                setData(null);
                try {
                  setData(
                    await request<Simulation>("/workbench/simulate", {
                      method: "POST",
                      body: JSON.stringify(input),
                    }),
                  );
                } catch (e) {
                  setError(String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
                {[
                  ["amount", "Amount (₹)", 0.01],
                  ["customer_average_amount", "Customer baseline (₹)", 1],
                  [
                    "transactions_last_5_minutes",
                    "Transactions / 5 minutes",
                    0,
                  ],
                  ["transactions_last_hour", "Transactions / hour", 0],
                  [
                    "failed_attempts_last_10_minutes",
                    "Failed attempts / 10 minutes",
                    0,
                  ],
                  ["shared_device_accounts", "Accounts on device", 0],
                  ["recipient_risk_score", "Recipient risk (0–1)", 0],
                ].map(([key, label, min]) => (
                  <label key={key} className="text-sm font-medium">
                    {label}
                    <input
                      className={inputClass}
                      type="number"
                      required
                      min={min}
                      max={key === "recipient_risk_score" ? 1 : undefined}
                      step={
                        key === "recipient_risk_score"
                          ? 0.01
                          : key === "amount"
                            ? 0.01
                            : 1
                      }
                      value={Number(input[key] ?? 0)}
                      onChange={(e) =>
                        change(String(key), Number(e.target.value))
                      }
                    />
                  </label>
                ))}
                <label className="text-sm font-medium">
                  Recipient category
                  <select
                    className={inputClass}
                    value={String(input.recipient_category)}
                    onChange={(e) =>
                      change("recipient_category", e.target.value)
                    }
                  >
                    {[
                      "UNKNOWN",
                      "EDUCATION",
                      "UTILITY",
                      "INDIVIDUAL",
                      "ECOMMERCE",
                    ].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                {[
                  ["is_new_device", "New device"],
                  ["is_new_location", "Unusual location"],
                  ["recipient_verified", "Recipient verified (assumed)"],
                  ["recipient_used_before", "Known recipient"],
                ].map(([key, label]) => (
                  <label
                    key={key}
                    className="flex min-h-11 items-center gap-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={Boolean(input[key])}
                      onChange={(e) => change(key, e.target.checked)}
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
              <button
                type="submit"
                className="bench-button w-full"
                disabled={busy}
              >
                {busy ? "Running risk engines…" : "Simulate risk"}
              </button>
            </form>
            <Notice>
              Age is not an optimization control. Recipient verification is only
              an input assumption, not a completed verification check.
            </Notice>
            <details>
              <summary className="cursor-pointer py-3">
                All submitted inputs
              </summary>
              <Json value={input} />
            </details>
          </Panel>
          {data ? (
            <Score result={data.baseline} />
          ) : (
            <Panel title="Ready for an experiment">
              <Notice>
                Run the same fraud, anomaly, behavior, velocity, graph, rules,
                and fusion pipeline. Edit an input and simulate again to
                compare.
              </Notice>
            </Panel>
          )}
        </div>
      )}
      {data && <Comparisons data={data} />}
    </div>
  );
}

type Replay = {
  score: number;
  level: string;
  snapshotStatus: string;
  limitations: string;
  snapshot: {
    sha256: string;
    body: {
      input: Input;
      features: Record<string, number>;
      rules: unknown;
      result: Result;
    };
  } | null;
  observations: {
    label: string;
    value: number;
    observedAt: string;
    source: string;
  }[];
  events: { timestamp: string; event: string; detail: string }[];
  behavioralFingerprint: {
    sampleSize: number;
    averageAmount: number | null;
    amountMin: number | null;
    amountMax: number | null;
    locations: Record<string, number>;
    devices: number;
    recipients: number;
    source: string;
  };
  humanReview: {
    status: string;
    decision: string | null;
    note: string | null;
  } | null;
  feedback: { outcome: string; reason: string; labelStatus: string } | null;
};
export function DecisionWorkbench({
  transactionId,
  request,
  mayReview,
  onChanged,
}: {
  transactionId: string;
  request: Requester;
  mayReview: boolean;
  onChanged: () => void;
}) {
  const replay = useResource<Replay>(
    request,
    `/workbench/transactions/${encodeURIComponent(transactionId)}/replay`,
  );
  const [tab, setTab] = useState("Timeline");
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setSimulation(null);
    setReason("");
    setError("");
    setTab("Timeline");
  }, [transactionId]);
  const data = replay.data;
  async function decide(decision: string, outcome: string) {
    setBusy(true);
    setError("");
    try {
      await request(
        `/risk/reviews/${encodeURIComponent(transactionId)}/decision`,
        {
          method: "POST",
          body: JSON.stringify({ decision, outcome, note: reason.trim() }),
        },
      );
      setReason("");
      replay.reload();
      onChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="risk-workbench bench-panel space-y-4 p-5"
      data-testid="decision-workbench"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl">Investigation workbench</h2>
        <Link className="bench-button" href="/simulator">
          Open risk simulator
        </Link>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Investigation views">
        {[
          "Timeline",
          "What would change?",
          "Human vs model",
          "Data → decision",
        ].map((label) => (
          <button
            key={label}
            className="bench-button"
            aria-pressed={label === tab}
            onClick={() => {
              setTab(label);
              setError("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <ErrorMessage error={replay.error || error} />
      {!data && (
        <button className="bench-button" onClick={replay.reload}>
          Reload evidence
        </button>
      )}
      {data && tab === "Timeline" && (
        <div className="grid gap-5 xl:grid-cols-2">
          <div>
            <h3 className="mb-3 font-semibold">Recorded decision trail</h3>
            <ol className="space-y-4 border-l-2 border-[var(--teal)] pl-4">
              {data.events.map((event, i) => (
                <li key={i} className="text-sm">
                  <time className="text-[var(--muted-ink)]">
                    {new Date(event.timestamp).toLocaleString()}
                  </time>
                  <p className="font-semibold">
                    {event.event.replaceAll("_", " ")}
                  </p>
                  <p className="break-words">{event.detail}</p>
                </li>
              ))}
            </ol>
          </div>
          <div className="space-y-4">
            <h3 className="font-semibold">Evidence observed at assessment</h3>
            {data.observations.map((item) => (
              <div
                key={item.label}
                className="flex justify-between gap-3 border-b border-[var(--line)] pb-2 text-sm"
              >
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
            <Notice>
              These are stored observations, not individually timestamped login
              events or additive risk points.
            </Notice>
            <h3 className="font-semibold">Customer behavioral fingerprint</h3>
            <p className="text-sm">
              {data.behavioralFingerprint.sampleSize} prior transactions ·
              average {money(data.behavioralFingerprint.averageAmount)} ·{" "}
              {data.behavioralFingerprint.devices} devices ·{" "}
              {data.behavioralFingerprint.recipients} recipients
            </p>
            <Notice>{data.behavioralFingerprint.source}</Notice>
            <details>
              <summary className="cursor-pointer py-3">
                Inspect prior behavior
              </summary>
              <Json value={data.behavioralFingerprint} />
            </details>
          </div>
        </div>
      )}
      {data && tab === "What would change?" && (
        <div className="space-y-4">
          <Notice>
            Test one assumption at a time against the frozen enriched inputs.
            Nothing is saved or verified.
          </Notice>
          <button
            className="bench-button"
            disabled={busy || data.snapshotStatus !== "AVAILABLE"}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                setSimulation(
                  await request<Simulation>(
                    `/workbench/transactions/${encodeURIComponent(transactionId)}/counterfactuals`,
                    { method: "POST" },
                  ),
                );
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Comparing…" : "Run counterfactual analysis"}
          </button>
          {data.snapshotStatus !== "AVAILABLE" && (
            <Notice>
              This legacy assessment has no frozen input snapshot. Use the
              standalone simulator; a historical scenario cannot be
              reconstructed faithfully.
            </Notice>
          )}
          {simulation && <Comparisons data={simulation} />}
        </div>
      )}
      {data && tab === "Human vs model" && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Panel title="Model assessment">
              <p className="font-display text-3xl">
                {data.score} / 100 · {data.level}
              </p>
              <Notice>
                A risk signal, not a verdict. Human review remains
                authoritative.
              </Notice>
            </Panel>
            <Panel title="Human judgment">
              <p className="font-semibold">
                {data.feedback?.outcome ??
                  data.humanReview?.decision ??
                  "Awaiting review"}
              </p>
              <Notice>
                {data.feedback?.reason ??
                  data.humanReview?.note ??
                  "No reviewer reason recorded."}
              </Notice>
              <p className="text-sm">
                Case: {data.humanReview?.status ?? "No review case"}
              </p>
            </Panel>
          </div>
          <Notice>
            Reviewer assertions are retained as monitoring feedback. They do not
            overwrite dataset truth labels or retrain the model automatically.
          </Notice>
          {mayReview &&
            data.humanReview &&
            data.humanReview.status !== "RESOLVED" && (
              <>
                <label className="block text-sm font-semibold">
                  Evidence-based reviewer reason
                  <textarea
                    className={`${inputClass} min-h-24 py-3`}
                    value={reason}
                    maxLength={2000}
                    onChange={(e) => setReason(e.target.value)}
                    disabled={busy}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    ["Mark legitimate", "approve", "LEGITIMATE"],
                    ["Confirm fraud", "reject", "CONFIRMED_FRAUD"],
                    ["Request evidence", "request_evidence", "UNDETERMINED"],
                    ["Escalate case", "escalate", "UNDETERMINED"],
                  ].map(([label, decision, outcome]) => (
                    <button
                      className="bench-button"
                      key={label}
                      disabled={busy || !reason.trim()}
                      onClick={() => void decide(decision, outcome)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          {!mayReview && (
            <Notice>
              Only an admin or reviewer can record a final decision.
            </Notice>
          )}
        </div>
      )}
      {data && tab === "Data → decision" && (
        <div className="space-y-3">
          <Notice>{data.limitations}</Notice>
          <p className="text-sm">Snapshot: {data.snapshotStatus}</p>
          {data.snapshot && (
            <>
              <p className="break-all font-mono text-xs">
                SHA-256: {data.snapshot.sha256}
              </p>
              {[
                [
                  "1. Canonical transaction inputs (contact details excluded)",
                  data.snapshot.body.input,
                ],
                ["2. Engineered features", data.snapshot.body.features],
                ["3. Configured rules", data.snapshot.body.rules],
                [
                  "4. Model signals → fusion → structured explanation",
                  data.snapshot.body.result,
                ],
                ["5. Human decision", data.humanReview],
              ].map(([label, value]) => (
                <details
                  key={String(label)}
                  className="border-b border-[var(--line)]"
                >
                  <summary className="cursor-pointer py-3 font-semibold">
                    {String(label)}
                  </summary>
                  <Json value={value} />
                </details>
              ))}
            </>
          )}
        </div>
      )}
    </section>
  );
}

type Health = {
  modelVersion: string;
  metrics: {
    precision: number;
    recall: number;
    f1: number;
    pr_auc: number;
    roc_auc: number;
    false_positive_rate: number;
    confusion_matrix: [[number, number], [number, number]];
  };
  operatingPolicy: {
    mediumProbabilityThreshold: number;
    highProbabilityThreshold: number;
    selection: unknown;
    businessCostAnalysis: unknown;
    source: string;
    policyChanged: boolean;
  };
  dataset: unknown;
  trainedAt: string;
  lastValidatedAt: string | null;
  drift: Record<
    string,
    { status: string; value: number | null; method: string }
  >;
  driftMethod: string;
  referenceSamples: number;
  recentSamples: number;
  referenceWindow: string[] | null;
  recentWindow: string[] | null;
  averageInferenceMs: number | null;
  p95InferenceMs: number | null;
  reviewFeedbackEvents: number;
  reviewDisagreements: number;
  reliability: {
    status: string;
    samples: number;
    ece: number | null;
    brier: number | null;
    bins: Array<{
      lower: number;
      upper: number;
      support: number;
      meanPredicted: number;
      observedRate: number;
      absoluteGap: number;
    }>;
  };
  slices: Array<{
    slice: string;
    support: number;
    status: string;
    metrics: Confusion | null;
  }>;
  sliceMethod: string;
  labelMaturity: {
    windowDays: number;
    suppliedLabeledRows: number;
    matureLabeledRows: number;
    immatureLabeledRows: number;
    status: string;
    limitation: string;
  };
  selectionBiasControl: { status: string; reason: string };
  calibrationDisclaimer: string;
};
type Confusion = {
  threshold: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number | null;
  recall: number | null;
  fpr: number | null;
  reviewRate: number | null;
  cost: number;
};
type Impact = {
  scope: string;
  transactions: number;
  highRisk: number;
  mediumRisk: number;
  pendingReviews: number;
  labeledRows: number;
  immatureLabeledRows: number;
  unlabeledRows: number;
  labelMaturityDays: number;
  selected: Confusion;
  recommended: Confusion | null;
  disclaimer: string;
  projection: {
    withoutSystem: number;
    withSystem: number;
    netEstimatedSavings: number;
    reviews: number;
    reviewRate: number;
    withinCapacity: boolean;
    missedFraudCost: number;
    falsePositiveCost: number;
    reviewCost: number;
  } | null;
  queue: {
    pending: number;
    unassigned: number;
    olderThan24Hours: number;
    oldestAgeHours: number;
    medianAgeHours: number;
    assumedDailyCapacity: number;
    backlogDays: number;
    capacityUtilization: number;
    slaHours: number;
  };
};
type HistoricalReplay = {
  status: string;
  mode: string;
  shadowStatus: string;
  scope: string;
  eligible: number;
  legacyUnavailable: number;
  invalidSnapshots: number;
  modelVersionMatches: number;
  scoreChanges: number;
  championChallenger: {
    status: string;
    champion: string;
    challenger: string;
    comparableRows: number;
    labeledRows: number;
    decisionDisagreementsAt71: number;
    meanAbsoluteScoreDelta: number | null;
    promotionDecision: string;
    limitation: string;
  };
  metricsAt71: Confusion | null;
  dailyQueue: Array<{
    date: string;
    events: number;
    reviews: number;
    fraudLabels: number;
  }>;
  limitations: string;
};
type Pattern = {
  recipient: string;
  customers: string[];
  transactions: number;
  highRisk: number;
  totalValue: number;
  firstSeen: string;
  lastSeen: string;
  transactionIds: string[];
};
export function OperationsConsole({
  request,
  isAdmin,
  mayInvestigate,
}: {
  request: Requester;
  isAdmin: boolean;
  mayInvestigate: boolean;
}) {
  const health = useResource<Health>(request, "/workbench/health");
  const [tab, setTab] = useState("Model health");
  const [impact, setImpact] = useState<Impact | null>(null);
  const [patterns, setPatterns] = useState<{
    patterns: Pattern[];
    disclaimer: string;
  } | null>(null);
  const [stress, setStress] = useState<unknown>(null);
  const [replay, setReplay] = useState<HistoricalReplay | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cost, setCost] = useState({
    threshold: 71,
    review_capacity: 0.05,
    false_positive_cost: 100,
    missed_fraud_cost: 5000,
    review_cost: 50,
    daily_transactions: 100000,
    fraud_rate: 0.012,
  });
  async function run<T>(
    path: string,
    callback: (data: T) => void,
    body?: unknown,
    method = "POST",
  ) {
    setBusy(true);
    setError("");
    try {
      callback(
        await request<T>(path, {
          method,
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const data = health.data;
  return (
    <div className="risk-workbench space-y-5" data-testid="operations-console">
      <Notice>
        Risk operations · measured evidence, explicit assumptions, human
        control.
      </Notice>
      <div className="flex flex-wrap gap-2">
        {[
          "Model health",
          "Business impact",
          ...(mayInvestigate ? ["Connected patterns"] : []),
          ...(isAdmin ? ["Stress lab"] : []),
          ...(mayInvestigate ? ["Historical replay"] : []),
          "Engineering decisions",
        ].map((label) => (
          <button
            className="bench-button"
            aria-pressed={tab === label}
            key={label}
            onClick={() => {
              setTab(label);
              setError("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <ErrorMessage error={error} />
      {tab === "Model health" && (
        <>
          <ErrorMessage error={health.error} />
          <button className="bench-button" onClick={health.reload}>
            Refresh model health
          </button>
          {data && (
            <>
              <Panel title="Deployed fusion — held-out evaluation">
                <p className="text-sm font-mono">{data.modelVersion}</p>
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
                  {(
                    [
                      ["Precision", "precision"],
                      ["Recall", "recall"],
                      ["F1", "f1"],
                      ["PR-AUC", "pr_auc"],
                      ["ROC-AUC", "roc_auc"],
                      ["False-positive rate", "false_positive_rate"],
                    ] as const
                  ).map(([label, key]) => (
                    <div key={key}>
                      <p className="text-sm text-[var(--muted-ink)]">{label}</p>
                      <p className="font-display text-3xl">
                        {(data.metrics[key] * 100).toFixed(2)}%
                      </p>
                    </div>
                  ))}
                </div>
                <Notice>
                  These are the deployed artifact’s recorded evaluation results,
                  not accuracy on the live stream. Synthetic training is not
                  real-world validation.
                </Notice>
                <section className="border border-[var(--line)] p-4">
                  <h3 className="font-semibold">Locked-test confusion matrix</h3>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    {[
                      ["TN", data.metrics.confusion_matrix[0][0]],
                      ["FP", data.metrics.confusion_matrix[0][1]],
                      ["FN", data.metrics.confusion_matrix[1][0]],
                      ["TP", data.metrics.confusion_matrix[1][1]],
                    ].map(([label, value]) => (
                      <p key={label}>
                        <span className="text-[var(--muted-ink)]">{label}</span>{" "}
                        <strong>{Number(value).toLocaleString("en-IN")}</strong>
                      </p>
                    ))}
                  </div>
                </section>
                <details>
                  <summary className="cursor-pointer py-3">
                    Active cost and capacity operating policy
                  </summary>
                  <Json value={data.operatingPolicy} />
                </details>
                <p className="text-sm">
                  Trained: {data.trainedAt ?? "Not recorded"} · Last validation
                  timestamp: {data.lastValidatedAt ?? "Not separately recorded"}
                </p>
                <details>
                  <summary className="cursor-pointer py-3">
                    Evaluation dataset provenance
                  </summary>
                  <Json value={data.dataset} />
                </details>
                <Link href="/evaluation" className="bench-button">
                  Evaluation & challenger gates
                </Link>
                <Notice>
                  IEEE-CIS is a separate candidate-only evaluation. Different
                  datasets are not a valid head-to-head model ranking. Promotion
                  remains gated.
                </Notice>
              </Panel>
              <Panel title="Observed data drift">
                <Notice>{data.driftMethod}</Notice>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {Object.entries(data.drift).map(([key, value]) => (
                    <div key={key} className="border border-[var(--line)] p-3">
                      <p className="text-sm">{key.replaceAll("_", " ")}</p>
                      <p className="my-2 font-semibold">
                        {value.status.replaceAll("_", " ")}
                      </p>
                      <Notice>
                        {value.method}: {value.value ?? "—"}
                      </Notice>
                    </div>
                  ))}
                </div>
                <p className="text-sm">
                  Reference: {data.referenceSamples} events · Recent:{" "}
                  {data.recentSamples} events
                </p>
                <details>
                  <summary className="cursor-pointer py-3">
                    Measurement windows
                  </summary>
                  <Json
                    value={{
                      reference: data.referenceWindow,
                      recent: data.recentWindow,
                    }}
                  />
                </details>
              </Panel>
              <Panel title="Probability reliability">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <Notice>Status</Notice>
                    <p className="font-semibold">
                      {data.reliability.status.replaceAll("_", " ")}
                    </p>
                  </div>
                  <div>
                    <Notice>Expected calibration error</Notice>
                    <p className="font-display text-2xl">
                      {data.reliability.ece == null
                        ? "Unavailable"
                        : percent(data.reliability.ece)}
                    </p>
                  </div>
                  <div>
                    <Notice>Brier score · lower is better</Notice>
                    <p className="font-display text-2xl">
                      {data.reliability.brier?.toFixed(3) ?? "Unavailable"}
                    </p>
                  </div>
                </div>
                <Notice>{data.calibrationDisclaimer}</Notice>
                {data.reliability.bins.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-[var(--line)]">
                          <th className="py-2">Probability band</th>
                          <th>Rows</th>
                          <th>Mean prediction</th>
                          <th>Observed fraud rate</th>
                          <th>Absolute gap</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.reliability.bins.map((row) => (
                          <tr
                            className="border-b border-[var(--line)]"
                            key={row.lower}
                          >
                            <td className="py-2">
                              {percent(row.lower)}–{percent(row.upper)}
                            </td>
                            <td>{row.support}</td>
                            <td>{percent(row.meanPredicted)}</td>
                            <td>{percent(row.observedRate)}</td>
                            <td>{percent(row.absoluteGap)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Notice>No labeled probability evidence is available.</Notice>
                )}
              </Panel>
              <Panel title="Performance slices">
                <Notice>{data.sliceMethod}</Notice>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--line)]">
                        <th className="py-2">Slice</th>
                        <th>Support</th>
                        <th>Status</th>
                        <th>Precision</th>
                        <th>Recall</th>
                        <th>FPR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.slices.map((row) => (
                        <tr
                          className="border-b border-[var(--line)]"
                          key={row.slice}
                        >
                          <td className="py-2">{row.slice}</td>
                          <td>{row.support}</td>
                          <td>{row.status.replaceAll("_", " ")}</td>
                          <td>{percent(row.metrics?.precision)}</td>
                          <td>{percent(row.metrics?.recall)}</td>
                          <td>{percent(row.metrics?.fpr)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <details>
                  <summary className="cursor-pointer py-3">
                    Label maturity and selection-bias controls
                  </summary>
                  <Json
                    value={{
                      labelMaturity: data.labelMaturity,
                      selectionBiasControl: data.selectionBiasControl,
                    }}
                  />
                </details>
              </Panel>
              <Panel title="Operational feedback">
                <p className="text-sm">
                  Mean inference: {data.averageInferenceMs?.toFixed(1) ?? "—"}{" "}
                  ms · p95: {data.p95InferenceMs?.toFixed(1) ?? "—"} ms
                </p>
                <p className="text-sm">
                  {data.reviewFeedbackEvents} review feedback events ·{" "}
                  {data.reviewDisagreements} high-risk assessments marked
                  legitimate by reviewers
                </p>
                <Notice>
                  Disagreements are a review signal, not independently verified
                  model errors.
                </Notice>
              </Panel>
            </>
          )}
        </>
      )}
      {tab === "Business impact" && (
        <>
          <Panel title="Policy & business-cost simulator">
            <Notice>
              Exploratory dataset analysis; this does not change the deployed
              threshold. Threshold 101 means no alerts. Costs and daily volume
              are your assumptions, not observed losses.
            </Notice>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void run("/workbench/impact", setImpact, cost);
              }}
              className="space-y-4"
            >
              <fieldset
                disabled={busy}
                className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
              >
                {[
                  ["threshold", "Review score threshold", 0, 101, 1],
                  [
                    "review_capacity",
                    "Review capacity (fraction)",
                    0.001,
                    1,
                    0.001,
                  ],
                  [
                    "false_positive_cost",
                    "False-positive cost (₹)",
                    0,
                    100000000,
                    1,
                  ],
                  [
                    "missed_fraud_cost",
                    "Missed fraud cost (₹)",
                    0,
                    100000000,
                    1,
                  ],
                  ["review_cost", "Cost per review (₹)", 0, 100000000, 1],
                  [
                    "daily_transactions",
                    "Daily transaction assumption",
                    1,
                    10000000,
                    1,
                  ],
                  ["fraud_rate", "Fraud rate (fraction)", 0.001, 0.999, 0.001],
                ].map(([key, label, min, max, step]) => (
                  <label className="text-sm" key={key}>
                    {label}
                    <input
                      required
                      className={inputClass}
                      type="number"
                      min={min}
                      max={max}
                      step={step}
                      value={cost[key as keyof typeof cost]}
                      onChange={(event) => {
                        setCost((v) => ({
                          ...v,
                          [key]: Number(event.target.value),
                        }));
                        setImpact(null);
                      }}
                    />
                  </label>
                ))}
              </fieldset>
              <button className="bench-button" disabled={busy}>
                {busy ? "Evaluating…" : "Evaluate policy"}
              </button>
            </form>
          </Panel>
          {impact && (
            <>
              <Panel title="Active dataset command center">
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  {[
                    ["Transactions", impact.transactions],
                    ["High risk", impact.highRisk],
                    ["Medium risk", impact.mediumRisk],
                    ["Pending reviews", impact.pendingReviews],
                  ].map(([key, v]) => (
                    <div key={key}>
                      <Notice>{key}</Notice>
                      <p className="font-display text-3xl">{v}</p>
                    </div>
                  ))}
                </div>
                <Notice>
                  {impact.scope}. Mature labels: {impact.labeledRows}; withheld
                  immature labels: {impact.immatureLabeledRows}; unlabeled rows:{" "}
                  {impact.unlabeledRows}. Maturity window:{" "}
                  {impact.labelMaturityDays} days.
                </Notice>
                <div className="grid gap-3 border-t border-[var(--line)] pt-4 sm:grid-cols-4">
                  {[
                    ["Unassigned", impact.queue.unassigned],
                    [">24h SLA", impact.queue.olderThan24Hours],
                    ["Oldest case", `${impact.queue.oldestAgeHours.toFixed(1)}h`],
                    ["Backlog", `${impact.queue.backlogDays.toFixed(2)} days`],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <Notice>{label}</Notice>
                      <p className="font-semibold">{value}</p>
                    </div>
                  ))}
                </div>
                <Notice>
                  Capacity utilization {percent(impact.queue.capacityUtilization)}
                  against the simulator’s assumed daily review capacity.
                </Notice>
              </Panel>
              <Panel title="Operating-point comparison">
                <div className="grid gap-5 sm:grid-cols-2">
                  {[
                    ["Selected threshold", impact.selected],
                    ["Lowest dataset cost within capacity", impact.recommended],
                  ].map(([label, value]) => {
                    const row = value as Confusion | null;
                    return (
                      <div key={String(label)}>
                        <h3 className="mb-3 font-semibold">{String(label)}</h3>
                        {row ? (
                          <>
                            <p className="text-sm">
                              Score ≥ {row.threshold} · reviews{" "}
                              {percent(row.reviewRate)}
                            </p>
                            <p className="text-sm">
                              Precision {percent(row.precision)} · Recall{" "}
                              {percent(row.recall)} · FPR {percent(row.fpr)}
                            </p>
                            <p className="my-2 font-display text-2xl">
                              {money(row.cost)}
                            </p>
                            <p className="text-sm">
                              TP {row.tp} · FP {row.fp} · FN {row.fn} · TN{" "}
                              {row.tn}
                            </p>
                          </>
                        ) : (
                          <Notice>
                            No labeled evidence to recommend an operating point.
                          </Notice>
                        )}
                      </div>
                    );
                  })}
                </div>
                <Notice>{impact.disclaimer}</Notice>
              </Panel>
              <Panel title="Hypothetical daily business impact">
                {impact.projection ? (
                  <>
                    <div className="grid gap-4 sm:grid-cols-3">
                      {[
                        ["Without system", impact.projection.withoutSystem],
                        [
                          "With system + operations",
                          impact.projection.withSystem,
                        ],
                        [
                          "Net estimated savings",
                          impact.projection.netEstimatedSavings,
                        ],
                      ].map(([label, v]) => (
                        <div key={label}>
                          <Notice>{label}</Notice>
                          <p className="font-display text-2xl">
                            {money(Number(v))}
                          </p>
                        </div>
                      ))}
                    </div>
                    <p className="text-sm">
                      Projected reviews: {impact.projection.reviews.toFixed(0)}{" "}
                      ({percent(impact.projection.reviewRate)}) ·{" "}
                      {impact.projection.withinCapacity
                        ? "Within assumed capacity"
                        : "Exceeds assumed capacity"}
                    </p>
                    <details>
                      <summary className="cursor-pointer py-3">
                        Cost decomposition
                      </summary>
                      <Json value={impact.projection} />
                    </details>
                  </>
                ) : (
                  <Notice>
                    Requires supplied labels from both classes. No financial
                    result is invented for an unlabeled dataset.
                  </Notice>
                )}
              </Panel>
            </>
          )}
        </>
      )}
      {tab === "Connected patterns" && (
        <Panel title="Observed shared-recipient patterns">
          <button
            className="bench-button"
            disabled={busy}
            onClick={() =>
              void run("/workbench/patterns", setPatterns, undefined, "GET")
            }
          >
            Analyze connected patterns
          </button>
          <Notice>
            72-hour window ending at the latest event in the active dataset.
            Only observed customer → recipient edges are linked.
          </Notice>
          {patterns && (
            <>
              <Notice>{patterns.disclaimer}</Notice>
              {!patterns.patterns.length && (
                <p className="text-sm">
                  No qualifying shared-recipient pattern.
                </p>
              )}
              {patterns.patterns.map((row) => (
                <div
                  className="space-y-3 border-t border-[var(--line)] pt-4"
                  key={row.recipient}
                >
                  <h3 className="font-semibold">
                    {row.customers.length} customers → {row.recipient}
                  </h3>
                  <p className="text-sm">
                    {row.transactions} transactions · {row.highRisk} high risk ·{" "}
                    {money(row.totalValue)}
                  </p>
                  <Notice>
                    {row.firstSeen} → {row.lastSeen}
                  </Notice>
                  <div className="flex flex-wrap gap-2">
                    {row.transactionIds.map((id) => (
                      <Link
                        className="bench-button"
                        key={id}
                        href={`/investigations/${encodeURIComponent(id)}`}
                      >
                        {id}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </Panel>
      )}
      {tab === "Stress lab" && isAdmin && (
        <Panel title="Adversarial property checks">
          <Notice>
            Eight deterministic scenario/property checks, not a statistical
            detection-rate benchmark. Includes unusual-but-legitimate context,
            extreme inputs, repeatability, and age invariance. No records are
            persisted.
          </Notice>
          <button
            className="bench-button"
            disabled={busy}
            onClick={() => void run("/workbench/stress-test", setStress)}
          >
            {busy ? "Testing…" : "Run model stress test"}
          </button>
          {stress != null && <Json value={stress} />}
        </Panel>
      )}
      {tab === "Historical replay" && mayInvestigate && (
        <Panel title="Temporal replay / offline shadow">
          <Notice>
            Re-scores frozen, enriched inputs in event-time order with the
            currently loaded artifacts. It never rewrites decisions or executes
            an action. Live shadow scoring remains disabled without a distinct,
            schema-compatible challenger.
          </Notice>
          <button
            className="bench-button"
            disabled={busy}
            onClick={() =>
              void run(
                "/workbench/historical-replay",
                setReplay,
                undefined,
                "GET",
              )
            }
          >
            {busy ? "Replaying…" : "Run chronological replay"}
          </button>
          {replay && (
            <>
              <div className="grid gap-4 sm:grid-cols-4">
                {[
                  ["Eligible snapshots", replay.eligible],
                  ["Legacy unavailable", replay.legacyUnavailable],
                  ["Integrity failures", replay.invalidSnapshots],
                  ["Changed scores", replay.scoreChanges],
                ].map(([label, value]) => (
                  <div key={label}>
                    <Notice>{label}</Notice>
                    <p className="font-display text-2xl">{value}</p>
                  </div>
                ))}
              </div>
              <Notice>{replay.limitations}</Notice>
              <section className="border border-[var(--line)] p-4">
                <p className="rail-label">Champion / challenger evidence</p>
                <h3 className="mt-2 font-display text-xl uppercase">
                  {replay.championChallenger.status.replaceAll("_", " ")}
                </h3>
                <p className="mt-2 text-sm text-[var(--muted-ink)]">
                  {replay.championChallenger.champion} versus{" "}
                  {replay.championChallenger.challenger} on{" "}
                  {replay.championChallenger.comparableRows} identical frozen
                  inputs. Decision disagreements at 71:{" "}
                  {replay.championChallenger.decisionDisagreementsAt71}.
                </p>
                <Notice>{replay.championChallenger.limitation}</Notice>
              </section>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--line)]">
                      <th className="py-2">Date</th>
                      <th>Events</th>
                      <th>Reviews at 71</th>
                      <th>Supplied fraud labels</th>
                    </tr>
                  </thead>
                  <tbody>
                    {replay.dailyQueue.map((row) => (
                      <tr
                        className="border-b border-[var(--line)]"
                        key={row.date}
                      >
                        <td className="py-2">{row.date}</td>
                        <td>{row.events}</td>
                        <td>{row.reviews}</td>
                        <td>{row.fraudLabels}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Panel>
      )}
      {tab === "Engineering decisions" && (
        <Panel title="What broke — and what we learned">
          <div className="space-y-5 text-sm">
            <div>
              <h3 className="font-semibold">PostgreSQL enum ownership</h3>
              <p>
                A migration explicitly created user_role, then SQLAlchemy’s
                table event tried to create it again. One owner with
                create_type=False on the table reference fixes fresh creation;
                PostgreSQL upgrade/downgrade regression tests protect it.
              </p>
            </div>
            <div>
              <h3 className="font-semibold">
                Model quality is not a demo score
              </h3>
              <p>
                We retain measured precision, recall, PR-AUC and false-positive
                rates, with temporal splits and cost analysis. The real-data
                IEEE-CIS candidate is not promoted just to improve a headline.
                Production quality remains a validation gate.
              </p>
            </div>
            <div>
              <h3 className="font-semibold">Grounding and human authority</h3>
              <p>
                The default investigator is bounded deterministic orchestration
                with lexical policy retrieval. Optional LLM assistance must
                remain evidence-bound. Missing evidence stays missing, and no
                model or agent executes a financial action.
              </p>
            </div>
            <div>
              <h3 className="font-semibold">
                Replay without fictional certainty
              </h3>
              <p>
                New assessments preserve risk inputs, rules and outputs. Old
                records without snapshots are explicitly unavailable. A local
                integrity digest is not an immutable external audit store, and
                counterfactuals are not causal promises.
              </p>
            </div>
          </div>
          <Link className="bench-button" href="/audit">
            Inspect audit evidence
          </Link>
        </Panel>
      )}
    </div>
  );
}
