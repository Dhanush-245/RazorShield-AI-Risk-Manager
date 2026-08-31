import { type FormEvent, useState } from "react";
import {
  BarChart3,
  Eye,
  EyeOff,
  FileSearch,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";

export type UserRole = "ADMIN" | "RISK_ANALYST" | "REVIEWER" | "VIEWER";
export type AuthUser = {
  id: string;
  merchant_id: string;
  merchant_reference?: string;
  display_name: string;
  role: UserRole;
};

type Mode = "login" | "forgot" | "otp" | "reset";

const demoProfiles: Array<{
  role: UserRole;
  label: string;
  name: string;
  email: string;
  phone: string;
  access: string;
  icon: typeof ShieldCheck;
}> = [
  {
    role: "ADMIN",
    label: "Admin",
    name: "Asha Rao",
    email: "admin@razorshield.demo",
    phone: "+91 91000 00201",
    access: "Full platform administration",
    icon: ShieldCheck,
  },
  {
    role: "RISK_ANALYST",
    label: "Risk analyst",
    name: "Arjun Rivera",
    email: "analyst@razorshield.demo",
    phone: "+91 91000 00202",
    access: "Transactions and investigations",
    icon: FileSearch,
  },
  {
    role: "REVIEWER",
    label: "Reviewer",
    name: "Riya Shah",
    email: "reviewer@razorshield.demo",
    phone: "+91 91000 00203",
    access: "Review, approve, or escalate",
    icon: Users,
  },
  {
    role: "VIEWER",
    label: "Viewer",
    name: "Vikram Singh",
    email: "viewer@razorshield.demo",
    phone: "+91 91000 00204",
    access: "Read-only analytics",
    icon: BarChart3,
  },
];

function endpoint(path: string) {
  const base =
    (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(
      /\/$/,
      "",
    ) ?? "";
  return `${base}/api/v1/auth${path}`;
}

async function request<T>(path: string, body: object): Promise<T> {
  const response = await fetch(endpoint(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : "Request could not be completed",
    );
  return data as T;
}

export function AuthScreen({
  onAuthenticated,
  initialMessage = "",
}: {
  onAuthenticated: (user: AuthUser) => void;
  initialMessage?: string;
}) {
  const [mode, setMode] = useState<Mode>("login");
  const [identifier, setIdentifier] = useState("analyst@razorshield.demo");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [developmentOtp, setDevelopmentOtp] = useState<string>();
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(initialMessage);
  const [error, setError] = useState("");
  const selectedProfile = demoProfiles.find(
    (profile) => identifier === profile.email || identifier === profile.phone,
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "login") {
        const result = await request<{
          access_token: string;
          user: AuthUser;
        }>("/login", { identifier, password });
        sessionStorage.setItem("razorshield_access_token", result.access_token);
        sessionStorage.setItem("razorshield_user", JSON.stringify(result.user));
        onAuthenticated(result.user);
      } else if (mode === "forgot") {
        const result = await request<{
          message: string;
          development_otp?: string;
        }>("/password/forgot", { identifier });
        setMessage(result.message);
        setDevelopmentOtp(result.development_otp);
        setMode("otp");
      } else if (mode === "otp") {
        const result = await request<{ reset_token: string }>(
          "/password/verify-otp",
          { identifier, otp },
        );
        setResetToken(result.reset_token);
        setMode("reset");
      } else {
        await request("/password/reset", {
          reset_token: resetToken,
          new_password: password,
          confirm_password: confirmation,
        });
        setMode("login");
        setMessage(
          "Password reset successful. Sign in with your new password.",
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === "login"
      ? "Merchant access"
      : mode === "forgot"
        ? "Recover access"
        : mode === "otp"
          ? "Verify code"
          : "Set new password";

  return (
    <main className="noise-overlay bench-grid min-h-[100dvh] bg-[var(--canvas)] text-[var(--ink)]">
      <div className="mx-auto grid min-h-[100dvh] max-w-[1440px] lg:grid-cols-[1.05fr_.95fr]">
        <section className="flex flex-col justify-between border-b border-[var(--line)] p-6 sm:p-10 lg:border-b-0 lg:border-r lg:p-14">
          <div className="flex items-center gap-3">
            <img
              src="/razorshield-logo.svg"
              width="48"
              height="48"
              alt=""
              aria-hidden="true"
              className="h-12 w-12 object-contain"
            />
            <div>
              <strong className="font-display text-xl uppercase">
                RazorShield AI
              </strong>
              <p className="font-mono-app text-[9px] uppercase tracking-[.2em] text-[var(--muted-ink)]">
                Merchant risk command center
              </p>
            </div>
          </div>

          <div className="py-12 lg:py-20">
            <p className="rail-label text-[var(--rust)]">
              AI-powered merchant risk manager
            </p>
            <h1 className="mt-4 max-w-3xl font-display text-5xl uppercase leading-[.9] tracking-[-.04em] sm:text-7xl">
              Detect risk. Keep humans in control.
            </h1>
            <p className="mt-6 max-w-xl text-sm leading-6 text-[var(--muted-ink)]">
              Real-time scoring, evidence-grounded investigation, controlled
              decisions, and a durable audit trail for every merchant event.
            </p>

            <div
              className="mt-9 grid gap-2 sm:grid-cols-2"
              aria-label="Demo roles"
            >
              {demoProfiles.map((profile) => {
                const Icon = profile.icon;
                const selected =
                  identifier === profile.email || identifier === profile.phone;
                return (
                  <button
                    key={profile.role}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setIdentifier(profile.email);
                      setPassword("");
                      setMode("login");
                      setError("");
                      setMessage("");
                    }}
                    className={`min-h-16 border p-3 text-left transition-colors ${
                      selected
                        ? "border-[var(--rust)] bg-[var(--rust)]/10"
                        : "border-[var(--line)] bg-[var(--panel)] hover:border-[var(--line-bright)]"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Icon
                        className="h-4 w-4 text-[var(--rust)]"
                        aria-hidden="true"
                      />
                      <strong className="text-xs uppercase">
                        {profile.label}
                      </strong>
                    </span>
                    <span className="mt-1 block text-[10px] leading-4 text-[var(--muted-ink)]">
                      {profile.name} · {profile.access}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <p className="font-mono-app text-[9px] uppercase tracking-[.18em] text-[var(--muted-ink)]">
            Competition demo / Synthetic data is visibly labeled
          </p>
        </section>

        <section className="flex items-center justify-center p-5 sm:p-10 lg:p-14">
          <div className="w-full max-w-md border border-[var(--line-bright)] bg-[var(--panel)] p-6 shadow-2xl sm:p-8">
            <div className="flex h-11 w-11 items-center justify-center border border-[var(--rust)] bg-[var(--rust)]/10 text-[var(--rust)]">
              <LockKeyhole className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="rail-label mt-6 text-[var(--rust)]">
              Secure merchant sign-in
            </p>
            <h2 className="mt-2 font-display text-4xl uppercase">{title}</h2>
            <p className="mt-2 text-xs leading-5 text-[var(--muted-ink)]">
              {mode === "login"
                ? "Your workspace and permitted actions are determined by your assigned role."
                : mode === "forgot"
                  ? "Request a short-lived verification code."
                  : mode === "otp"
                    ? "Enter the six-digit code sent to your registered identifier."
                    : "Choose a password with at least 12 characters."}
            </p>

            <form onSubmit={submit} className="mt-7 space-y-4">
              {mode !== "reset" && (
                <div className="block">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <label
                      htmlFor="login-identifier"
                      className="text-xs font-bold"
                    >
                      Email or phone number
                    </label>
                    {mode === "login" && selectedProfile && (
                      <div
                        role="group"
                        aria-label="Choose email or phone sign-in"
                        className="flex border border-[var(--input-line)] bg-[var(--canvas)]"
                      >
                        <button
                          type="button"
                          aria-pressed={identifier === selectedProfile.email}
                          onClick={() => setIdentifier(selectedProfile.email)}
                          className={`min-h-11 px-3 text-[10px] font-bold uppercase tracking-[.12em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rust)] ${
                            identifier === selectedProfile.email
                              ? "bg-[var(--rust)] text-white"
                              : "text-[var(--muted-ink)] hover:text-[var(--ink)]"
                          }`}
                        >
                          Email
                        </button>
                        <button
                          type="button"
                          aria-pressed={identifier === selectedProfile.phone}
                          onClick={() => setIdentifier(selectedProfile.phone)}
                          className={`min-h-11 border-l border-[var(--input-line)] px-3 text-[10px] font-bold uppercase tracking-[.12em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rust)] ${
                            identifier === selectedProfile.phone
                              ? "bg-[var(--rust)] text-white"
                              : "text-[var(--muted-ink)] hover:text-[var(--ink)]"
                          }`}
                        >
                          Phone
                        </button>
                      </div>
                    )}
                  </div>
                  <input
                    id="login-identifier"
                    autoComplete="username"
                    inputMode={
                      selectedProfile?.phone === identifier ? "tel" : "email"
                    }
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    className="min-h-12 w-full border border-[var(--input-line)] bg-[var(--canvas)] px-3 text-sm outline-none focus:border-[var(--rust)]"
                    required
                  />
                  {mode === "login" && selectedProfile && (
                    <p className="mt-2 text-[10px] leading-4 text-[var(--muted-ink)]">
                      Account selected for {selectedProfile.name} ·{" "}
                      {selectedProfile.label}
                    </p>
                  )}
                </div>
              )}

              {(mode === "login" || mode === "reset") && (
                <label className="block">
                  <span className="mb-2 block text-xs font-bold">
                    {mode === "reset" ? "New password" : "Password"}
                  </span>
                  <span className="flex border border-[var(--input-line)] bg-[var(--canvas)] focus-within:border-[var(--rust)]">
                    <input
                      autoComplete={
                        mode === "login" ? "current-password" : "new-password"
                      }
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="min-h-12 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
                      required
                      minLength={mode === "reset" ? 12 : 8}
                    />
                    <button
                      type="button"
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      onClick={() => setShowPassword(!showPassword)}
                      className="min-h-12 min-w-12 px-3 text-[var(--muted-ink)] hover:text-[var(--ink)]"
                    >
                      {showPassword ? (
                        <EyeOff
                          className="mx-auto h-4 w-4"
                          aria-hidden="true"
                        />
                      ) : (
                        <Eye className="mx-auto h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </span>
                </label>
              )}

              {mode === "reset" && (
                <label className="block">
                  <span className="mb-2 block text-xs font-bold">
                    Confirm new password
                  </span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    className="min-h-12 w-full border border-[var(--input-line)] bg-[var(--canvas)] px-3 text-sm outline-none focus:border-[var(--rust)]"
                    required
                    minLength={12}
                  />
                </label>
              )}

              {mode === "otp" && (
                <label className="block">
                  <span className="mb-2 block text-xs font-bold">
                    One-time password
                  </span>
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={otp}
                    onChange={(event) =>
                      setOtp(event.target.value.replace(/\D/g, ""))
                    }
                    className="min-h-12 w-full border border-[var(--input-line)] bg-[var(--canvas)] px-3 text-center font-mono-app text-xl tracking-[.45em] outline-none focus:border-[var(--rust)]"
                    required
                  />
                </label>
              )}

              {developmentOtp && mode === "otp" && (
                <div className="border border-[var(--brass)]/60 bg-[var(--brass)]/10 p-3 text-xs">
                  <strong className="text-[var(--brass)]">
                    Development-only OTP
                  </strong>
                  <p className="mt-1 font-mono-app text-lg tracking-[.3em]">
                    {developmentOtp}
                  </p>
                </div>
              )}
              {error && (
                <div
                  role="alert"
                  className="border border-[var(--rust)]/60 bg-[var(--rust)]/10 p-3 text-xs text-[var(--rust)]"
                >
                  {error}. Check your credentials or recover access below.
                </div>
              )}
              {message && (
                <div
                  role="status"
                  className="border border-[var(--teal)]/60 bg-[var(--teal)]/10 p-3 text-xs text-[var(--teal)]"
                >
                  {message}
                </div>
              )}

              <button
                disabled={busy}
                className="bench-button min-h-12 w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? (
                  <RefreshCw
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <LockKeyhole className="h-4 w-4" aria-hidden="true" />
                )}
                {mode === "login"
                  ? "Login"
                  : mode === "forgot"
                    ? "Send code"
                    : mode === "otp"
                      ? "Verify code"
                      : "Reset password"}
              </button>
            </form>

            <div className="mt-5 flex items-center justify-between text-xs">
              <button
                onClick={() => {
                  setMode(mode === "login" ? "forgot" : "login");
                  setError("");
                }}
                className="min-h-11 text-[var(--rust)]"
              >
                {mode === "login" ? "Forgot password?" : "Back to login"}
              </button>
              {mode === "otp" && (
                <button
                  onClick={() => setMode("forgot")}
                  className="min-h-11 text-[var(--muted-ink)]"
                >
                  Resend code
                </button>
              )}
            </div>

            <p className="mt-6 border-t border-[var(--line)] pt-4 text-[11px] leading-5 text-[var(--muted-ink)]">
              Choose a demo role to load its identifier. Enter the password
              separately to access its permitted workspace.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
