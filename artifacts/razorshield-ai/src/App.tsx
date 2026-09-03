import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Bell,
  Check,
  ChevronRight,
  CircleDot,
  Coins,
  Command,
  Database,
  Download,
  ExternalLink,
  FileSearch,
  Fingerprint,
  Flag,
  Gauge,
  History,
  LayoutDashboard,
  ListFilter,
  LockKeyhole,
  LogOut,
  Menu,
  Network,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  Siren,
  Target,
  Upload,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useDecideReview } from "@workspace/api-client-react";
import type {
  AuditEvent,
  Investigation,
  RiskNetwork,
  RiskOverview,
  RiskTransaction,
} from "@workspace/api-client-react";
import {
  Link,
  Route,
  Router as WouterRouter,
  Switch,
  useLocation,
  useParams,
} from "wouter";
import { ErrorBoundary } from "@/components/error-boundary";
import {
  DecisionWorkbench,
  OperationsConsole,
  RiskSimulator,
} from "@/components/risk-workbench";
import {
  Command as CommandMenu,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import {
  clearSessionNotice,
  expireSession,
  getValidAccessToken,
  getSessionNotice,
  refreshSession,
  SESSION_EXPIRED_EVENT,
  signOutSession,
} from "@/lib/session";
import {
  AuthScreen,
  type AuthUser,
  type UserRole,
} from "@/components/auth-screen";

const LIVE_REFRESH_INTERVAL_MS = 5_000;
const LIVE_DATA_REFRESH_EVENT = "razorshield-live-data-refresh";
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      staleTime: 1_000,
    },
  },
});

function announceLiveDataRefresh() {
  window.dispatchEvent(new Event(LIVE_DATA_REFRESH_EVENT));
}
type ReviewDecision = "approve" | "reject" | "escalate" | "request_evidence";
type Tone = "high" | "medium" | "low";
const allRoles: UserRole[] = ["ADMIN", "RISK_ANALYST", "REVIEWER", "VIEWER"];
const investigationRoles: UserRole[] = ["ADMIN", "RISK_ANALYST", "REVIEWER"];
const analystRoles: UserRole[] = ["ADMIN", "RISK_ANALYST"];
const reviewerRoles: UserRole[] = ["ADMIN", "REVIEWER"];
const analyticsRoles: UserRole[] = ["ADMIN", "RISK_ANALYST", "VIEWER"];

function getStoredUser(): AuthUser | null {
  try {
    return JSON.parse(
      sessionStorage.getItem("razorshield_user") ?? "null",
    ) as AuthUser | null;
  } catch {
    return null;
  }
}

function roleLabel(role?: UserRole) {
  return role ? role.replaceAll("_", " ") : "Merchant user";
}

const roleExperience: Record<
  UserRole,
  { title: string; detail: string; href: string; cta: string }
> = {
  ADMIN: {
    title: "Platform governance",
    detail:
      "Manage merchant controls, model thresholds, access boundaries, and the full operational posture.",
    href: "/settings",
    cta: "Open safety settings",
  },
  RISK_ANALYST: {
    title: "Risk triage",
    detail:
      "Prioritize high-consequence transactions, inspect evidence, and prepare cases for human review.",
    href: "/investigations",
    cta: "Open investigations",
  },
  REVIEWER: {
    title: "Human decision queue",
    detail:
      "Review the evidence and classify activity as legitimate, confirm it as high-risk, escalate it, or request more evidence.",
    href: "/reviews",
    cta: "Open review queue",
  },
  VIEWER: {
    title: "Read-only intelligence",
    detail:
      "Monitor merchant performance, risk distribution, and model health without changing operational state.",
    href: "/analytics",
    cta: "Open analytics",
  },
};

function canAccess(user: AuthUser | null, roles: UserRole[]) {
  return Boolean(user && roles.includes(user.role));
}

const navItems: Array<{
  href: string;
  label: string;
  icon: LucideIcon;
  roles: UserRole[];
  exact?: boolean;
}> = [
  {
    href: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: allRoles,
    exact: true,
  },
  {
    href: "/transactions",
    label: "Transactions",
    icon: Coins,
    roles: analystRoles,
  },
  {
    href: "/datasets",
    label: "Dataset analysis",
    icon: Upload,
    roles: analystRoles,
  },
  {
    href: "/assess",
    label: "Assess transaction",
    icon: Activity,
    roles: analystRoles,
  },
  {
    href: "/simulator",
    label: "Risk simulator",
    icon: Gauge,
    roles: investigationRoles,
  },
  {
    href: "/operations",
    label: "Risk operations",
    icon: Target,
    roles: analyticsRoles,
  },
  {
    href: "/investigations",
    label: "Investigations",
    icon: FileSearch,
    roles: investigationRoles,
  },
  {
    href: "/reviews",
    label: "Review queue",
    icon: Users,
    roles: investigationRoles,
  },
  {
    href: "/fraud-intelligence",
    label: "Fraud intelligence",
    icon: Siren,
    roles: analystRoles,
  },
  {
    href: "/network",
    label: "Risk network",
    icon: Network,
    roles: analystRoles,
  },
  {
    href: "/chargebacks",
    label: "Chargebacks",
    icon: ShieldAlert,
    roles: analystRoles,
  },
  {
    href: "/returns",
    label: "Returns",
    icon: ArrowDownRight,
    roles: analystRoles,
  },
];
const secondaryNav: Array<{
  href: string;
  label: string;
  icon: LucideIcon;
  roles: UserRole[];
}> = [
  {
    href: "/audit",
    label: "Audit trail",
    icon: History,
    roles: investigationRoles,
  },
  {
    href: "/evaluation",
    label: "Evaluation",
    icon: Gauge,
    roles: analyticsRoles,
  },
  {
    href: "/analytics",
    label: "Analytics",
    icon: BarChart3,
    roles: analyticsRoles,
  },
  {
    href: "/monitoring",
    label: "Model monitoring",
    icon: Database,
    roles: analyticsRoles,
  },
  { href: "/settings", label: "Settings", icon: Settings, roles: ["ADMIN"] },
];

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatMoney(value: number | undefined, currency = "USD") {
  if (value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}
function formatCompact(value: number | undefined) {
  if (value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
function formatTime(value?: string) {
  if (!value) return "Unknown time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
function scoreValue(value: number | undefined) {
  if (value === undefined || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value <= 1 ? value * 100 : value));
}
function scoreLabel(value: number | undefined) {
  const score = scoreValue(value);
  return score.toFixed(score % 1 ? 1 : 0);
}
function riskTone(level?: string, score?: number): Tone {
  const value = (level ?? "").toLowerCase();
  if (
    value.includes("high") ||
    value.includes("critical") ||
    scoreValue(score) >= 75
  )
    return "high";
  if (
    value.includes("medium") ||
    value.includes("review") ||
    scoreValue(score) >= 45
  )
    return "medium";
  return "low";
}
function toneColor(tone: Tone) {
  return tone === "high"
    ? "var(--rust)"
    : tone === "medium"
      ? "var(--brass)"
      : "var(--teal)";
}

function RiskBadge({ level, score }: { level?: string; score?: number }) {
  const tone = riskTone(level, score);
  return (
    <span
      data-testid={`status-risk-${tone}`}
      className={cn(
        "risk-badge",
        tone === "high" && "risk-high",
        tone === "medium" && "risk-medium",
        tone === "low" && "risk-low",
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {level || tone}
    </span>
  );
}

function LoadingBlock({ className = "" }: { className?: string }) {
  return <div className={cn("skeleton-block", className)} />;
}

function QueryState({
  error,
  onRetry,
  label = "Unable to load this signal",
}: {
  error?: boolean;
  onRetry: () => void;
  label?: string;
}) {
  if (!error) return null;
  return (
    <div
      data-testid="status-query-error"
      className="bench-panel flex min-h-40 items-center justify-center p-6 text-center"
    >
      <div>
        <AlertCircle className="mx-auto mb-2 h-5 w-5 text-[var(--rust)]" />
        <p className="text-sm font-bold text-[var(--ink)]">{label}</p>
        <p className="mt-1 text-xs text-[var(--muted-ink)]">
          The decision surface is safe. Try the request again.
        </p>
        <button
          data-testid="button-retry-query"
          onClick={onRetry}
          className="bench-button mt-4"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Retry request
        </button>
      </div>
    </div>
  );
}

function EmptyState({
  title,
  body,
  icon: Icon = Database,
}: {
  title: string;
  body: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="empty-state">
      <div className="mb-3 flex h-10 w-10 items-center justify-center border border-[var(--line)] bg-[var(--panel-2)] text-[var(--muted-ink)]">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm font-bold text-[var(--ink)]">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-5 text-[var(--muted-ink)]">
        {body}
      </p>
    </div>
  );
}

function Header({
  title,
  eyebrow,
  onMenu,
}: {
  title: string;
  eyebrow: string;
  onMenu: () => void;
}) {
  const [, setLocation] = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [results, setResults] = useState<
    Array<{
      type: string;
      id: string;
      title: string;
      subtitle: string;
      href: string;
      riskScore?: number;
    }>
  >([]);
  const [notifications, setNotifications] = useState<
    Array<{
      id: string;
      severity: string;
      title: string;
      detail: string;
      href: string;
    }>
  >([]);
  const user = getStoredUser();
  const initials = (user?.display_name ?? "Merchant user")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  useEffect(() => {
    if (!searchOpen || searchText.trim().length < 2) {
      setResults([]);
      return;
    }
    const timeout = window.setTimeout(() => {
      authenticatedRequest<typeof results>(
        `/search?q=${encodeURIComponent(searchText.trim())}`,
      )
        .then(setResults)
        .catch(() => setResults([]));
    }, 220);
    return () => window.clearTimeout(timeout);
  }, [searchOpen, searchText]);
  useEffect(() => {
    if (!searchOpen && !notificationOpen) return;
    const closeOverlay = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSearchOpen(false);
        setNotificationOpen(false);
      }
    };
    window.addEventListener("keydown", closeOverlay);
    return () => window.removeEventListener("keydown", closeOverlay);
  }, [searchOpen, notificationOpen]);
  const showNotifications = () => {
    setNotificationOpen((open) => !open);
    setSearchOpen(false);
    void authenticatedRequest<typeof notifications>("/notifications")
      .then(setNotifications)
      .catch(() => setNotifications([]));
  };
  return (
    <header className="bench-header">
      <div className="flex min-w-0 items-center">
        <button
          data-testid="button-open-navigation"
          onClick={onMenu}
          className="mr-3 border-r border-[var(--line)] px-4 py-5 text-[var(--muted-ink)] hover:text-[var(--rust)] md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0 px-4 py-4 md:px-7">
          <p className="font-mono-app text-[9px] font-bold uppercase tracking-[.28em] text-[var(--rust)]">
            {eyebrow}
          </p>
          <h1 className="mt-1 truncate font-display text-xl uppercase leading-none tracking-[-.02em] text-[var(--ink)] md:text-2xl">
            {title}
          </h1>
        </div>
      </div>
      <div className="flex items-center">
        <div
          role="status"
          aria-atomic="true"
          className="hidden items-center gap-2 border-l border-[var(--line)] px-4 py-4 font-mono-app text-[9px] font-bold uppercase tracking-[.16em] text-[var(--teal)] md:flex"
        >
          <span className="h-2 w-2 rounded-full bg-[var(--teal)] motion-safe:animate-pulse" />
          Auto-sync 5s
        </div>
        {canAccess(user, investigationRoles) && (
          <>
            <button
              data-testid="button-command-search"
              aria-expanded={searchOpen}
              onClick={() => {
                setSearchOpen(true);
                setNotificationOpen(false);
              }}
              className="hidden min-h-11 items-center gap-2 border-l border-[var(--line)] px-5 py-4 font-mono-app text-[9px] uppercase tracking-[.18em] text-[var(--muted-ink)] hover:text-[var(--rust)] lg:flex"
            >
              <Command className="h-3.5 w-3.5" aria-hidden="true" /> Quick find{" "}
              <span className="border border-[var(--line)] px-1.5 py-0.5 text-[8px]">
                CMD K
              </span>
            </button>
            <button
              aria-label="Search"
              aria-expanded={searchOpen}
              onClick={() => {
                setSearchOpen(true);
                setNotificationOpen(false);
              }}
              className="min-h-11 min-w-11 border-l border-[var(--line)] p-5 text-[var(--muted-ink)] hover:text-[var(--rust)] lg:hidden"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              aria-label="Notifications"
              aria-expanded={notificationOpen}
              onClick={showNotifications}
              className="relative min-h-11 min-w-11 border-l border-[var(--line)] p-5 text-[var(--muted-ink)] hover:text-[var(--rust)]"
            >
              <Bell className="h-4 w-4" aria-hidden="true" />
              {notifications.length > 0 && (
                <span className="absolute right-3 top-3 h-1.5 w-1.5 rounded-full bg-[var(--rust)]" />
              )}
            </button>
          </>
        )}
        <div className="hidden h-8 w-px bg-[var(--line)] sm:block" />
        <div className="mr-4 flex items-center gap-2 border-l border-[var(--line)] px-4 py-3 md:mr-6">
          <span className="flex h-8 w-8 items-center justify-center bg-[var(--rust)] font-mono-app text-[10px] font-bold text-[var(--canvas)]">
            {initials}
          </span>
          <span className="hidden sm:block">
            <strong className="block font-mono-app text-[10px] uppercase tracking-wider text-[var(--ink)]">
              {user?.display_name ?? "Merchant user"}
            </strong>
            <small className="mt-0.5 block font-mono-app text-[8px] uppercase tracking-[.14em] text-[var(--muted-ink)]">
              {roleLabel(user?.role)}
            </small>
          </span>
          <button
            aria-label="Sign out"
            title="Sign out"
            onClick={() => {
              void signOutSession().finally(() => window.location.reload());
            }}
            className="flex h-11 w-11 items-center justify-center text-[var(--muted-ink)] hover:text-[var(--rust)]"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
      {searchOpen && (
        <div
          className="fixed inset-0 z-[70] bg-black/70 p-4"
          onClick={() => setSearchOpen(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Global search"
            onClick={(event) => event.stopPropagation()}
            className="mx-auto mt-[10vh] max-w-2xl border border-[var(--line-bright)] bg-[var(--panel)] shadow-2xl"
          >
            <div className="flex items-center border-b border-[var(--line)] px-4">
              <Search className="h-4 w-4 text-[var(--rust)]" />
              <label htmlFor="global-search" className="sr-only">
                Search transactions, customers, devices, locations, and cases
              </label>
              <input
                id="global-search"
                autoFocus
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search transaction, customer, device, location, or case…"
                className="min-h-14 flex-1 bg-transparent px-3 text-sm outline-none"
              />
              <button
                aria-label="Close search"
                onClick={() => setSearchOpen(false)}
                className="min-h-11 min-w-11 text-[var(--muted-ink)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-2">
              {searchText.length < 2 ? (
                <p className="p-6 text-center text-xs text-[var(--muted-ink)]">
                  Enter at least two characters.
                </p>
              ) : results.length ? (
                results.map((result) => (
                  <button
                    key={`${result.type}-${result.id}`}
                    onClick={() => {
                      setSearchOpen(false);
                      setLocation(result.href);
                    }}
                    className="flex min-h-14 w-full items-center gap-3 border-b border-[var(--line)] px-3 py-2 text-left hover:bg-[var(--panel-2)]"
                  >
                    <span className="flex h-8 w-8 items-center justify-center border border-[var(--line)] text-[var(--rust)]">
                      {result.type === "customer" ? (
                        <UserRound className="h-4 w-4" />
                      ) : result.type === "device" ? (
                        <Fingerprint className="h-4 w-4" />
                      ) : result.type === "case" ? (
                        <FileSearch className="h-4 w-4" />
                      ) : (
                        <Activity className="h-4 w-4" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-xs">
                        {result.title}
                      </strong>
                      <small className="mt-1 block truncate text-[10px] text-[var(--muted-ink)]">
                        {result.subtitle}
                      </small>
                    </span>
                    {result.riskScore !== undefined &&
                      result.riskScore !== null && (
                        <span className="font-mono-app text-xs font-bold">
                          {result.riskScore}
                        </span>
                      )}
                  </button>
                ))
              ) : (
                <p className="p-6 text-center text-xs text-[var(--muted-ink)]">
                  No matching merchant records.
                </p>
              )}
            </div>
          </section>
        </div>
      )}
      {notificationOpen && (
        <div className="fixed right-3 top-20 z-[65] w-[min(420px,calc(100vw-24px))] border border-[var(--line-bright)] bg-[var(--panel)] shadow-2xl">
          <div className="flex items-center justify-between border-b border-[var(--line)] p-4">
            <div>
              <p className="rail-label text-[var(--rust)]">Live alerts</p>
              <h2 className="mt-1 font-display text-lg uppercase">
                Notifications
              </h2>
            </div>
            <button
              aria-label="Close notifications"
              onClick={() => setNotificationOpen(false)}
              className="min-h-11 min-w-11"
            >
              <X className="mx-auto h-4 w-4" />
            </button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {notifications.length ? (
              notifications.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setNotificationOpen(false);
                    setLocation(item.href);
                  }}
                  className="w-full border-b border-[var(--line)] p-4 text-left hover:bg-[var(--panel-2)]"
                >
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--rust)]" />
                    <strong className="text-xs">{item.title}</strong>
                  </div>
                  <p className="mt-2 text-[11px] leading-5 text-[var(--muted-ink)]">
                    {item.detail}
                  </p>
                </button>
              ))
            ) : (
              <EmptyState
                title="No active alerts"
                body="New high-risk and spike alerts will appear here."
                icon={Bell}
              />
            )}
          </div>
        </div>
      )}
    </header>
  );
}

type ActiveDatasetStatus = {
  datasetId?: string;
  datasetName: string;
  activatedAt?: string;
  rowCount: number;
  source: "UPLOADED" | "BUNDLED_DEMO";
  scope: string;
};

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [location] = useLocation();
  const user = getStoredUser();
  const [activeDataset, setActiveDataset] = useState<ActiveDatasetStatus>();
  useEffect(() => {
    let mounted = true;
    const loadDataset = () => {
      void authenticatedRequest<ActiveDatasetStatus>("/datasets/active")
        .then((data) => {
          if (mounted) setActiveDataset(data);
        })
        .catch(() => undefined);
    };
    loadDataset();
    window.addEventListener("razorshield-dataset-changed", loadDataset);
    window.addEventListener(LIVE_DATA_REFRESH_EVENT, loadDataset);
    return () => {
      mounted = false;
      window.removeEventListener("razorshield-dataset-changed", loadDataset);
      window.removeEventListener(LIVE_DATA_REFRESH_EVENT, loadDataset);
    };
  }, []);
  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-30 bg-black/60 md:hidden",
          !open && "hidden",
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          "bench-sidebar",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-[77px] items-center justify-between border-b border-[var(--line)] px-5">
          <Link
            href="/"
            data-testid="link-brand-home"
            className="flex items-center gap-3"
            onClick={onClose}
          >
            <img
              src="/razorshield-logo.svg"
              width="40"
              height="40"
              alt=""
              aria-hidden="true"
              className="h-10 w-10 shrink-0 object-contain"
            />
            <span>
              <strong className="font-display text-[17px] uppercase tracking-tight text-[var(--ink)]">
                RazorShield
              </strong>
              <small className="mt-0.5 block font-mono-app text-[8px] uppercase tracking-[.2em] text-[var(--muted-ink)]">
                Risk foundry
              </small>
            </span>
          </Link>
          <button
            data-testid="button-close-navigation"
            onClick={onClose}
            className="text-[var(--muted-ink)] hover:text-[var(--ink)] md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-3 pt-7">
          <p className="rail-label px-3 pb-2">Command center</p>
          <nav className="space-y-1">
            {navItems
              .filter((item) => canAccess(user, item.roles))
              .map((item) => {
                const active = item.exact
                  ? location === item.href
                  : location.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    data-testid={`link-nav-${item.label.toLowerCase().replaceAll(" ", "-")}`}
                    className={cn("nav-link", active && "nav-link-active")}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </span>
                    {item.label === "Investigations" && (
                      <span className="font-mono-app text-[8px] text-[var(--brass)]">
                        LIVE
                      </span>
                    )}
                  </Link>
                );
              })}
          </nav>
          <p className="rail-label px-3 pb-2 pt-8">Governance</p>
          <nav className="space-y-1">
            {secondaryNav
              .filter((item) => canAccess(user, item.roles))
              .map((item) => {
                const active = location.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    data-testid={`link-nav-${item.label.toLowerCase().replaceAll(" ", "-")}`}
                    className={cn("nav-link", active && "nav-link-active")}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </span>
                  </Link>
                );
              })}
          </nav>
        </div>
        <div className="mt-auto p-4">
          <div className="mb-2 border border-[var(--line)] bg-[var(--canvas)] p-3">
            <p className="rail-label text-[var(--rust)]">Active access</p>
            <p className="mt-1 text-xs font-bold uppercase text-[var(--ink)]">
              {roleLabel(user?.role)}
            </p>
            <p className="mt-1 text-[10px] leading-4 text-[var(--muted-ink)]">
              Navigation and actions are limited by merchant policy.
            </p>
          </div>
          <div className="border border-[var(--line)] bg-[var(--panel-2)] p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--teal)]" />
              <span className="font-mono-app text-[9px] font-bold uppercase tracking-[.16em] text-[var(--teal)]">
                {activeDataset?.source === "UPLOADED"
                  ? "Dataset live"
                  : "Demo dataset"}
              </span>
            </div>
            <p className="truncate text-[11px] font-bold leading-4 text-[var(--ink)]">
              {activeDataset?.datasetName ?? "Loading dataset…"}
            </p>
            <p className="mt-1 text-[10px] leading-4 text-[var(--muted-ink)]">
              {activeDataset
                ? `${activeDataset.rowCount} rows · all sections scoped`
                : "Reading active scope"}
            </p>
            <div className="mt-3 flex items-center justify-between border-t border-[var(--line)] pt-2 font-mono-app text-[9px] text-[var(--muted-ink)]">
              <span>{activeDataset?.source ?? "VERSIONED V1"}</span>
              <LockKeyhole className="h-3 w-3" />
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

const workflowStages = [
  {
    label: "Transaction",
    href: "/assess",
    matches: ["/assess", "/transactions", "/datasets"],
    roles: analystRoles,
  },
  {
    label: "RazorShield AI",
    href: "/assess",
    matches: ["/fraud-intelligence", "/network"],
    roles: analystRoles,
  },
  {
    label: "Risk score",
    href: "/assess",
    matches: [],
    roles: analystRoles,
  },
  {
    label: "Why & evidence",
    href: "/investigations",
    matches: [],
    roles: investigationRoles,
  },
  {
    label: "AI investigation",
    href: "/investigations",
    matches: ["/investigations"],
    roles: investigationRoles,
  },
  {
    label: "Recommendation",
    href: "/investigations",
    matches: [],
    roles: investigationRoles,
  },
  {
    label: "Human decision",
    href: "/reviews",
    matches: ["/reviews"],
    roles: investigationRoles,
  },
  {
    label: "Audit",
    href: "/audit",
    matches: ["/audit", "/monitoring", "/analytics", "/evaluation"],
    roles: allRoles,
  },
];

function WorkflowJourney() {
  const [location] = useLocation();
  const user = getStoredUser();
  const visibleStages = workflowStages.filter((stage) =>
    canAccess(user, stage.roles),
  );
  const active = visibleStages.findIndex((stage) =>
    stage.matches.some((path) =>
      path === "/" ? location === "/" : location.startsWith(path),
    ),
  );
  return (
    <nav aria-label="RazorShield risk journey" className="workflow-journey">
      <p className="workflow-label">One automatic merchant workflow</p>
      <div className="workflow-track">
        {visibleStages.map((stage, index) => (
          <Link
            key={stage.label}
            href={stage.href}
            aria-current={active === index ? "step" : undefined}
            className={cn(
              "workflow-stage",
              active === index && "workflow-stage-active",
              active > index && "workflow-stage-complete",
            )}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{stage.label}</strong>
          </Link>
        ))}
      </div>
    </nav>
  );
}

function Shell({
  children,
  title,
  eyebrow,
}: {
  children: ReactNode;
  title: string;
  eyebrow: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="noise-overlay bench-grid flex min-h-[100dvh] text-[var(--ink)]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only fixed left-3 top-3 z-[100] bg-[var(--rust)] px-4 py-3 text-xs font-bold text-[var(--canvas)]"
      >
        Skip to main content
      </a>
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="min-w-0 flex-1">
        <Header
          title={title}
          eyebrow={eyebrow}
          onMenu={() => setMenuOpen(true)}
        />
        <WorkflowJourney />
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto max-w-[1640px] p-4 md:p-7 xl:p-9"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  detail,
  action,
}: {
  eyebrow?: string;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="rail-label text-[var(--rust)]">{eyebrow}</p>}
        <h2 className="mt-1 font-display text-xl uppercase leading-none tracking-[-.015em] text-[var(--ink)]">
          {title}
        </h2>
        {detail && (
          <p className="mt-2 text-xs text-[var(--muted-ink)]">{detail}</p>
        )}
      </div>
      {action}
    </div>
  );
}

function MetricCard({
  label,
  value,
  subtext,
  icon: Icon,
  tone = "neutral",
  trend,
}: {
  label: string;
  value: string;
  subtext: string;
  icon: LucideIcon;
  tone?: "neutral" | "danger" | "gold" | "teal";
  trend?: "up" | "down";
}) {
  return (
    <div className="bench-panel group p-4 transition-transform hover:-translate-y-0.5">
      <div className="flex items-start justify-between">
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center border",
            tone === "danger"
              ? "border-[var(--rust)]/60 bg-[var(--rust)]/10 text-[var(--rust)]"
              : tone === "gold"
                ? "border-[var(--brass)]/60 bg-[var(--brass)]/10 text-[var(--brass)]"
                : tone === "teal"
                  ? "border-[var(--teal)]/60 bg-[var(--teal)]/10 text-[var(--teal)]"
                  : "border-[var(--line)] bg-[var(--panel-2)] text-[var(--muted-ink)]",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        {trend && (
          <span
            className={cn(
              "flex items-center gap-0.5 font-mono-app text-[9px] font-bold",
              trend === "up" ? "text-[var(--rust)]" : "text-[var(--teal)]",
            )}
          >
            {trend === "up" ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}{" "}
            7D
          </span>
        )}
      </div>
      <p className="mt-5 font-mono-app text-2xl font-bold tracking-[-.08em] text-[var(--ink)]">
        {value}
      </p>
      <p className="mt-1 text-xs font-bold uppercase tracking-wide text-[var(--ink)]">
        {label}
      </p>
      <p className="mt-1 text-[11px] text-[var(--muted-ink)]">{subtext}</p>
    </div>
  );
}

function Sparkline({
  trend,
}: {
  trend: Array<{ label: string; risk: number; volume: number }>;
}) {
  const values = trend.length
    ? trend.map((point) => point.risk)
    : [28, 34, 31, 40, 37, 43, 40];
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);
  const points = values
    .map(
      (value, index) =>
        `${(index / Math.max(values.length - 1, 1)) * 100},${94 - ((value - min) / span) * 70}`,
    )
    .join(" ");
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="h-full w-full"
      aria-label="Risk trend chart"
    >
      <defs>
        <linearGradient id="riskFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--rust)" stopOpacity=".32" />
          <stop offset="1" stopColor="var(--rust)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        points={`0,100 ${points} 100,100`}
        fill="url(#riskFill)"
        stroke="none"
      />
      <polyline
        points={points}
        fill="none"
        stroke="var(--rust)"
        strokeWidth="2.2"
        strokeLinecap="square"
        strokeLinejoin="miter"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function TransactionRow({
  transaction,
  selected,
  onSelect,
}: {
  transaction: RiskTransaction;
  selected?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      data-testid={`button-transaction-${transaction.transactionId}`}
      onClick={onSelect}
      className={cn(
        "spec-row w-full px-4 py-3 text-left",
        selected && "spec-row-active",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-mono-app text-xs font-bold text-[var(--ink)]">
            {transaction.transactionId}
          </span>
          <RiskBadge
            level={transaction.riskLevel}
            score={transaction.riskScore}
          />
        </div>
        <span className="font-mono-app text-xs font-bold text-[var(--ink)]">
          {formatMoney(transaction.amount, transaction.currency)}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-[var(--muted-ink)]">
        <span className="truncate">
          {transaction.customerId}
          <span className="px-1 text-[var(--line)]">/</span>
          {transaction.merchantId}
        </span>
        <span>{formatTime(transaction.timestamp)}</span>
      </div>
    </button>
  );
}

function OverviewPage() {
  const [, setLocation] = useLocation();
  const user = getStoredUser();
  const mayReadCases = canAccess(user, investigationRoles);
  const experience = user ? roleExperience[user.role] : undefined;
  const overviewQuery = useApiData<RiskOverview>("/risk/overview");
  const transactionQuery = useApiData<RiskTransaction[]>("/risk/transactions", {
    enabled: mayReadCases,
  });
  const analyticsQuery = useApiData<AnalyticsPayload>("/analytics");
  const overview = overviewQuery.data as RiskOverview | undefined;
  const transactions = useMemo(
    () => transactionQuery.data ?? [],
    [transactionQuery.data],
  );
  const trend = overview?.trend ?? [];
  const signalComposition = useMemo(() => {
    const average = (
      key: "behaviorScore" | "velocityScore" | "graphScore" | "anomalyScore",
    ) =>
      transactions.length
        ? transactions.reduce((sum, item) => sum + scoreValue(item[key]), 0) /
          transactions.length
        : 0;
    return [
      ["Behavioral pattern", average("behaviorScore"), "teal"],
      ["Velocity pressure", average("velocityScore"), "brass"],
      ["Graph proximity", average("graphScore"), "rust"],
      ["Anomaly signature", average("anomalyScore"), "rust"],
    ] as Array<[string, number, string]>;
  }, [transactions]);
  const explainabilityCoverage = transactions.length
    ? (transactions.filter((item) => item.factors?.length).length /
        transactions.length) *
      100
    : 0;
  const highRiskTransactions = useMemo(
    () =>
      transactions.filter(
        (transaction) =>
          riskTone(transaction.riskLevel, transaction.riskScore) === "high",
      ),
    [transactions],
  );
  const strongestSignal = signalComposition.reduce(
    (strongest, signal) => (signal[1] > strongest[1] ? signal : strongest),
    signalComposition[0],
  );
  return (
    <Shell title="Risk overview" eyebrow="Dashboard / Live posture">
      <div className="rs-reveal mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono-app text-[10px] uppercase tracking-[.26em] text-[var(--muted-ink)]">
            Inspection window / Current stored events
          </p>
          <h2 className="mt-2 font-display text-4xl uppercase leading-[.88] tracking-[-.03em] text-[var(--ink)] md:text-6xl">
            Know the
            <br />
            <span className="text-[var(--rust)]">signal.</span> Own
            <br />
            the verdict.
          </h2>
        </div>
        <button
          data-testid="button-refresh-overview"
          onClick={() => {
            void overviewQuery.refetch();
            void transactionQuery.refetch();
          }}
          className="bench-button"
        >
          <RefreshCw
            className={cn(
              "h-3.5 w-3.5",
              overviewQuery.isFetching && "animate-spin",
            )}
          />{" "}
          Refresh posture
        </button>
      </div>
      {user && experience && (
        <section className="mb-5 flex flex-wrap items-center justify-between gap-4 border border-[var(--line)] bg-[var(--panel-2)] p-4">
          <div>
            <p className="rail-label text-[var(--rust)]">
              {user.display_name} / {roleLabel(user.role)}
            </p>
            <h3 className="mt-1 font-display text-xl uppercase">
              {experience.title}
            </h3>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--muted-ink)]">
              {experience.detail}
            </p>
          </div>
          <Link href={experience.href} className="bench-button min-h-11">
            {experience.cta}
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </section>
      )}
      <QueryState
        error={overviewQuery.isError}
        onRetry={() => void overviewQuery.refetch()}
      />
      {overviewQuery.isLoading ? (
        <div className="grid gap-3 xl:grid-cols-[1.05fr_1.95fr]">
          <LoadingBlock className="h-64" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <LoadingBlock key={item} className="h-28" />
            ))}
          </div>
        </div>
      ) : (
        overview && (
          <div className="grid gap-3 xl:grid-cols-[1.05fr_1.95fr]">
            <div className="relative min-h-64 overflow-hidden border border-[var(--rust)] bg-[var(--rust)] p-5 text-[var(--canvas)]">
              <div className="absolute -right-8 -top-12 h-52 w-52 border-[22px] border-[var(--canvas)]/10" />
              <div className="relative flex h-full flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-mono-app text-[9px] font-bold uppercase tracking-[.2em] text-[var(--canvas)]/65">
                      Current risk posture
                    </p>
                    <span className="flex items-center gap-1.5 border border-[var(--canvas)]/35 px-2 py-1 font-mono-app text-[9px] font-bold uppercase tracking-wider">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--teal)]" />
                      {overview.spikeStatus || "Nominal"}
                    </span>
                  </div>
                  <div className="mt-8 flex items-end gap-2">
                    <span className="font-display text-7xl leading-none tracking-[-.1em] text-[var(--canvas)]">
                      {scoreLabel(overview.averageRiskScore)}
                    </span>
                    <span className="mb-2 font-mono-app text-sm text-[var(--canvas)]/60">
                      / 100
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-bold uppercase tracking-wide text-[var(--canvas)]/75">
                    Average scored risk
                  </p>
                </div>
                <div className="mt-10 border-t border-[var(--canvas)]/20 pt-4">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[var(--canvas)]/60">Fraud rate</span>
                    <span className="font-mono-app font-bold">
                      {scoreValue(overview.fraudRate).toFixed(1)}%
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 bg-[var(--canvas)]/15">
                    <div
                      className="h-full bg-[var(--brass)]"
                      style={{
                        width: `${Math.min(scoreValue(overview.fraudRate) * 4, 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <MetricCard
                label="Transactions analyzed"
                value={formatCompact(overview.transactionsAnalyzed)}
                subtext="Current merchant scope"
                icon={Activity}
              />
              <MetricCard
                label="High-risk events"
                value={formatCompact(overview.highRisk)}
                subtext="Require analyst attention"
                icon={ShieldAlert}
                tone="danger"
                trend="up"
              />
              <MetricCard
                label="Active cases"
                value={formatCompact(overview.activeInvestigations)}
                subtext="Waiting for investigation or review"
                icon={FileSearch}
              />
              <MetricCard
                label="Fraud detected"
                value={formatCompact(overview.fraudDetected)}
                subtext="Confirmed in current window"
                icon={Fingerprint}
                tone="gold"
              />
              <MetricCard
                label="Loss prevented"
                value={formatMoney(overview.preventedLoss)}
                subtext="Confirmed defensive outcomes"
                icon={Coins}
                tone="teal"
                trend="down"
              />
              <MetricCard
                label="Emerging fraud spike"
                value={overview.spikeStatus || "Insufficient data"}
                subtext="Latest events vs prior baseline"
                icon={Siren}
                tone={
                  overview.spikeStatus?.toLowerCase().includes("spike")
                    ? "danger"
                    : "teal"
                }
              />
            </div>
          </div>
        )
      )}
      {analyticsQuery.data && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Chargeback candidates"
            value={formatCompact(analyticsQuery.data.chargebackCandidates)}
            subtext="Evidence workflows available"
            icon={ShieldAlert}
          />
          <MetricCard
            label="Return-risk cases"
            value={formatCompact(analyticsQuery.data.returnRiskCases)}
            subtext="Separate from fraud"
            icon={ArrowDownRight}
            tone="gold"
          />
          <MetricCard
            label="Potential loss"
            value={formatMoney(
              analyticsQuery.data.potentialLoss,
              analyticsQuery.data.currency,
            )}
            subtext="Flagged value, not prevented savings"
            icon={Coins}
            tone="danger"
          />
          <MetricCard
            label="Review workload"
            value={formatCompact(analyticsQuery.data.openReviewWorkload)}
            subtext="Open human decisions"
            icon={Users}
          />
        </div>
      )}
      {overview && (
        <section className="mt-6">
          <SectionHeading
            eyebrow="Merchant decision brief"
            title="Four questions, answered"
            detail="Live signals translated into the next useful decision."
          />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                number: "01",
                question: "What's happening?",
                answer: `${formatCompact(overview.transactionsAnalyzed)} transactions are in the current risk window.`,
                href: mayReadCases ? "/transactions" : "/analytics",
                cta: mayReadCases ? "View transactions" : "View analytics",
                icon: Activity,
              },
              {
                number: "02",
                question: "What's dangerous?",
                answer: `${formatCompact(overview.highRisk)} high-risk events. Spike status: ${overview.spikeStatus || "insufficient data"}.`,
                href: canAccess(getStoredUser(), analystRoles)
                  ? "/fraud-intelligence"
                  : "/analytics",
                cta: "Inspect danger",
                icon: ShieldAlert,
              },
              {
                number: "03",
                question: "Why is it happening?",
                answer: mayReadCases
                  ? `${strongestSignal[0]} is the strongest measured component at ${strongestSignal[1].toFixed(1)}%.`
                  : "Versioned model telemetry explains the current risk posture.",
                href: canAccess(getStoredUser(), analystRoles)
                  ? "/network"
                  : "/monitoring",
                cta: "Review evidence",
                icon: Network,
              },
              {
                number: "04",
                question: "What should I do?",
                answer: `${formatCompact(overview.activeInvestigations)} cases require human attention; RazorShield executes no financial action automatically.`,
                href: mayReadCases ? "/reviews" : "/analytics",
                cta: mayReadCases ? "Open case queue" : "Review workload",
                icon: Users,
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <article
                  key={item.number}
                  className="bench-panel flex min-h-52 flex-col p-5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono-app text-[10px] font-bold text-[var(--rust)]">
                      {item.number}
                    </span>
                    <Icon
                      className="h-4 w-4 text-[var(--rust)]"
                      aria-hidden="true"
                    />
                  </div>
                  <h3 className="mt-6 font-display text-xl uppercase">
                    {item.question}
                  </h3>
                  <p className="mt-3 text-xs leading-5 text-[var(--muted-ink)]">
                    {item.answer}
                  </p>
                  <Link
                    href={item.href}
                    className="mt-auto inline-flex min-h-11 items-center gap-1 pt-4 font-mono-app text-[10px] font-bold uppercase tracking-wider text-[var(--rust)]"
                  >
                    {item.cta}{" "}
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </article>
              );
            })}
          </div>
        </section>
      )}
      <div
        className={cn(
          "mt-6 grid gap-3",
          mayReadCases && "xl:grid-cols-[1.45fr_1fr]",
        )}
      >
        <section className="rs-reveal rs-reveal-1 bench-panel p-5">
          <SectionHeading
            eyebrow="Signal over time"
            title="Risk intensity"
            detail="Movement across the latest scored activity"
          />
          <div className="relative h-56 overflow-hidden border border-[var(--line)] bg-[var(--canvas)] bench-grid">
            <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-[var(--line)]" />
            <div className="absolute inset-x-4 bottom-7 top-4">
              <Sparkline trend={trend} />
            </div>
            <div className="absolute inset-x-4 bottom-2 flex justify-between font-mono-app text-[9px] text-[var(--muted-ink)]">
              {(trend.length ? trend : [{ label: "No data" }]).map(
                (point, index) => (
                  <span key={`${point.label}-${index}`}>{point.label}</span>
                ),
              )}
            </div>
          </div>
        </section>
        {mayReadCases && (
          <section className="rs-reveal rs-reveal-2 bench-panel p-5">
            <SectionHeading
              eyebrow="Model telemetry"
              title="Signal composition"
              detail="Measured averages across stored events"
            />
            <div className="space-y-4">
              {signalComposition.map(([label, value, tone]) => (
                <div key={label}>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-bold">{label}</span>
                    <span className="font-mono-app text-[var(--muted-ink)]">
                      {value.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 bg-[var(--panel-2)]">
                    <div
                      className={cn(
                        "h-full",
                        tone === "teal"
                          ? "bg-[var(--teal)]"
                          : tone === "brass"
                            ? "bg-[var(--brass)]"
                            : "bg-[var(--rust)]",
                      )}
                      style={{ width: `${value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex items-center gap-2 border-t border-[var(--line)] pt-4 text-[11px] text-[var(--muted-ink)]">
              <Sparkles className="h-3.5 w-3.5 text-[var(--brass)]" />{" "}
              Explainability coverage{" "}
              <span className="ml-auto font-mono-app font-bold text-[var(--ink)]">
                {explainabilityCoverage.toFixed(1)}%
              </span>
            </div>
          </section>
        )}
      </div>
      {mayReadCases && (
        <section className="rs-reveal rs-reveal-3 mt-6 bench-panel">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] p-5">
            <div>
              <p className="rail-label text-[var(--rust)]">Priority queue</p>
              <h2 className="mt-1 font-display text-xl uppercase leading-none">
                Recent high-risk transactions
              </h2>
            </div>
            <Link
              href="/investigations"
              data-testid="link-view-all-investigations"
              className="inline-flex items-center gap-1 font-mono-app text-[10px] font-bold uppercase tracking-wider text-[var(--rust)] hover:text-[var(--brass)]"
            >
              Open investigation queue <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {transactionQuery.isLoading ? (
            <div className="space-y-1 p-4">
              {[1, 2, 3].map((item) => (
                <LoadingBlock key={item} className="h-14" />
              ))}
            </div>
          ) : transactionQuery.isError ? (
            <div className="p-4">
              <QueryState
                error
                onRetry={() => void transactionQuery.refetch()}
              />
            </div>
          ) : highRiskTransactions.length ? (
            <div>
              {highRiskTransactions.slice(0, 5).map((transaction) => (
                <TransactionRow
                  key={transaction.transactionId}
                  transaction={transaction}
                  onSelect={() =>
                    setLocation(
                      `/investigations?transaction=${transaction.transactionId}`,
                    )
                  }
                />
              ))}
            </div>
          ) : (
            <div className="p-4">
              <EmptyState
                title="No high-risk activity"
                body="No event in the current merchant scope crosses the high-risk threshold."
              />
            </div>
          )}
        </section>
      )}
    </Shell>
  );
}

function TransactionsPage() {
  const [, setLocation] = useLocation();
  const query = useApiData<RiskTransaction[]>("/risk/transactions");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const transactions = useMemo(
    () =>
      (query.data ?? []).filter((item) => {
        const term = search.trim().toLowerCase();
        const matchesSearch =
          !term ||
          [item.transactionId, item.customerId, item.merchantId].some((value) =>
            value.toLowerCase().includes(term),
          );
        return (
          matchesSearch &&
          (filter === "all" ||
            riskTone(item.riskLevel, item.riskScore) === filter)
        );
      }),
    [query.data, search, filter],
  );
  return (
    <Shell title="Transactions" eyebrow="Event ledger / Scored activity">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="rail-label text-[var(--rust)]">Merchant event stream</p>
          <h2 className="mt-1 font-display text-3xl uppercase">
            Scored transactions
          </h2>
          <p className="mt-2 text-xs text-[var(--muted-ink)]">
            Search the merchant-scoped ledger, then open any event for evidence
            and review.
          </p>
        </div>
        <Link href="/assess" className="bench-button">
          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Assess
          transactions
        </Link>
      </div>
      <div className="mb-4 flex flex-wrap gap-3">
        <label className="relative min-w-[260px] flex-1">
          <span className="sr-only">Search transactions</span>
          <Search
            className="absolute left-3 top-3 h-4 w-4 text-[var(--muted-ink)]"
            aria-hidden="true"
          />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search transaction, customer, merchant…"
            className="h-10 w-full border border-[var(--input-line)] bg-[var(--panel)] pl-9 pr-3 text-xs outline-none focus:border-[var(--rust)]"
          />
        </label>
        <div className="flex gap-2" aria-label="Risk level filter">
          {["all", "high", "medium", "low"].map((item) => (
            <button
              key={item}
              onClick={() => setFilter(item)}
              className={cn(
                "filter-button",
                filter === item && "filter-active",
              )}
              aria-pressed={filter === item}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      {query.isError ? (
        <QueryState error onRetry={() => void query.refetch()} />
      ) : query.isLoading ? (
        <LoadingBlock className="h-96" />
      ) : transactions.length ? (
        <section className="bench-panel overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-xs">
            <thead className="border-b border-[var(--line)] bg-[var(--canvas)] font-mono-app text-[9px] uppercase tracking-wider text-[var(--muted-ink)]">
              <tr>
                {[
                  "Transaction",
                  "Customer",
                  "Risk",
                  "Amount",
                  "Fraud",
                  "Anomaly",
                  "Time",
                  "",
                ].map((label) => (
                  <th key={label} className="px-4 py-3">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transactions.map((item) => (
                <tr
                  key={item.transactionId}
                  className="border-b border-[var(--line)] hover:bg-[var(--panel-2)]"
                >
                  <td className="px-4 py-4 font-mono-app font-bold text-[var(--rust)]">
                    {item.transactionId}
                  </td>
                  <td className="px-4 py-4">
                    <Link
                      href={`/entities/customers/${item.customerId}`}
                      className="hover:text-[var(--rust)]"
                    >
                      {item.customerId}
                    </Link>
                  </td>
                  <td className="px-4 py-4">
                    <RiskBadge level={item.riskLevel} score={item.riskScore} />
                  </td>
                  <td className="px-4 py-4 font-mono-app">
                    {formatMoney(item.amount, item.currency)}
                  </td>
                  <td className="px-4 py-4 font-mono-app">
                    {scoreLabel(item.fraudProbability)}
                  </td>
                  <td className="px-4 py-4 font-mono-app">
                    {scoreLabel(item.anomalyScore)}
                  </td>
                  <td className="px-4 py-4 text-[var(--muted-ink)]">
                    {formatTime(item.timestamp)}
                  </td>
                  <td className="px-4 py-4">
                    <button
                      onClick={() =>
                        setLocation(`/investigations/${item.transactionId}`)
                      }
                      className="bench-button"
                    >
                      Inspect{" "}
                      <ChevronRight className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <EmptyState
          title="No matching transactions"
          body="Adjust the search or risk filter, or assess a new transaction."
          icon={Activity}
        />
      )}
    </Shell>
  );
}

type DatasetAssessment = {
  transaction_id: string;
  risk_score: number;
  risk_level: string;
  recommended_action: string;
  fraud_probability?: number;
  anomaly_score?: number;
  return_risk_score?: number;
  inference_latency_ms?: number;
};

type DatasetIngestionReport = {
  schemaMapping: Record<string, string>;
  transformedFields: string[];
  unmappedColumns: string[];
  warnings: string[];
};

const DATASET_TEMPLATE_HEADERS = [
  "transaction_id",
  "customer_id",
  "customer_name",
  "customer_email",
  "customer_phone",
  "customer_verification_status",
  "sender_account_reference",
  "sender_bank_name",
  "sender_bank_ifsc",
  "amount",
  "currency",
  "device_id",
  "location",
  "payment_method",
  "timestamp",
  "transactions_last_5_minutes",
  "transactions_last_15_minutes",
  "transactions_last_hour",
  "failed_attempts_last_10_minutes",
  "customer_average_amount",
  "is_new_device",
  "is_new_location",
  "shared_device_accounts",
  "historical_return_rate",
  "customer_age",
  "account_age_days",
  "historical_fraud_count",
  "recipient_id",
  "recipient_name",
  "recipient_account_reference",
  "recipient_bank_name",
  "recipient_bank_ifsc",
  "recipient_email",
  "recipient_phone",
  "recipient_type",
  "recipient_category",
  "recipient_verified",
  "recipient_used_before",
  "recipient_risk_score",
  "recipient_transaction_count",
  "customer_recipient_transactions",
  "transactions_to_same_recipient_last_15_minutes",
  "amount_to_same_recipient_last_hour",
  "unique_customers_to_recipient",
  "unique_devices_to_recipient",
  "transaction_intent",
  "fraud_label",
  "return_label",
];

function parseCsvDataset(text: string): Array<Record<string, unknown>> {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"' && quoted && text[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) {
      record.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      record.push(field);
      field = "";
      if (record.some((value) => value.trim())) records.push(record);
      record = [];
    } else field += character;
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  record.push(field);
  if (record.some((value) => value.trim())) records.push(record);
  const [rawHeaders, ...rows] = records;
  if (!rawHeaders?.length)
    throw new Error("CSV does not contain a header row.");
  const headers = rawHeaders.map((value) =>
    value.replace(/^\uFEFF/, "").trim(),
  );
  return rows.map((values) =>
    Object.fromEntries(
      headers.map((header, index) => [header, values[index]?.trim() ?? ""]),
    ),
  );
}

function normalizeDatasetRows(rows: Array<Record<string, unknown>>) {
  if (!Array.isArray(rows) || rows.length === 0)
    throw new Error("The dataset contains no transaction rows.");
  if (rows.length > 5_000)
    throw new Error(
      "A dataset can contain at most 5,000 transactions per upload.",
    );
  return rows.map((source, rowIndex) => {
    const normalized: Record<string, unknown> = {};
    Object.entries(source).forEach(([rawKey, rawValue]) => {
      const snakeKey = rawKey
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
      const compactKey = snakeKey.replaceAll("_", "");
      const key = compactKey ? snakeKey : `column_${rowIndex + 1}`;
      if (rawValue === "" || rawValue === null || rawValue === undefined)
        return;
      normalized[key] = rawValue;
    });
    return normalized;
  });
}

function downloadDatasetFile(
  filename: string,
  content: string,
  mimeType: string,
) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function DatasetAnalysisPage() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const user = JSON.parse(
    sessionStorage.getItem("razorshield_user") ?? "{}",
  ) as AuthUser;
  const [fileName, setFileName] = useState("");
  const [results, setResults] = useState<DatasetAssessment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [trainingBusy, setTrainingBusy] = useState(false);
  const [trainingError, setTrainingError] = useState("");
  const [ingestionReport, setIngestionReport] =
    useState<DatasetIngestionReport>();
  const [trainingResult, setTrainingResult] = useState<{
    modelVersion: string;
    rows: number;
    heldOutRows: number;
    status: string;
    provenance: string;
    split: string;
    fraudMetrics: Record<string, number | number[][]>;
    fusionMetrics: Record<string, number | number[][]>;
    returnMetrics: Record<string, number | number[][]>;
  }>();

  const upload = async (file?: File) => {
    if (!file) return;
    setFileName(file.name);
    setResults([]);
    setError("");
    setTrainingResult(undefined);
    setTrainingError("");
    setIngestionReport(undefined);
    if (file.size > 25_000_000) {
      setError(
        "The file is larger than 25 MB. Split it into files of 5,000 rows or fewer.",
      );
      return;
    }
    const extension = file.name.toLowerCase().split(".").pop();
    if (!["csv", "json"].includes(extension ?? "")) {
      setError(
        "Unsupported file type. Upload a .csv or .json transaction dataset.",
      );
      return;
    }
    setBusy(true);
    try {
      const text = await file.text();
      let rows: Array<Record<string, unknown>>;
      if (extension === "json") {
        const parsed = JSON.parse(text) as
          | Array<Record<string, unknown>>
          | { transactions?: Array<Record<string, unknown>> };
        rows = Array.isArray(parsed) ? parsed : (parsed.transactions ?? []);
      } else rows = parseCsvDataset(text);
      const transactions = normalizeDatasetRows(rows);
      const response = await authenticatedRequest<{
        processed: number;
        dataset_id: string;
        dataset_name: string;
        activated_at: string;
        assessments: DatasetAssessment[];
        schema_mapping: Record<string, string>;
        transformed_fields: string[];
        unmapped_columns: string[];
        ingestion_warnings: string[];
      }>("/risk/assess/batch", {
        method: "POST",
        body: JSON.stringify({ transactions, dataset_name: file.name }),
      });
      setResults(response.assessments);
      setIngestionReport({
        schemaMapping: response.schema_mapping,
        transformedFields: response.transformed_fields,
        unmappedColumns: response.unmapped_columns,
        warnings: response.ingestion_warnings,
      });
      window.dispatchEvent(new Event("razorshield-dataset-changed"));
      announceLiveDataRefresh();
      await queryClient.invalidateQueries();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Dataset assessment failed.",
      );
    } finally {
      setBusy(false);
    }
  };
  const trainOnce = async () => {
    setTrainingBusy(true);
    setTrainingError("");
    try {
      const trained = await authenticatedRequest<
        NonNullable<typeof trainingResult>
      >("/risk/train/active-dataset", { method: "POST" });
      setTrainingResult(trained);
      announceLiveDataRefresh();
      await queryClient.invalidateQueries();
    } catch (caught) {
      setTrainingError(
        caught instanceof Error ? caught.message : "Model training failed.",
      );
    } finally {
      setTrainingBusy(false);
    }
  };
  const distribution = results.reduce(
    (counts, item) => ({
      ...counts,
      [riskTone(item.risk_level, item.risk_score)]:
        counts[riskTone(item.risk_level, item.risk_score)] + 1,
    }),
    { high: 0, medium: 0, low: 0 },
  );
  const averageScore = results.length
    ? results.reduce((sum, item) => sum + item.risk_score, 0) / results.length
    : 0;
  const averageLatency = results.length
    ? results.reduce((sum, item) => sum + (item.inference_latency_ms ?? 0), 0) /
      results.length
    : 0;
  const downloadResults = () => {
    const escape = (value: unknown) =>
      `"${String(value ?? "").replaceAll('"', '""')}"`;
    const headers = [
      "transaction_id",
      "risk_score",
      "risk_level",
      "recommended_action",
      "fraud_probability",
      "anomaly_score",
      "return_risk_score",
      "inference_latency_ms",
    ];
    const csv = [
      headers.join(","),
      ...results.map((item) =>
        headers
          .map((header) => escape(item[header as keyof DatasetAssessment]))
          .join(","),
      ),
    ].join("\n");
    downloadDatasetFile(
      "razorshield-results.csv",
      csv,
      "text/csv;charset=utf-8",
    );
  };
  const downloadTemplate = () => {
    const sample = [
      `TX-UPLOAD-${Date.now().toString().slice(-6)}`,
      "CUS-UPLOAD-001",
      "Synthetic Sender",
      "sender@example.test",
      "+919000000001",
      "VERIFIED",
      "SYNTH-SEND-0001",
      "Example Sender Bank",
      "TEST0000001",
      "12500",
      "INR",
      "DEV-101",
      "Hyderabad",
      "Card",
      new Date().toISOString(),
      "2",
      "5",
      "8",
      "0",
      "4200",
      "true",
      "false",
      "1",
      "0.08",
      "34",
      "600",
      "0",
      "REC-101",
      "Synthetic Recipient",
      "SYNTH-RECV-0001",
      "Example Recipient Bank",
      "TEST0000002",
      "recipient@example.test",
      "+918000000001",
      "BANK_ACCOUNT",
      "SHOPPING",
      "true",
      "true",
      "0.12",
      "12",
      "3",
      "1",
      "12500",
      "4",
      "3",
      "SHOPPING",
      "false",
      "false",
    ];
    downloadDatasetFile(
      "razorshield-dataset-template.csv",
      `${DATASET_TEMPLATE_HEADERS.join(",")}\n${sample.join(",")}\n`,
      "text/csv;charset=utf-8",
    );
  };
  return (
    <Shell
      title="Dataset analysis"
      eyebrow="File ingestion / Backend inference"
    >
      <div className="mb-7">
        <p className="rail-label text-[var(--rust)]">
          Structured batch scoring
        </p>
        <h2 className="mt-1 font-display text-3xl uppercase">
          Upload data. Inspect every verdict.
        </h2>
        <p className="mt-2 max-w-3xl text-xs leading-5 text-[var(--muted-ink)]">
          CSV and JSON transaction records are validated, scored by the same
          versioned backend models as live events, persisted to your merchant
          account, and reflected across dashboards and investigations.
        </p>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <section aria-busy={busy} className="bench-panel p-5">
          <SectionHeading
            eyebrow="Dataset input"
            title={fileName || "Choose a transaction file"}
            detail="Maximum 5,000 rows and 25 MB per upload"
            action={
              <button
                type="button"
                onClick={downloadTemplate}
                className="bench-button"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" /> CSV
                template
              </button>
            }
          />
          <label
            className={cn(
              "flex min-h-48 cursor-pointer flex-col items-center justify-center border border-dashed border-[var(--line-bright)] bg-[var(--canvas)] p-6 text-center hover:border-[var(--rust)]",
              busy && "pointer-events-none opacity-60",
            )}
          >
            <Upload className="h-8 w-8 text-[var(--rust)]" aria-hidden="true" />
            <strong className="mt-4 text-sm">
              {busy
                ? "Validating and running inference…"
                : "Select CSV or JSON dataset"}
            </strong>
            <span className="mt-2 text-xs text-[var(--muted-ink)]">
              Common schemas are mapped automatically. A recognizable amount
              column is required.
            </span>
            <input
              type="file"
              accept=".csv,.json,application/json,text/csv"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void upload(file);
              }}
              className="sr-only"
            />
          </label>
          {error && (
            <div
              role="alert"
              className="mt-4 border border-[var(--rust)] bg-[var(--rust)]/10 p-3 text-xs leading-5 text-[var(--rust)]"
            >
              <strong className="block">Dataset was not processed</strong>
              {error}
            </div>
          )}
          {results.length > 0 && (
            <div className="mt-4 space-y-3">
              <p
                role="status"
                className="border border-[var(--teal)]/60 bg-[var(--teal)]/10 p-3 text-xs font-bold text-[var(--teal)]"
              >
                {results.length} rows converted, scored, and stored. Dashboard,
                transactions, reviews, graph, and analytics now use the uploaded
                records.
              </p>
              {ingestionReport && (
                <div className="border border-[var(--line)] bg-[var(--canvas)] p-4 text-xs leading-5">
                  <strong className="block">Schema conversion report</strong>
                  <p className="mt-1 text-[var(--muted-ink)]">
                    {Object.keys(ingestionReport.schemaMapping).length} columns
                    mapped · {ingestionReport.transformedFields.length} value
                    conversions
                  </p>
                  {ingestionReport.transformedFields.length > 0 && (
                    <p className="mt-2 text-[var(--teal)]">
                      Converted: {ingestionReport.transformedFields.join(" · ")}
                    </p>
                  )}
                  {ingestionReport.unmappedColumns.length > 0 && (
                    <p className="mt-2 text-[var(--brass)]">
                      Stored dataset accepted; unused columns:{" "}
                      {ingestionReport.unmappedColumns.join(", ")}
                    </p>
                  )}
                  {ingestionReport.warnings.map((warning) => (
                    <p key={warning} className="mt-2 text-[var(--brass)]">
                      {warning}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
        <section className="bench-panel p-5">
          <SectionHeading
            eyebrow="Accepted schema"
            title="Fields and behavior"
          />
          <dl className="space-y-4 text-xs">
            <div className="border-b border-[var(--line)] pb-3">
              <dt className="font-bold">Automatic schema matching</dt>
              <dd className="mt-1 font-mono-app text-[10px] text-[var(--muted-ink)]">
                Common transaction, customer, amount, velocity, recipient, and
                outcome aliases are converted by the backend.
              </dd>
            </div>
            <div className="border-b border-[var(--line)] pb-3">
              <dt className="font-bold">Optional risk context</dt>
              <dd className="mt-1 leading-5 text-[var(--muted-ink)]">
                Device, location, payment method, timestamp, velocity, failed
                attempts, customer average, novelty, shared accounts, and return
                rate.
              </dd>
            </div>
            <div className="border-b border-[var(--line)] pb-3">
              <dt className="font-bold">Training outcomes</dt>
              <dd className="mt-1 leading-5 text-[var(--muted-ink)]">
                fraud_label and return_label must be true/false or 1/0. One-time
                training requires at least 100 fully labeled rows and 10 rows
                from each class.
              </dd>
            </div>
            <div>
              <dt className="font-bold">Safety boundary</dt>
              <dd className="mt-1 leading-5 text-[var(--muted-ink)]">
                Unused columns are reported rather than silently changing risk.
                A missing transaction/customer ID receives a row-specific
                fallback. Upload never retrains automatically.
              </dd>
            </div>
          </dl>
        </section>
      </div>
      {results.length > 0 && (
        <>
          <section className="mt-5 bench-panel p-5" aria-busy={trainingBusy}>
            <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="rail-label text-[var(--rust)]">
                  Controlled training
                </p>
                <h2 className="mt-1 font-display text-2xl uppercase">
                  Train once on labeled outcomes
                </h2>
                <p className="mt-2 max-w-3xl text-xs leading-5 text-[var(--muted-ink)]">
                  Builds new fraud, anomaly, fusion, and return models from this
                  active dataset, evaluates a held-out split, versions the
                  artifacts, and keeps the prior manifest for rollback.
                </p>
              </div>
              {user.role === "ADMIN" ? (
                <button
                  type="button"
                  onClick={() => void trainOnce()}
                  disabled={trainingBusy || Boolean(trainingResult)}
                  className="bench-button min-h-11 justify-center"
                >
                  {trainingBusy ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {trainingBusy
                    ? "Training and evaluating…"
                    : trainingResult
                      ? "Training complete"
                      : "Train model once"}
                </button>
              ) : (
                <span className="risk-badge">Admin approval required</span>
              )}
            </div>
            {trainingBusy && (
              <div
                role="status"
                className="mt-4 border border-[var(--brass)]/60 bg-[var(--brass)]/10 p-4 text-xs text-[var(--muted-ink)]"
              >
                Validating labels → fitting four models → held-out evaluation →
                versioned activation. Keep this page open until completion.
              </div>
            )}
            {trainingError && (
              <div
                role="alert"
                className="mt-4 border border-[var(--rust)] bg-[var(--rust)]/10 p-4 text-xs text-[var(--rust)]"
              >
                <strong className="block">Training was not started</strong>
                {trainingError}
              </div>
            )}
            {trainingResult && (
              <div
                role="status"
                className="mt-4 grid gap-3 border border-[var(--teal)]/60 bg-[var(--teal)]/10 p-4 sm:grid-cols-4"
              >
                <div>
                  <p className="rail-label">Version</p>
                  <p className="mt-1 font-mono-app text-xs font-bold">
                    {trainingResult.modelVersion}
                  </p>
                </div>
                <div>
                  <p className="rail-label">Training rows</p>
                  <p className="mt-1 font-mono-app text-xs font-bold">
                    {trainingResult.rows.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="rail-label">Held out</p>
                  <p className="mt-1 font-mono-app text-xs font-bold">
                    {trainingResult.heldOutRows.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="rail-label">Provenance</p>
                  <p className="mt-1 font-mono-app text-xs font-bold">
                    {trainingResult.provenance.replaceAll("_", " ")}
                  </p>
                </div>
              </div>
            )}
          </section>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              label="Rows processed"
              value={String(results.length)}
              subtext={fileName}
              icon={Database}
            />
            <MetricCard
              label="Average risk"
              value={averageScore.toFixed(1)}
              subtext="Across uploaded rows"
              icon={Gauge}
              tone="gold"
            />
            <MetricCard
              label="High risk"
              value={String(distribution.high)}
              subtext="Review cases created"
              icon={ShieldAlert}
              tone="danger"
            />
            <MetricCard
              label="Medium / low"
              value={`${distribution.medium} / ${distribution.low}`}
              subtext="Risk distribution"
              icon={Activity}
            />
            <MetricCard
              label="Average inference"
              value={`${averageLatency.toFixed(2)} ms`}
              subtext="Measured model execution"
              icon={Gauge}
              tone="teal"
            />
          </div>
          <section className="mt-5 bench-panel overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] p-5">
              <SectionHeading
                eyebrow="Per-row output"
                title="Dataset results"
                detail="Open a row for evidence and human review"
              />
              <button
                type="button"
                onClick={downloadResults}
                className="bench-button"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" /> Download
                results
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead className="border-b border-[var(--line)] bg-[var(--canvas)] font-mono-app text-[9px] uppercase tracking-wider text-[var(--muted-ink)]">
                  <tr>
                    {[
                      "Transaction",
                      "Risk",
                      "Fraud",
                      "Anomaly",
                      "Return risk",
                      "Action",
                      "Latency",
                      "",
                    ].map((label) => (
                      <th key={label} className="px-4 py-3">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.slice(0, 100).map((item) => (
                    <tr
                      key={item.transaction_id}
                      className="border-b border-[var(--line)] hover:bg-[var(--panel-2)]"
                    >
                      <td className="px-4 py-4 font-mono-app font-bold text-[var(--rust)]">
                        {item.transaction_id}
                      </td>
                      <td className="px-4 py-4">
                        <RiskBadge
                          level={item.risk_level}
                          score={item.risk_score}
                        />
                      </td>
                      <td className="px-4 py-4 font-mono-app">
                        {scoreLabel(item.fraud_probability)}
                      </td>
                      <td className="px-4 py-4 font-mono-app">
                        {scoreLabel(item.anomaly_score)}
                      </td>
                      <td className="px-4 py-4 font-mono-app">
                        {scoreLabel(item.return_risk_score)}
                      </td>
                      <td className="px-4 py-4">
                        {item.recommended_action.replaceAll("_", " ")}
                      </td>
                      <td className="px-4 py-4 font-mono-app">
                        {item.inference_latency_ms?.toFixed(2) ?? "—"} ms
                      </td>
                      <td className="px-4 py-4">
                        <button
                          onClick={() =>
                            setLocation(
                              `/investigations/${item.transaction_id}`,
                            )
                          }
                          className="bench-button"
                        >
                          Inspect{" "}
                          <ChevronRight
                            className="h-3 w-3"
                            aria-hidden="true"
                          />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {results.length > 100 && (
              <p className="border-t border-[var(--line)] p-4 text-center text-xs text-[var(--muted-ink)]">
                Showing the first 100 of {results.length.toLocaleString()} rows.
                Download results for the complete output.
              </p>
            )}
          </section>
        </>
      )}
    </Shell>
  );
}

function ScoreMeter({ label, value }: { label: string; value?: number }) {
  const score = scoreValue(value);
  return (
    <div className="border border-[var(--line)] bg-[var(--canvas)] p-3">
      <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-[var(--muted-ink)]">
        <span>{label}</span>
        <span className="font-mono-app text-[var(--ink)]">
          {score.toFixed(0)}
        </span>
      </div>
      <div className="mt-2 h-1.5 bg-[var(--panel-2)]">
        <div
          className="h-full"
          style={{
            width: `${score}%`,
            backgroundColor: toneColor(
              score >= 70 ? "high" : score >= 45 ? "medium" : "low",
            ),
          }}
        />
      </div>
    </div>
  );
}

function BulletList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "teal" | "amber";
}) {
  return (
    <div>
      <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            tone === "teal" ? "bg-[var(--teal)]" : "bg-[var(--brass)]",
          )}
        />
        {title}
      </p>
      {items.length ? (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <li
              key={`${item}-${index}`}
              className="flex gap-2 text-xs leading-5 text-[var(--muted-ink)]"
            >
              <span className="font-mono-app text-[10px] text-[var(--rust)]">
                {String(index + 1).padStart(2, "0")}
              </span>
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[var(--muted-ink)]">No signals recorded.</p>
      )}
    </div>
  );
}

function DecisionButton({
  label,
  icon: Icon,
  onClick,
  disabled,
  kind,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  kind: "approve" | "reject" | "escalate" | "evidence";
}) {
  return (
    <button
      data-testid={`button-decision-${kind}`}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "decision-button",
        kind === "approve" && "decision-approve",
        kind === "reject" && "decision-reject",
        kind === "escalate" && "decision-escalate",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function VerificationField({
  label,
  value,
  source = "Uploaded transaction / derived model context",
}: {
  label: string;
  value: ReactNode;
  source?: string;
}) {
  return (
    <div className="min-w-0 border-t border-[var(--line)] pt-3">
      <dt className="rail-label">{label}</dt>
      <dd className="mt-1 break-words text-sm font-bold text-[var(--ink)]">
        {value ?? "Not collected"}
      </dd>
      <p className="mt-1 text-[10px] leading-4 text-[var(--muted-ink)]">
        {source}
      </p>
    </div>
  );
}

function InvestigationDetail({ transactionId }: { transactionId?: string }) {
  const queryClient = useQueryClient();
  const user = getStoredUser();
  const mayReview = canAccess(user, reviewerRoles);
  const transactionQuery = useApiData<RiskTransaction>(
    `/risk/transactions/${encodeURIComponent(transactionId ?? "")}`,
    { enabled: Boolean(transactionId) },
  );
  const investigationQuery = useApiData<Investigation>(
    `/investigations/${encodeURIComponent(transactionId ?? "")}`,
    { enabled: Boolean(transactionId) },
  );
  const review = useDecideReview();
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  }>();
  const [reviewOutcome, setReviewOutcome] = useState<{
    status: string;
    decision: string;
  }>();
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentReport, setAgentReport] = useState<{
    caseId: string | null;
    riskScore: number;
    riskLevel: string;
    summary: string;
    facts: string[];
    evidence: Array<{ code: string; score: number; statement: string }>;
    behavior: {
      historicalAverage: number | null;
      currentAmount: number;
      historySampleSize: number;
    };
    network: {
      deviceId: string | null;
      submittedSharedAccounts: number | null;
      observedRelatedCustomerAccounts: number;
    };
    recommendation: string;
    confidence: number;
    confidenceLabel: string;
    missingInformation: string[];
    assessment: string;
    responsibleAIStatement: string;
    policies: Array<{
      name: string;
      category: string;
      version: string;
      excerpt: string;
      relevance: number;
    }>;
    policyGrounding: string;
    toolTrace: Array<{
      sequence: number;
      tool: string;
      status: string;
      result: string;
    }>;
    limitations: string[];
    executedFinancialAction: boolean;
  }>();
  const [timeline, setTimeline] = useState<
    Array<{ timestamp: string; event: string; actor: string; detail: string }>
  >([]);
  const investigation = investigationQuery.data as Investigation | undefined;
  const transaction = (investigation?.transaction ?? transactionQuery.data) as
    RiskTransaction | undefined;
  const decisionSupport = useMemo(() => {
    const verifiedCount = investigation?.evidence?.length ?? 0;
    const observedFactCount = investigation?.facts?.length ?? 0;
    const missingCount = investigation?.missingInformation?.length ?? 0;
    const confidence = scoreValue(investigation?.confidence);
    const evidenceStrength = Math.round(
      Math.min(60, verifiedCount * 10 + observedFactCount * 5) +
        confidence * 0.25 +
        Math.max(0, 15 - missingCount * 5),
    );
    const evidenceLabel =
      evidenceStrength >= 75
        ? "High"
        : evidenceStrength >= 45
          ? "Moderate"
          : "Limited";
    const signals = transaction
      ? [
          { label: "Fraud", value: scoreValue(transaction.fraudProbability) },
          { label: "Anomaly", value: scoreValue(transaction.anomalyScore) },
          { label: "Behavior", value: scoreValue(transaction.behaviorScore) },
          { label: "Velocity", value: scoreValue(transaction.velocityScore) },
          { label: "Graph", value: scoreValue(transaction.graphScore) },
        ]
      : [];
    const spread = signals.length
      ? Math.max(...signals.map((signal) => signal.value)) -
        Math.min(...signals.map((signal) => signal.value))
      : 0;
    const agreement =
      spread <= 15
        ? "Strong agreement"
        : spread <= 30
          ? "Mixed evidence"
          : "Model disagreement";
    const alternativeExplanations = new Set<string>();
    const signalText = [
      ...(investigation?.facts ?? []),
      ...(investigation?.inferences ?? []),
      ...(transaction?.factors ?? []),
    ]
      .join(" ")
      .toLowerCase();
    if (/amount|value|spend/.test(signalText)) {
      alternativeExplanations.add(
        "A legitimate high-value purchase may explain the amount deviation.",
      );
    }
    if (/device|shared|network|account/.test(signalText)) {
      alternativeExplanations.add(
        "A household or authorized user may legitimately share the device.",
      );
    }
    if (/location|geo|country|travel/.test(signalText)) {
      alternativeExplanations.add(
        "Travel or a recent location change may explain the geographic deviation.",
      );
    }
    if (/velocity|frequency|transactions|rapid/.test(signalText)) {
      alternativeExplanations.add(
        "A promotion, retry sequence, or batch purchase may explain the unusual frequency.",
      );
    }
    if (!alternativeExplanations.size) {
      alternativeExplanations.add(
        "A legitimate change in customer behavior remains possible and should be verified.",
      );
    }
    return {
      verifiedCount,
      missingCount,
      evidenceStrength: Math.min(100, evidenceStrength),
      evidenceLabel,
      signals,
      spread,
      agreement,
      alternativeExplanations: [...alternativeExplanations],
    };
  }, [investigation, transaction]);
  const automaticAgentRequest = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!transactionId || transaction?.riskScore === undefined) return;
    if (transaction.riskScore < 31) {
      setAgentReport(undefined);
      setAgentBusy(false);
      return;
    }
    if (automaticAgentRequest.current === transactionId) return;
    automaticAgentRequest.current = transactionId;
    let active = true;
    setAgentReport(undefined);
    setAgentBusy(true);
    setFeedback(undefined);
    void authenticatedRequest<typeof agentReport>(
      `/agent/investigate/${encodeURIComponent(transactionId)}`,
      { method: "POST" },
    )
      .then((report) => {
        if (active) setAgentReport(report);
      })
      .catch(() => {
        if (active) {
          setFeedback({
            type: "error",
            text: "The automatic AI investigation could not be completed. The risk score and stored evidence remain available.",
          });
        }
      })
      .finally(() => {
        if (active) setAgentBusy(false);
      });
    return () => {
      active = false;
    };
  }, [transactionId, transaction?.riskScore]);
  useEffect(() => {
    if (!transactionId) {
      setTimeline([]);
      return;
    }
    const loadTimeline = () => {
      void authenticatedRequest<typeof timeline>(
        `/cases/${encodeURIComponent(agentReport?.caseId ?? `CASE-${transactionId}`)}/timeline`,
      )
        .then(setTimeline)
        .catch(() => setTimeline([]));
    };
    loadTimeline();
    window.addEventListener(LIVE_DATA_REFRESH_EVENT, loadTimeline);
    return () =>
      window.removeEventListener(LIVE_DATA_REFRESH_EVENT, loadTimeline);
  }, [agentReport?.caseId, transactionId]);
  const submit = (decision: ReviewDecision) => {
    if (!transactionId) return;
    setFeedback(undefined);
    if ((decision === "reject" || decision === "escalate") && !note.trim()) {
      setFeedback({
        type: "error",
        text: "Add a review note explaining the evidence behind this consequential decision.",
      });
      return;
    }
    review.mutate(
      {
        caseId: transactionId,
        data: { decision, note: note.trim() || undefined },
      },
      {
        onSuccess: (event) => {
          const outcome = event as AuditEvent & {
            caseStatus?: string;
            decision?: string;
          };
          if (outcome.caseStatus && outcome.decision) {
            setReviewOutcome({
              status: outcome.caseStatus,
              decision: outcome.decision,
            });
          }
          setFeedback({
            type: "success",
            text: `${decision.replace("_", " ")} recorded as ${event.decisionVersion}. Case lifecycle and audit trail updated.`,
          });
          void queryClient.invalidateQueries();
          announceLiveDataRefresh();
        },
        onError: () =>
          setFeedback({
            type: "error",
            text: "Decision could not be recorded. No case state was changed.",
          }),
      },
    );
  };
  if (!transactionId)
    return (
      <EmptyState
        title="Select an investigation"
        body="Choose a transaction from the queue to inspect its evidence, uncertainty, and recommended action."
        icon={FileSearch}
      />
    );
  if (transactionQuery.isLoading || investigationQuery.isLoading)
    return (
      <div className="space-y-4">
        <LoadingBlock className="h-36" />
        <LoadingBlock className="h-56" />
        <LoadingBlock className="h-44" />
      </div>
    );
  if (transactionQuery.isError || investigationQuery.isError)
    return (
      <QueryState
        error
        onRetry={() => {
          void transactionQuery.refetch();
          void investigationQuery.refetch();
        }}
        label="Investigation evidence unavailable"
      />
    );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono-app text-xs font-bold text-[var(--rust)]">
              {transaction?.transactionId}
            </span>
            <RiskBadge
              level={transaction?.riskLevel}
              score={transaction?.riskScore}
            />
          </div>
          <h2 className="mt-2 font-display text-3xl uppercase leading-none">
            Evidence review
          </h2>
          <p className="mt-2 text-xs text-[var(--muted-ink)]">
            {transaction?.customerId} / {transaction?.merchantId} /{" "}
            {formatTime(transaction?.timestamp)}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-5xl leading-none tracking-[-.08em] text-[var(--ink)]">
            {scoreLabel(transaction?.riskScore)}
          </p>
          <p className="mt-1 font-mono-app text-[9px] uppercase tracking-[.16em] text-[var(--muted-ink)]">
            Risk score / 100
          </p>
        </div>
      </div>
      {transactionId && (
        <DecisionWorkbench
          transactionId={transactionId}
          request={authenticatedRequest}
          mayReview={mayReview}
          onChanged={() => {
            void queryClient.invalidateQueries();
            announceLiveDataRefresh();
          }}
        />
      )}
      {feedback && (
        <div className="space-y-2">
          <div
            data-testid="status-review-feedback"
            className={cn(
              "flex items-center gap-2 border px-3 py-2 text-xs font-semibold",
              feedback.type === "success"
                ? "border-[var(--teal)]/60 bg-[var(--teal)]/10 text-[var(--teal)]"
                : "border-[var(--rust)]/60 bg-[var(--rust)]/10 text-[var(--rust)]",
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {feedback.text}
          </div>
          {feedback.type === "success" && (
            <div
              className="flex flex-wrap gap-2"
              aria-label="Decision follow-up"
            >
              <Link href="/audit" className="bench-button">
                <History className="h-3.5 w-3.5" aria-hidden="true" /> Verify
                audit event
              </Link>
              <Link href="/monitoring" className="bench-button">
                <Database className="h-3.5 w-3.5" aria-hidden="true" /> Continue
                monitoring
              </Link>
            </div>
          )}
        </div>
      )}
      {reviewOutcome && (
        <div
          role="status"
          aria-atomic="true"
          className="grid gap-3 border border-[var(--teal)]/60 bg-[var(--teal)]/10 p-4 sm:grid-cols-2"
        >
          <div>
            <p className="rail-label text-[var(--teal)]">Case status</p>
            <p className="mt-1 font-display text-xl uppercase">
              {reviewOutcome.status.replaceAll("_", " ")}
            </p>
          </div>
          <div>
            <p className="rail-label text-[var(--teal)]">Final decision</p>
            <p className="mt-1 font-display text-xl uppercase">
              {reviewOutcome.decision.replaceAll("_", " ")}
            </p>
          </div>
        </div>
      )}
      <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
        <div className="space-y-5">
          <section className="bench-panel p-5">
            <SectionHeading
              eyebrow="Automatic decision brief"
              title="What we know so far"
              detail="A plain-language account prepared by RazorShield AI"
            />
            <p className="text-[14px] leading-7 text-[var(--ink)]/80">
              {investigation?.summary ||
                "The model has not supplied a written summary for this event."}
            </p>
            <details className="mt-5 border border-[var(--line)] bg-[var(--panel-2)]">
              <summary className="cursor-pointer px-4 py-3 font-mono-app text-[10px] font-bold uppercase tracking-wider text-[var(--muted-ink)] hover:text-[var(--ink)]">
                Technical signal diagnostics · read only
              </summary>
              <div className="grid gap-3 border-t border-[var(--line)] p-4 sm:grid-cols-3">
                <ScoreMeter
                  label="Fraud probability"
                  value={transaction?.fraudProbability}
                />
                <ScoreMeter
                  label="Anomaly score"
                  value={transaction?.anomalyScore}
                />
                <ScoreMeter
                  label="Graph score"
                  value={transaction?.graphScore}
                />
              </div>
            </details>
          </section>
          {investigation?.fundsFlow && (
            <section className="bench-panel p-5">
              <SectionHeading
                eyebrow="Transaction relationship"
                title="Who sent to whom"
                detail={`Evidence source: ${investigation.fundsFlow.source}`}
              />
              <div
                className="grid gap-3"
                role="group"
                aria-label={`Funds flow from customer ${investigation.fundsFlow.sender.customerReference} to recipient ${investigation.fundsFlow.recipient.accountReference ?? "unavailable"}`}
              >
                <article className="border border-[var(--line)] bg-[var(--panel-2)] p-4">
                  <div className="flex items-center gap-2 text-[var(--teal)]">
                    <UserRound className="h-4 w-4" aria-hidden="true" />
                    <p className="rail-label">Sender / customer</p>
                  </div>
                  <p className="mt-3 break-words font-mono-app text-base font-bold">
                    {investigation.fundsFlow.sender.name ??
                      investigation.fundsFlow.sender.customerReference}
                  </p>
                  <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                    <VerificationField
                      label="Customer reference"
                      value={investigation.fundsFlow.sender.customerReference}
                      source="Source dataset"
                    />
                    <VerificationField
                      label="Customer email"
                      value={investigation.fundsFlow.sender.email}
                      source="Source dataset"
                    />
                    <VerificationField
                      label="Customer phone"
                      value={investigation.fundsFlow.sender.phone}
                      source="Source dataset"
                    />
                    <VerificationField
                      label="Sender bank account"
                      value={
                        investigation.fundsFlow.sender.accountReference ??
                        investigation.fundsFlow.sender.accountReferenceStatus
                          .replaceAll("_", " ")
                          .toLowerCase()
                      }
                      source="Source dataset"
                    />
                    <VerificationField
                      label="Sender bank"
                      value={investigation.fundsFlow.sender.bankName}
                      source="Source dataset"
                    />
                    <VerificationField
                      label="Sender IFSC"
                      value={investigation.fundsFlow.sender.bankIfsc}
                      source="Source dataset"
                    />
                    <VerificationField
                      label="Customer verification"
                      value={investigation.fundsFlow.sender.customerVerificationStatus
                        .replaceAll("_", " ")
                        .toLowerCase()}
                      source="Source dataset"
                    />
                    <VerificationField
                      label="Customer age"
                      value={investigation.fundsFlow.sender.age}
                    />
                    <VerificationField
                      label="Account age"
                      value={
                        investigation.fundsFlow.sender.accountAgeDays != null
                          ? `${investigation.fundsFlow.sender.accountAgeDays} days`
                          : null
                      }
                    />
                    <VerificationField
                      label="Historical average"
                      value={
                        investigation.fundsFlow.sender
                          .historicalAverageAmount != null
                          ? formatMoney(
                              investigation.fundsFlow.sender
                                .historicalAverageAmount,
                              investigation.fundsFlow.currency,
                            )
                          : null
                      }
                    />
                    <VerificationField
                      label="Previous fraud records"
                      value={
                        investigation.fundsFlow.sender.historicalFraudCount
                      }
                    />
                    <VerificationField
                      label="Device ID"
                      value={investigation.fundsFlow.sender.deviceId}
                      source="Transaction record"
                    />
                    <VerificationField
                      label="Device status"
                      value={investigation.fundsFlow.sender.deviceStatus}
                    />
                    <VerificationField
                      label="Location"
                      value={investigation.fundsFlow.sender.location}
                      source="Transaction record"
                    />
                    <VerificationField
                      label="Location status"
                      value={investigation.fundsFlow.sender.locationStatus}
                    />
                  </dl>
                </article>
                <div className="flex items-center justify-center text-[var(--rust)]">
                  <ArrowDownRight className="h-5 w-5" aria-hidden="true" />
                  <span className="sr-only">sent to</span>
                </div>
                <article className="border border-[var(--rust)]/60 bg-[var(--rust)]/10 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[var(--rust)]">
                      <Target className="h-4 w-4" aria-hidden="true" />
                      <p className="rail-label">Recipient / account</p>
                    </div>
                    <span
                      className={cn(
                        "risk-badge",
                        investigation.fundsFlow.recipient.verified
                          ? "risk-low"
                          : "risk-medium",
                      )}
                    >
                      {investigation.fundsFlow.recipient.verified
                        ? "Verified"
                        : "Not verified"}
                    </span>
                  </div>
                  <p className="mt-3 break-words font-mono-app text-base font-bold">
                    {investigation.fundsFlow.recipient.name ??
                      investigation.fundsFlow.recipient.accountReference ??
                      "Unavailable"}
                  </p>
                  <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                    <VerificationField
                      label="Recipient entity ID"
                      value={investigation.fundsFlow.recipient.entityReference}
                      source="Source dataset"
                    />
                    <VerificationField
                      label="Recipient account"
                      value={investigation.fundsFlow.recipient.accountReference}
                      source="Source dataset"
                    />
                    <VerificationField
                      label="Recipient email"
                      value={investigation.fundsFlow.recipient.email}
                      source="Source dataset"
                    />
                    <VerificationField
                      label="Recipient phone"
                      value={investigation.fundsFlow.recipient.phone}
                      source="Source dataset"
                    />
                    <VerificationField
                      label="Recipient bank"
                      value={investigation.fundsFlow.recipient.bankName}
                      source="Source dataset"
                    />
                    <VerificationField
                      label="Recipient IFSC"
                      value={investigation.fundsFlow.recipient.bankIfsc}
                      source="Source dataset"
                    />
                    <VerificationField
                      label="Recipient type"
                      value={investigation.fundsFlow.recipient.type.replaceAll(
                        "_",
                        " ",
                      )}
                      source="Source dataset"
                    />
                    <VerificationField
                      label="Recipient category"
                      value={investigation.fundsFlow.recipient.category.replaceAll(
                        "_",
                        " ",
                      )}
                      source="Source dataset"
                    />
                    <VerificationField
                      label="Recipient risk"
                      value={
                        investigation.fundsFlow.recipient.riskScore != null
                          ? `${Math.round(investigation.fundsFlow.recipient.riskScore * 100)} / 100`
                          : null
                      }
                    />
                    <VerificationField
                      label="Previously used"
                      value={
                        investigation.fundsFlow.recipient.usedBefore
                          ? "Yes"
                          : "No"
                      }
                    />
                    <VerificationField
                      label="Prior transfers from sender"
                      value={
                        investigation.fundsFlow.recipient
                          .priorTransactionsFromCustomer
                      }
                    />
                    <VerificationField
                      label="Transfers in last 15 min"
                      value={
                        investigation.fundsFlow.recipient
                          .transactionsLast15Minutes
                      }
                    />
                    <VerificationField
                      label="Linked customers"
                      value={investigation.fundsFlow.recipient.linkedCustomers}
                    />
                    <VerificationField
                      label="Linked devices"
                      value={investigation.fundsFlow.recipient.linkedDevices}
                    />
                  </dl>
                </article>
              </div>
              <dl className="mt-3 grid gap-3 border border-[var(--line)] p-4 text-xs sm:grid-cols-2 xl:grid-cols-5">
                <div>
                  <dt className="rail-label">Transferred value</dt>
                  <dd className="mt-1 font-mono-app text-sm font-bold">
                    {formatMoney(
                      investigation.fundsFlow.amount,
                      investigation.fundsFlow.currency,
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="rail-label">Payment method</dt>
                  <dd className="mt-1 text-sm font-bold">
                    {investigation.fundsFlow.paymentMethod ?? "Not collected"}
                  </dd>
                </div>
                <div>
                  <dt className="rail-label">Declared intent</dt>
                  <dd className="mt-1 text-sm font-bold">
                    {investigation.fundsFlow.intent.replaceAll("_", " ")}
                  </dd>
                </div>
                <div>
                  <dt className="rail-label">Occurred at</dt>
                  <dd className="mt-1 text-sm font-bold">
                    {formatDate(transaction?.timestamp)}
                  </dd>
                </div>
                <div>
                  <dt className="rail-label">Currency</dt>
                  <dd className="mt-1 font-mono-app text-sm font-bold">
                    {investigation.fundsFlow.currency}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-xs leading-5 text-[var(--muted-ink)]">
                Every value is tied to the stored transaction or the model
                context captured when it was assessed. Missing identity, KYC, or
                bank-account data is marked as not collected and is never
                inferred.
              </p>
            </section>
          )}
          <section className="bench-panel p-5">
            <SectionHeading
              eyebrow="Decision support"
              title="Evidence quality and agreement"
              detail="Risk and evidence are evaluated separately; neither proves fraud by itself"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="border border-[var(--line)] bg-[var(--panel-2)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="rail-label">Evidence strength</p>
                    <p className="mt-2 font-display text-2xl uppercase">
                      {decisionSupport.evidenceLabel}
                    </p>
                  </div>
                  <BadgeCheck
                    className="h-5 w-5 text-[var(--teal)]"
                    aria-hidden="true"
                  />
                </div>
                <div
                  className="mt-4 h-1.5 bg-[var(--line)]"
                  role="progressbar"
                  aria-label="Evidence strength"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={decisionSupport.evidenceStrength}
                >
                  <div
                    className="h-full bg-[var(--teal)]"
                    style={{ width: `${decisionSupport.evidenceStrength}%` }}
                  />
                </div>
                <p className="mt-3 text-[11px] leading-5 text-[var(--muted-ink)]">
                  {decisionSupport.verifiedCount} verified sources ·{" "}
                  {decisionSupport.missingCount} missing items. This measures
                  evidence coverage, not guilt.
                </p>
              </div>
              <div className="border border-[var(--line)] bg-[var(--panel-2)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="rail-label">Model agreement</p>
                    <p className="mt-2 font-display text-2xl uppercase">
                      {decisionSupport.agreement}
                    </p>
                  </div>
                  {decisionSupport.spread > 30 ? (
                    <AlertCircle
                      className="h-5 w-5 text-[var(--brass)]"
                      aria-hidden="true"
                    />
                  ) : (
                    <Check
                      className="h-5 w-5 text-[var(--teal)]"
                      aria-hidden="true"
                    />
                  )}
                </div>
                <p className="mt-3 text-[11px] leading-5 text-[var(--muted-ink)]">
                  The five risk engines span {decisionSupport.spread.toFixed(0)}{" "}
                  points. A wide spread means the reviewer should resolve
                  conflicting signals before deciding.
                </p>
                <details className="mt-3 border-t border-[var(--line)] pt-3">
                  <summary className="cursor-pointer font-mono-app text-[9px] font-bold uppercase tracking-wider">
                    View read-only model outputs
                  </summary>
                  <ul className="mt-3 grid grid-cols-2 gap-2">
                    {decisionSupport.signals.map((signal) => (
                      <li
                        key={signal.label}
                        className="flex justify-between text-[10px] text-[var(--muted-ink)]"
                      >
                        <span>{signal.label}</span>
                        <strong className="font-mono-app text-[var(--ink)]">
                          {signal.value.toFixed(0)}
                        </strong>
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            </div>
          </section>
          <section className="bench-panel p-5">
            <SectionHeading
              eyebrow="Signal ledger"
              title="Facts vs. inference"
            />
            <div className="grid gap-5 md:grid-cols-2">
              <BulletList
                title="Observed facts"
                items={investigation?.facts ?? transaction?.factors ?? []}
                tone="teal"
              />
              <BulletList
                title="Model inferences"
                items={investigation?.inferences ?? []}
                tone="amber"
              />
            </div>
          </section>
          <section className="bench-panel p-5">
            <SectionHeading
              eyebrow="Source material"
              title="Evidence attached"
              detail="Inspect the source before taking action"
            />
            {investigation?.evidence?.length ? (
              <div className="divide-y divide-[var(--line)]">
                {investigation.evidence.map((item, index) => (
                  <div
                    key={`${item.label}-${index}`}
                    data-testid={`evidence-item-${index}`}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="border border-[var(--line)] bg-[var(--panel-2)] p-2 text-[var(--muted-ink)]">
                        <Database className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide">
                          {item.label}
                        </p>
                        <p className="mt-0.5 text-[11px] text-[var(--muted-ink)]">
                          {item.source}
                        </p>
                      </div>
                    </div>
                    <span className="font-mono-app text-[10px] text-[var(--ink)]">
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No evidence attached"
                body="Request supporting evidence before finalizing this case."
              />
            )}
          </section>
          <section className="border border-[var(--brass)]/60 bg-[var(--brass)]/10 p-5">
            <SectionHeading
              eyebrow="False-positive check"
              title="Could this be legitimate?"
              detail="Possibilities to test—not facts and not reasons to dismiss the alert"
            />
            <ul className="space-y-2">
              {decisionSupport.alternativeExplanations.map((item) => (
                <li key={item} className="flex gap-2 text-xs leading-5">
                  <AlertCircle
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--brass)]"
                    aria-hidden="true"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </section>
          {timeline.length > 0 && (
            <section className="bench-panel p-5">
              <SectionHeading
                eyebrow="Actual system events"
                title="Case timeline"
              />
              <div>
                {timeline.map((item) => (
                  <div
                    key={`${item.timestamp}-${item.event}`}
                    className="grid grid-cols-[18px_1fr] gap-3"
                  >
                    <div className="flex flex-col items-center">
                      <span className="mt-1 h-2 w-2 rounded-full bg-[var(--rust)]" />
                      <span className="h-full w-px bg-[var(--line)]" />
                    </div>
                    <div className="pb-5">
                      <div className="flex flex-wrap justify-between gap-2">
                        <strong className="text-xs">{item.event}</strong>
                        <span className="font-mono-app text-[9px] text-[var(--muted-ink)]">
                          {formatTime(item.timestamp)}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-[var(--muted-ink)]">
                        {item.actor} · {item.detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
        <div className="space-y-5">
          <section className="relative overflow-hidden border border-[var(--rust)] bg-[var(--rust)] p-5 text-[var(--canvas)]">
            <div className="absolute -right-8 -top-8 h-28 w-28 border-[12px] border-[var(--canvas)]/10" />
            <div className="relative flex items-center justify-between">
              <p className="font-mono-app text-[10px] font-bold uppercase tracking-[.18em]">
                Recommended action
              </p>
              <Target className="h-4 w-4 text-[var(--brass)]" />
            </div>
            <p className="relative mt-5 font-display text-2xl uppercase leading-none">
              {investigation?.recommendation || "Review required"}
            </p>
            <div className="relative mt-7 border-t border-[var(--canvas)]/20 pt-4">
              <div className="flex justify-between text-[11px]">
                <span className="text-[var(--canvas)]/60">
                  Risk model confidence
                </span>
                <span className="font-mono-app font-bold">
                  {scoreValue(investigation?.confidence).toFixed(1)}%
                </span>
              </div>
              <div className="mt-2 h-1.5 bg-[var(--canvas)]/15">
                <div
                  className="h-full bg-[var(--brass)]"
                  style={{ width: `${scoreValue(investigation?.confidence)}%` }}
                />
              </div>
              <div className="relative mt-5 flex min-h-11 w-full items-center justify-center gap-2 border border-[var(--canvas)]/40 px-3 text-center font-mono-app text-[10px] font-bold uppercase tracking-wider">
                {agentBusy ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : transaction && transaction.riskScore < 31 ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}{" "}
                {agentBusy
                  ? "AI investigation running automatically"
                  : transaction && transaction.riskScore < 31
                    ? "Automatic screening complete · no escalation needed"
                    : "AI investigation completed automatically"}
              </div>
            </div>
          </section>
          {agentReport && (
            <section className="bench-panel p-5">
              <SectionHeading
                eyebrow={`AI risk investigation · ${agentReport.caseId ?? transactionId}`}
                title={`${agentReport.riskScore} / 100 — ${agentReport.riskLevel}`}
                detail="Bounded evidence synthesis completed; no action executed"
              />
              <div className="space-y-5 text-xs">
                <div>
                  <p className="rail-label text-[var(--rust)]">Summary</p>
                  <p className="mt-2 leading-5">{agentReport.summary}</p>
                </div>
                <div>
                  <p className="rail-label text-[var(--rust)]">Evidence</p>
                  <ul className="mt-2 space-y-2">
                    {agentReport.evidence.map((item) => (
                      <li
                        key={item.code}
                        className="grid grid-cols-[auto_1fr_auto] gap-2 border-b border-[var(--line)] pb-2 last:border-0"
                      >
                        <Check
                          className="mt-0.5 h-3.5 w-3.5 text-[var(--teal)]"
                          aria-hidden="true"
                        />
                        <span>{item.statement}</span>
                        <span className="font-mono-app text-[9px] text-[var(--muted-ink)]">
                          {item.score}/100
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="border border-[var(--line)] bg-[var(--panel-2)] p-3">
                    <p className="rail-label">Behavior</p>
                    <p className="mt-2 text-[11px]">
                      Historical average:{" "}
                      <strong>
                        {agentReport.behavior.historicalAverage === null
                          ? "Unavailable"
                          : formatMoney(
                              agentReport.behavior.historicalAverage,
                              "INR",
                            )}
                      </strong>
                    </p>
                    <p className="mt-1 text-[11px]">
                      Current amount:{" "}
                      <strong>
                        {formatMoney(agentReport.behavior.currentAmount, "INR")}
                      </strong>
                    </p>
                  </div>
                  <div className="border border-[var(--line)] bg-[var(--panel-2)] p-3">
                    <p className="rail-label">Network</p>
                    <p className="mt-2 text-[11px]">
                      Model input for {agentReport.network.deviceId ?? "device"}
                      :{" "}
                      <strong>
                        {agentReport.network.submittedSharedAccounts ??
                          "Not collected"}{" "}
                        shared accounts
                      </strong>
                      .
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--muted-ink)]">
                      Stored history observes{" "}
                      {agentReport.network.observedRelatedCustomerAccounts}{" "}
                      other customer accounts. Review the source if these values
                      differ.
                    </p>
                  </div>
                </div>
                <div className="border border-[var(--teal)]/50 bg-[var(--teal)]/10 p-3">
                  <p className="rail-label text-[var(--teal)]">
                    Retrieved company policy · RAG
                  </p>
                  <p className="mt-2 text-[11px] leading-5 text-[var(--muted-ink)]">
                    {agentReport.policyGrounding}
                  </p>
                  <div className="mt-3 space-y-3">
                    {agentReport.policies.map((policy) => (
                      <article key={`${policy.name}-${policy.version}`}>
                        <div className="flex flex-wrap justify-between gap-2">
                          <strong>{policy.name}</strong>
                          <span className="font-mono-app text-[9px] text-[var(--teal)]">
                            {policy.category.replaceAll("_", " ")} · v
                            {policy.version} · relevance score{" "}
                            {policy.relevance.toFixed(2)}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] leading-5">
                          {policy.excerpt}
                        </p>
                      </article>
                    ))}
                  </div>
                  <p className="mt-3 border-t border-[var(--teal)]/30 pt-3 text-[10px] leading-4 text-[var(--muted-ink)]">
                    Retrieved policy guides the workflow; it does not detect or
                    prove fraud. Verify that each recommendation is supported by
                    the cited policy text.
                  </p>
                </div>
                <div className="border border-[var(--brass)]/60 bg-[var(--brass)]/10 p-3">
                  <p className="rail-label text-[var(--brass)]">
                    Missing information
                  </p>
                  <p className="mt-2 leading-5">
                    {agentReport.missingInformation.join(" · ")}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="rail-label">Recommendation</p>
                    <p className="mt-2 font-display text-xl uppercase">
                      {agentReport.recommendation.replaceAll("_", " ")}
                    </p>
                  </div>
                  <div>
                    <p className="rail-label">Confidence</p>
                    <p className="mt-2 font-display text-xl uppercase">
                      {agentReport.confidenceLabel} ·{" "}
                      {(agentReport.confidence * 100).toFixed(0)}%
                    </p>
                  </div>
                </div>
                <details className="border border-[var(--line)] bg-[var(--panel-2)] p-3">
                  <summary className="cursor-pointer text-xs font-bold uppercase">
                    Agent orchestration trace · {agentReport.toolTrace.length}{" "}
                    bounded steps
                  </summary>
                  <ol className="mt-3 space-y-2">
                    {agentReport.toolTrace.map((step) => (
                      <li
                        key={step.sequence}
                        className="grid grid-cols-[24px_1fr_auto] gap-2 text-[10px] leading-4"
                      >
                        <span className="font-mono-app text-[var(--rust)]">
                          {String(step.sequence).padStart(2, "0")}
                        </span>
                        <span>
                          <strong>{step.tool.replaceAll("_", " ")}</strong>
                          <br />
                          <span className="text-[var(--muted-ink)]">
                            {step.result}
                          </span>
                        </span>
                        <span className="font-mono-app text-[8px] text-[var(--teal)]">
                          {step.status}
                        </span>
                      </li>
                    ))}
                  </ol>
                </details>
                <p className="border-t border-[var(--line)] pt-4 text-[11px] leading-5 text-[var(--muted-ink)]">
                  {agentReport.responsibleAIStatement}{" "}
                  {agentReport.limitations.join(" ")}
                </p>
              </div>
              <p className="mt-3 font-mono-app text-[9px] font-bold uppercase text-[var(--teal)]">
                Financial action executed:{" "}
                {agentReport.executedFinancialAction ? "yes" : "no"}
              </p>
            </section>
          )}
          {investigation?.missingInformation?.length ? (
            <section className="border border-[var(--brass)]/70 bg-[var(--brass)]/10 p-5">
              <div className="flex items-center gap-2 text-[var(--brass)]">
                <AlertCircle className="h-4 w-4" />
                <p className="font-mono-app text-[10px] font-bold uppercase tracking-[.16em]">
                  Uncertainty to resolve
                </p>
              </div>
              <ul className="mt-3 space-y-2">
                {investigation.missingInformation.map((item, index) => (
                  <li
                    key={`${item}-${index}`}
                    className="flex gap-2 text-xs leading-5 text-[var(--ink)]"
                  >
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--brass)]" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {mayReview ? (
            <section className="bench-panel p-5">
              <SectionHeading
                eyebrow="Human control"
                title="Make the final determination"
                detail="The AI recommendation is advisory. Your evidence-based decision becomes part of the audit trail."
              />
              <div className="mb-4 border border-[var(--line)] bg-[var(--panel-2)] p-3 text-[11px] leading-5 text-[var(--muted-ink)]">
                <strong className="text-[var(--ink)]">
                  Decision standard:
                </strong>{" "}
                high predicted risk is not confirmed fraud. Check verified
                facts, missing evidence, policy, and legitimate alternatives
                before recording a consequential outcome.
              </div>
              <textarea
                data-testid="input-review-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                aria-label="Evidence-based decision note"
                placeholder="Explain which evidence supports your decision..."
                className="min-h-20 w-full resize-y border border-[var(--input-line)] bg-[var(--canvas)] px-3 py-2 text-xs text-[var(--ink)] outline-none placeholder:text-[var(--muted-ink)] focus:border-[var(--rust)]"
              />
              <p className="mt-2 text-[10px] text-[var(--muted-ink)]">
                A note is required to confirm high-risk activity or escalate.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <DecisionButton
                  label="Legitimate activity"
                  icon={Check}
                  onClick={() => submit("approve")}
                  disabled={review.isPending}
                  kind="approve"
                />
                <DecisionButton
                  label="Confirm high-risk"
                  icon={X}
                  onClick={() => submit("reject")}
                  disabled={review.isPending}
                  kind="reject"
                />
                <DecisionButton
                  label="Escalate"
                  icon={Flag}
                  onClick={() => submit("escalate")}
                  disabled={review.isPending}
                  kind="escalate"
                />
                <DecisionButton
                  label="Request evidence"
                  icon={FileSearch}
                  onClick={() => submit("request_evidence")}
                  disabled={review.isPending}
                  kind="evidence"
                />
              </div>
              {review.isPending && (
                <p className="mt-3 flex items-center gap-2 text-[11px] text-[var(--muted-ink)]">
                  <RefreshCw className="h-3 w-3 animate-spin" /> Recording your
                  decision...
                </p>
              )}
            </section>
          ) : (
            <section className="border border-[var(--line)] bg-[var(--panel-2)] p-5">
              <p className="rail-label text-[var(--muted-ink)]">
                Role boundary
              </p>
              <h3 className="mt-2 font-display text-xl uppercase">
                Reviewer decision required
              </h3>
              <p className="mt-2 text-xs leading-5 text-[var(--muted-ink)]">
                You can investigate and document this case. Only a Reviewer or
                Admin can classify legitimate activity, confirm high-risk
                activity, escalate, or request evidence.
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function InvestigationsPage() {
  const [, setLocation] = useLocation();
  const [selectedId, setSelectedId] = useState<string>();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const transactionQuery = useApiData<RiskTransaction[]>("/risk/transactions");
  const params = useParams<{ id?: string }>();
  const transactions = useMemo(
    () => transactionQuery.data ?? [],
    [transactionQuery.data],
  );
  useEffect(() => {
    const queryId = new URLSearchParams(window.location.search).get(
      "transaction",
    );
    setSelectedId(params.id || queryId || transactions[0]?.transactionId);
  }, [params.id, transactions]);
  const filtered = useMemo(
    () =>
      transactions.filter((item) => {
        const matchesSearch =
          !search ||
          [item.transactionId, item.customerId, item.merchantId].some((field) =>
            field.toLowerCase().includes(search.toLowerCase()),
          );
        const matchesFilter =
          filter === "all" ||
          riskTone(item.riskLevel, item.riskScore) === filter;
        return matchesSearch && matchesFilter;
      }),
    [transactions, search, filter],
  );
  return (
    <Shell title="Investigations" eyebrow="Analyst queue / Human review">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="rail-label text-[var(--rust)]">Signal to decision</p>
          <h2 className="mt-1 font-display text-3xl uppercase leading-none">
            Investigation queue
          </h2>
          <p className="mt-2 text-xs text-[var(--muted-ink)]">
            Review the highest-consequence events first. Every action is
            traceable.
          </p>
        </div>
        <div className="flex items-center gap-2 border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-xs">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--teal)]" />
          <span className="font-mono-app font-bold">{transactions.length}</span>
          <span className="font-mono-app text-[9px] uppercase text-[var(--muted-ink)]">
            scored events
          </span>
        </div>
      </div>
      {transactionQuery.isError ? (
        <QueryState error onRetry={() => void transactionQuery.refetch()} />
      ) : (
        <div className="grid min-h-[680px] gap-5 xl:grid-cols-[380px_1fr]">
          <section className="bench-panel overflow-hidden">
            <div className="border-b border-[var(--line)] p-4">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--muted-ink)]" />
                <input
                  data-testid="input-investigation-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search transaction, customer..."
                  className="h-9 w-full border border-[var(--input-line)] bg-[var(--canvas)] pl-9 pr-3 text-xs text-[var(--ink)] outline-none focus:border-[var(--rust)]"
                />
              </div>
              <div className="mt-3 flex items-center gap-1.5">
                {["all", "high", "medium", "low"].map((item) => (
                  <button
                    key={item}
                    data-testid={`button-filter-${item}`}
                    onClick={() => setFilter(item)}
                    className={cn(
                      "filter-button",
                      filter === item && "filter-active",
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <div className="max-h-[590px] overflow-y-auto">
              {transactionQuery.isLoading ? (
                <div className="space-y-2 p-3">
                  {[1, 2, 3, 4].map((item) => (
                    <LoadingBlock key={item} className="h-16" />
                  ))}
                </div>
              ) : filtered.length ? (
                filtered.map((transaction) => (
                  <TransactionRow
                    key={transaction.transactionId}
                    transaction={transaction}
                    selected={selectedId === transaction.transactionId}
                    onSelect={() => {
                      setSelectedId(transaction.transactionId);
                      setLocation(
                        `/investigations/${transaction.transactionId}`,
                      );
                    }}
                  />
                ))
              ) : (
                <div className="p-4">
                  <EmptyState
                    title="No matching events"
                    body="Adjust the search or filter to widen the queue."
                    icon={Search}
                  />
                </div>
              )}
            </div>
            <div className="border-t border-[var(--line)] bg-[var(--canvas)] px-4 py-3 font-mono-app text-[10px] text-[var(--muted-ink)]">
              Showing {filtered.length} of {transactions.length} events
            </div>
          </section>
          <section>
            <InvestigationDetail transactionId={selectedId} />
          </section>
        </div>
      )}
    </Shell>
  );
}

function NetworkPage() {
  const query = useApiData<RiskNetwork>("/risk/network");
  const network = query.data as
    | (RiskNetwork & {
        customerCount: number;
        deviceCount: number;
        ipCount: number | null;
        ipStatus: string;
        highRiskClusterCount: number;
        clusters: Array<{
          id: string;
          members: string[];
          memberCount: number;
          risk: number;
        }>;
      })
    | undefined;
  const [selected, setSelected] = useState<string | undefined>(() => {
    const entity = new URLSearchParams(window.location.search).get("entity");
    return entity ?? undefined;
  });
  return (
    <Shell title="Risk network" eyebrow="Entity relationships / Exposure">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="rail-label text-[var(--rust)]">Connected risk</p>
          <h2 className="mt-1 font-display text-3xl uppercase leading-none">
            Suspicious entity network
          </h2>
          <p className="mt-2 text-xs text-[var(--muted-ink)]">
            See the relationships that a single event cannot explain.
          </p>
        </div>
        {network && (
          <div className="flex items-center gap-5 font-mono-app text-[10px] uppercase text-[var(--muted-ink)]">
            <div>
              <span className="text-lg font-bold text-[var(--ink)]">
                {network.nodes.length}
              </span>{" "}
              entities
            </div>
            <div>
              <span className="text-lg font-bold text-[var(--ink)]">
                {network.clusterCount}
              </span>{" "}
              clusters
            </div>
          </div>
        )}
      </div>
      <QueryState error={query.isError} onRetry={() => void query.refetch()} />
      {network && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Customers"
            value={String(network.customerCount)}
            subtext="Observed entity IDs"
            icon={Users}
          />
          <MetricCard
            label="Devices"
            value={String(network.deviceCount)}
            subtext="Observed device IDs"
            icon={Fingerprint}
          />
          <MetricCard
            label="Clusters"
            value={String(network.clusterCount)}
            subtext="Connected components"
            icon={Network}
          />
          <MetricCard
            label="High-risk clusters"
            value={String(network.highRiskClusterCount)}
            subtext="Maximum member risk ≥ 71"
            icon={ShieldAlert}
            tone="danger"
          />
          <MetricCard
            label="IP addresses"
            value={network.ipCount === null ? "—" : String(network.ipCount)}
            subtext={network.ipStatus.replaceAll("_", " ")}
            icon={Database}
            tone="gold"
          />
        </div>
      )}
      {query.isLoading ? (
        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          <LoadingBlock className="h-[600px]" />
          <LoadingBlock className="h-[600px]" />
        </div>
      ) : network ? (
        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          <section className="relative min-h-[600px] overflow-hidden border border-[var(--line)] bg-[var(--panel)] bench-grid">
            <div className="absolute left-5 top-5 z-10 border border-[var(--line)] bg-[var(--panel)]/90 px-3 py-2">
              <p className="rail-label">Relationship map</p>
              <p className="mt-1 text-xs font-bold">
                {network.links.length} active links
              </p>
            </div>
            <svg
              viewBox="0 0 900 600"
              className="absolute inset-0 h-full w-full"
            >
              <g
                stroke="var(--line-bright)"
                strokeWidth="1.5"
                strokeDasharray="4 5"
              >
                {network.links.map((link, index) => {
                  const sourceIndex = network.nodes.findIndex(
                    (node) => node.id === link.source,
                  );
                  const targetIndex = network.nodes.findIndex(
                    (node) => node.id === link.target,
                  );
                  const x1 = 130 + (Math.max(sourceIndex, 0) % 4) * 210;
                  const y1 =
                    175 + (Math.floor(Math.max(sourceIndex, 0) / 4) % 3) * 145;
                  const x2 = 130 + (Math.max(targetIndex, 0) % 4) * 210;
                  const y2 =
                    175 + (Math.floor(Math.max(targetIndex, 0) / 4) % 3) * 145;
                  return (
                    <line
                      key={`${link.source}-${link.target}-${index}`}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                    />
                  );
                })}
              </g>
              {network.nodes.map((node, index) => {
                const x = 130 + (index % 4) * 210;
                const y = 175 + (Math.floor(index / 4) % 3) * 145;
                const tone = riskTone(undefined, node.risk);
                return (
                  <g
                    key={node.id}
                    className="cursor-pointer"
                    onClick={() => setSelected(node.id)}
                  >
                    <circle
                      cx={x}
                      cy={y}
                      r={selected === node.id ? 31 : 26}
                      fill="var(--panel-2)"
                      stroke={toneColor(tone)}
                      strokeWidth={selected === node.id ? 3 : 1.5}
                    />
                    <circle cx={x} cy={y} r="4" fill={toneColor(tone)} />
                    <text
                      x={x}
                      y={y + 47}
                      textAnchor="middle"
                      className="fill-[var(--ink)] text-[11px] font-semibold"
                    >
                      {node.label}
                    </text>
                    <text
                      x={x}
                      y={y + 61}
                      textAnchor="middle"
                      className="fill-[var(--muted-ink)] text-[9px]"
                    >
                      {node.type} / {scoreLabel(node.risk)}
                    </text>
                  </g>
                );
              })}
            </svg>
            {!network.nodes.length && (
              <div className="absolute inset-0 flex items-center justify-center p-6">
                <EmptyState
                  title="No connected entities"
                  body="The graph will populate as relationship signals are scored."
                  icon={Network}
                />
              </div>
            )}
          </section>
          <section className="bench-panel p-5">
            <SectionHeading
              eyebrow="Selected entity"
              title={
                selected
                  ? network.nodes.find((node) => node.id === selected)?.label ||
                    "Entity detail"
                  : "Inspect the graph"
              }
              detail={
                selected
                  ? "Relationship risk profile"
                  : "Select a node to inspect"
              }
            />
            {selected ? (
              (() => {
                const node = network.nodes.find((item) => item.id === selected);
                return (
                  <div className="space-y-4">
                    <div className="border border-[var(--line)] bg-[var(--canvas)] p-4">
                      <p className="font-display text-4xl">
                        {scoreLabel(node?.risk)}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted-ink)]">
                        Entity risk score
                      </p>
                      <div className="mt-3">
                        <RiskBadge
                          score={node?.risk}
                          level={riskTone(undefined, node?.risk)}
                        />
                      </div>
                    </div>
                    <div className="space-y-3 text-xs">
                      <div className="flex justify-between border-b border-[var(--line)] pb-3">
                        <span className="text-[var(--muted-ink)]">
                          Entity type
                        </span>
                        <span className="font-semibold">{node?.type}</span>
                      </div>
                      <div className="flex justify-between border-b border-[var(--line)] pb-3">
                        <span className="text-[var(--muted-ink)]">
                          Connections
                        </span>
                        <span className="font-mono-app font-bold">
                          {
                            network.links.filter(
                              (link) =>
                                link.source === selected ||
                                link.target === selected,
                            ).length
                          }
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--muted-ink)]">
                          Entity ID
                        </span>
                        <span className="font-mono-app text-[10px]">
                          {node?.id}
                        </span>
                      </div>
                    </div>
                    <Link
                      href="/investigations"
                      data-testid="link-network-investigate"
                      className="flex items-center justify-center gap-2 bg-[var(--rust)] px-3 py-2.5 font-mono-app text-[10px] font-bold uppercase tracking-wider text-[var(--canvas)] hover:bg-[var(--brass)]"
                    >
                      Open investigation queue{" "}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                );
              })()
            ) : (
              <div className="flex min-h-64 flex-col items-center justify-center text-center">
                <CircleDot className="h-6 w-6 text-[var(--muted-ink)]" />
                <p className="mt-3 text-sm font-bold">One click from context</p>
                <p className="mt-1 max-w-[210px] text-xs leading-5 text-[var(--muted-ink)]">
                  Select any entity in the map to reveal its score and
                  connections.
                </p>
              </div>
            )}
          </section>
        </div>
      ) : (
        <EmptyState
          title="Network is quiet"
          body="No suspicious relationships are available for this window."
          icon={Network}
        />
      )}
    </Shell>
  );
}

function SupportingView({ mode }: { mode: "chargebacks" | "returns" }) {
  const transactionQuery = useApiData<RiskTransaction[]>("/risk/transactions");
  const transactions = useMemo(
    () => transactionQuery.data ?? [],
    [transactionQuery.data],
  );
  const [selectedId, setSelectedId] = useState<string>();
  const candidates = useMemo(
    () =>
      transactions.filter((item) =>
        mode === "chargebacks"
          ? riskTone(item.riskLevel, item.riskScore) === "high"
          : (item.factors ?? []).some(
              (factor) =>
                factor.toLowerCase().includes("return") ||
                factor.toLowerCase().includes("behavior"),
            ),
      ),
    [transactions, mode],
  );
  useEffect(() => {
    if (!selectedId && candidates[0])
      setSelectedId(candidates[0].transactionId);
  }, [candidates, selectedId]);
  const selected = candidates.find((item) => item.transactionId === selectedId);
  const title =
    mode === "chargebacks" ? "Chargeback evidence" : "Return-risk support";
  return (
    <Shell
      title={mode === "chargebacks" ? "Chargebacks" : "Returns"}
      eyebrow={
        mode === "chargebacks"
          ? "Dispute operations / Evidence"
          : "Post-purchase / Supporting view"
      }
    >
      <div className="mb-7">
        <p className="rail-label text-[var(--rust)]">
          {mode === "chargebacks"
            ? "Evidence review surface"
            : "Behavioral risk surface"}
        </p>
        <h2 className="mt-1 font-display text-3xl uppercase leading-none">
          {title}
        </h2>
        <p className="mt-2 max-w-2xl text-xs leading-5 text-[var(--muted-ink)]">
          {mode === "chargebacks"
            ? "Bring the transaction, model rationale, and source evidence together before a dispute response is approved."
            : "Use existing risk signals to prioritize return-related events that may need a closer human look."}
        </p>
      </div>
      {transactionQuery.isError ? (
        <QueryState error onRetry={() => void transactionQuery.refetch()} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(290px,360px)_1fr]">
          <section className="bench-panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--line)] p-4">
              <span className="rail-label">Priority set</span>
              <span className="font-mono-app text-sm font-bold">
                {candidates.length}
              </span>
            </div>
            {transactionQuery.isLoading ? (
              <div className="space-y-2 p-3">
                {[1, 2, 3].map((item) => (
                  <LoadingBlock key={item} className="h-16" />
                ))}
              </div>
            ) : candidates.length ? (
              candidates.map((item) => (
                <TransactionRow
                  key={item.transactionId}
                  transaction={item}
                  selected={selectedId === item.transactionId}
                  onSelect={() => setSelectedId(item.transactionId)}
                />
              ))
            ) : (
              <div className="p-4">
                <EmptyState
                  title="No candidates in this window"
                  body="This view only surfaces existing scored transaction signals."
                />
              </div>
            )}
          </section>
          <section className="bench-panel p-5">
            {selected ? (
              <SupportingDetail transaction={selected} mode={mode} />
            ) : (
              <EmptyState
                title="Nothing selected"
                body="Choose a transaction from the priority set to review its supporting signals."
                icon={FileSearch}
              />
            )}
          </section>
        </div>
      )}
    </Shell>
  );
}

type ReturnRiskCustomer = {
  customerId: string;
  returnRisk: number;
  averageReturnRisk: number;
  elevatedSignalRate: number;
  recentElevatedSignals: number;
  transactionCount: number;
  averageOrder: number;
  riskDrivers: string[];
  recentTransactions: Array<{
    transactionId: string;
    amount: number;
    currency: string;
    timestamp: string;
    returnRisk: number;
  }>;
  category: string;
  provenance: string;
  limitation: string;
};

function ReturnRiskPage() {
  const query = useApiData<ReturnRiskCustomer[]>("/returns");
  const [selectedCustomer, setSelectedCustomer] = useState<string>();
  const customers = query.data ?? [];
  useEffect(() => {
    if (!selectedCustomer && customers[0]) {
      setSelectedCustomer(customers[0].customerId);
    }
  }, [customers, selectedCustomer]);
  const selected = customers.find(
    (item) => item.customerId === selectedCustomer,
  );
  return (
    <Shell title="Return risk" eyebrow="Post-purchase / Separate risk category">
      <div className="mb-6 border border-[var(--brass)] bg-[var(--brass)]/10 p-4">
        <p className="font-mono-app text-[10px] font-bold uppercase tracking-[.18em] text-[var(--brass)]">
          Return risk is not fraud
        </p>
        <p className="mt-2 max-w-3xl text-xs leading-5 text-[var(--muted-ink)]">
          This workflow prioritizes model-estimated return behavior. It does not
          label a customer as fraudulent and does not claim a return occurred
          without outcome data.
        </p>
      </div>
      {query.error ? (
        <QueryState error onRetry={query.reload} label={query.error} />
      ) : query.loading ? (
        <LoadingBlock className="h-96" />
      ) : customers.length ? (
        <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
          <section className="bench-panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--line)] p-4">
              <span className="rail-label">Customer priority</span>
              <span className="font-mono-app text-sm font-bold">
                {customers.length}
              </span>
            </div>
            {customers.map((customer) => (
              <button
                key={customer.customerId}
                onClick={() => setSelectedCustomer(customer.customerId)}
                className={cn(
                  "spec-row w-full p-4 text-left",
                  selectedCustomer === customer.customerId && "spec-row-active",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <strong className="font-mono-app text-xs">
                    {customer.customerId}
                  </strong>
                  <RiskBadge
                    score={customer.returnRisk}
                    level={riskTone(undefined, customer.returnRisk)}
                  />
                </div>
                <p className="mt-2 text-[10px] text-[var(--muted-ink)]">
                  {customer.transactionCount} stored events · avg{" "}
                  {formatMoney(customer.averageOrder, "INR")}
                </p>
              </button>
            ))}
          </section>
          {selected && (
            <section className="bench-panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line)] pb-5">
                <div>
                  <p className="rail-label text-[var(--rust)]">
                    Customer return-risk profile
                  </p>
                  <h2 className="mt-2 font-display text-3xl uppercase">
                    {selected.customerId}
                  </h2>
                  <p className="mt-2 text-xs text-[var(--muted-ink)]">
                    {selected.category.replaceAll("_", " ")} ·{" "}
                    {selected.provenance}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-display text-6xl tracking-[-.1em]">
                    {selected.returnRisk}
                  </p>
                  <p className="rail-label">Maximum return risk</p>
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Average return risk"
                  value={`${selected.averageReturnRisk}%`}
                  subtext="Across stored events"
                  icon={Gauge}
                  tone="gold"
                />
                <MetricCard
                  label="Elevated signals"
                  value={String(selected.recentElevatedSignals)}
                  subtext={`${(selected.elevatedSignalRate * 100).toFixed(0)}% of stored events`}
                  icon={Flag}
                />
                <MetricCard
                  label="Average order"
                  value={formatMoney(selected.averageOrder, "INR")}
                  subtext="Stored customer activity"
                  icon={Coins}
                />
                <MetricCard
                  label="Transactions"
                  value={String(selected.transactionCount)}
                  subtext="Available history"
                  icon={Activity}
                />
              </div>
              <div className="mt-5 grid gap-5 xl:grid-cols-2">
                <div className="border border-[var(--line)] bg-[var(--canvas)] p-4">
                  <BulletList
                    title="Risk drivers on record"
                    items={selected.riskDrivers}
                    tone="amber"
                  />
                </div>
                <div className="border border-[var(--line)] bg-[var(--canvas)] p-4">
                  <p className="rail-label">Recent scored events</p>
                  <div className="mt-3 space-y-3">
                    {selected.recentTransactions.map((item) => (
                      <div
                        key={item.transactionId}
                        className="flex items-center justify-between border-b border-[var(--line)] pb-3 text-xs"
                      >
                        <span>
                          <strong className="font-mono-app">
                            {item.transactionId}
                          </strong>
                          <small className="mt-1 block text-[var(--muted-ink)]">
                            {formatMoney(item.amount, item.currency)} ·{" "}
                            {formatTime(item.timestamp)}
                          </small>
                        </span>
                        <span className="font-mono-app font-bold">
                          {item.returnRisk}/100
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border border-[var(--brass)]/60 bg-[var(--brass)]/10 p-4">
                <p className="max-w-2xl text-[11px] leading-5 text-[var(--muted-ink)]">
                  {selected.limitation}
                </p>
                <Link
                  href={`/entities/customers/${selected.customerId}`}
                  className="bench-button"
                >
                  <UserRound className="h-3.5 w-3.5" /> Open customer 360
                </Link>
              </div>
            </section>
          )}
        </div>
      ) : (
        <EmptyState
          title="No return-risk profiles"
          body="Profiles appear after merchant transactions have been assessed."
          icon={ArrowDownRight}
        />
      )}
    </Shell>
  );
}

function SupportingDetail({
  transaction,
  mode,
}: {
  transaction: RiskTransaction;
  mode: "chargebacks" | "returns";
}) {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line)] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono-app text-xs font-bold text-[var(--rust)]">
              {transaction.transactionId}
            </span>
            <RiskBadge
              level={transaction.riskLevel}
              score={transaction.riskScore}
            />
          </div>
          <h3 className="mt-2 font-display text-2xl uppercase leading-none">
            {mode === "chargebacks"
              ? "Dispute evidence packet"
              : "Return-risk signal packet"}
          </h3>
          <p className="mt-2 text-xs text-[var(--muted-ink)]">
            {formatMoney(transaction.amount, transaction.currency)} /{" "}
            {formatDate(transaction.timestamp)}
          </p>
        </div>
        <Link
          href={`/investigations/${transaction.transactionId}`}
          data-testid="link-open-supporting-investigation"
          className="bench-button"
        >
          <FileSearch className="h-3.5 w-3.5" /> Full investigation
        </Link>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="border border-[var(--line)] bg-[var(--canvas)] p-4">
          <p className="rail-label">Transaction context</p>
          <dl className="mt-4 space-y-3 text-xs">
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--muted-ink)]">Customer</dt>
              <dd className="font-mono-app font-bold">
                {transaction.customerId}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--muted-ink)]">Merchant</dt>
              <dd className="font-mono-app font-bold">
                {transaction.merchantId}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--muted-ink)]">Decision</dt>
              <dd className="font-semibold capitalize">
                {transaction.decision || "Review"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--muted-ink)]">Status</dt>
              <dd className="font-semibold capitalize">
                {transaction.status || "Open"}
              </dd>
            </div>
          </dl>
        </div>
        <div className="border border-[var(--line)] bg-[var(--canvas)] p-4">
          <p className="rail-label">Supporting scores</p>
          <div className="mt-4 space-y-3">
            <ScoreMeter label="Behavior" value={transaction.behaviorScore} />
            <ScoreMeter label="Velocity" value={transaction.velocityScore} />
            <ScoreMeter label="Anomaly" value={transaction.anomalyScore} />
          </div>
        </div>
      </div>
      <div className="mt-5 border border-[var(--brass)]/70 bg-[var(--brass)]/10 p-4">
        <div className="flex items-center gap-2 text-[var(--brass)]">
          <AlertCircle className="h-4 w-4" />
          <p className="text-xs font-bold">Analyst checkpoint</p>
        </div>
        <p className="mt-2 text-xs leading-5 text-[var(--ink)]/75">
          Supporting views surface risk signals; they do not replace the
          evidence-backed decision workflow.
        </p>
      </div>
      {mode === "chargebacks" ? (
        <ChargebackWorkflowPanel transaction={transaction} />
      ) : (
        <div className="mt-5">
          <p className="rail-label">Factors on record</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(transaction.factors ?? []).map((factor, index) => (
              <span
                key={`${factor}-${index}`}
                className="border border-[var(--line)] bg-[var(--panel-2)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink)]"
              >
                {factor}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type ChargebackCase = {
  chargebackId: string;
  transactionId: string;
  customerId: string;
  reason: string;
  riskScore: number;
  riskLevel: string;
  evidence: Array<{ label: string; source: string }>;
  missingEvidence: string[];
  status: string;
  draft: string | null;
  policySources: Array<{
    name: string;
    version: string;
    excerpt: string;
    relevance: number;
  }>;
  timeline: Array<{ timestamp: string; event: string; actor: string }>;
  externalSubmissionExecuted: boolean;
};

function ChargebackWorkflowPanel({
  transaction,
}: {
  transaction: RiskTransaction;
}) {
  const query = useApiData<ChargebackCase[]>("/chargebacks");
  const [current, setCurrent] = useState<ChargebackCase>();
  const [busy, setBusy] = useState<"generate" | "review">();
  const [feedback, setFeedback] = useState("");
  useEffect(() => {
    const selected = query.data?.find(
      (item) => item.transactionId === transaction.transactionId,
    );
    if (selected) setCurrent(selected);
  }, [query.data, transaction.transactionId]);
  const run = async (action: "generate-summary" | "send-review") => {
    if (!current) return;
    setBusy(action === "generate-summary" ? "generate" : "review");
    setFeedback("");
    try {
      const updated = await authenticatedRequest<ChargebackCase>(
        `/chargebacks/${encodeURIComponent(current.chargebackId)}/${action}`,
        { method: "POST" },
      );
      setCurrent(updated);
      announceLiveDataRefresh();
      void queryClient.invalidateQueries();
      setFeedback(
        action === "generate-summary"
          ? "Evidence summary generated from available sources."
          : "Draft sent to human review. No external submission occurred.",
      );
    } catch (caught) {
      setFeedback(
        caught instanceof Error ? caught.message : "Chargeback action failed.",
      );
    } finally {
      setBusy(undefined);
    }
  };
  if (query.error)
    return (
      <div className="mt-5">
        <QueryState error onRetry={query.reload} label={query.error} />
      </div>
    );
  if (!current) return <LoadingBlock className="mt-5 h-64" />;
  return (
    <div className="mt-5 space-y-5">
      <section className="border border-[var(--line)] bg-[var(--panel-2)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="rail-label text-[var(--rust)]">
              {current.chargebackId}
            </p>
            <h4 className="mt-2 font-display text-xl uppercase">
              {current.reason}
            </h4>
          </div>
          <span className="risk-badge risk-high">
            {current.status.replaceAll("_", " ")}
          </span>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="rail-label text-[var(--teal)]">Verified evidence</p>
            <ul className="mt-3 space-y-2">
              {current.evidence.map((item) => (
                <li key={item.label} className="flex gap-2 text-xs">
                  <Check className="h-3.5 w-3.5 text-[var(--teal)]" />
                  <span>
                    {item.label}{" "}
                    <small className="text-[var(--muted-ink)]">
                      · {item.source}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="rail-label text-[var(--brass)]">Missing evidence</p>
            <ul className="mt-3 space-y-2">
              {current.missingEvidence.map((item) => (
                <li key={item} className="flex gap-2 text-xs">
                  <AlertCircle className="h-3.5 w-3.5 text-[var(--brass)]" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      <section className="border border-[var(--rust)] bg-[var(--canvas)] p-4">
        <p className="rail-label text-[var(--rust)]">AI response draft</p>
        <p className="mt-3 text-xs leading-6 text-[var(--ink)]/80">
          {current.draft ??
            "Generate a summary to organize verified evidence. Missing evidence will remain explicit."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => void run("generate-summary")}
            disabled={Boolean(busy)}
            className="bench-button min-h-11"
          >
            {busy === "generate" ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Generate evidence summary
          </button>
          <button
            onClick={() => void run("send-review")}
            disabled={Boolean(busy) || !current.draft}
            className="bench-button min-h-11"
          >
            {busy === "review" ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Users className="h-4 w-4" />
            )}
            Send for review
          </button>
        </div>
        {feedback && (
          <p
            role="status"
            aria-atomic="true"
            className="mt-3 text-xs text-[var(--teal)]"
          >
            {feedback}
          </p>
        )}
        <p className="mt-4 border-t border-[var(--line)] pt-3 text-[10px] leading-4 text-[var(--muted-ink)]">
          External submission executed:{" "}
          {current.externalSubmissionExecuted ? "yes" : "no"}. The assistant
          never fills unavailable evidence.
        </p>
      </section>
      <section className="border border-[var(--line)] p-4">
        <p className="rail-label">Policy grounding</p>
        <div className="mt-3 space-y-2">
          {current.policySources.map((policy) => (
            <div key={`${policy.name}-${policy.version}`} className="text-xs">
              <strong>{policy.name}</strong>{" "}
              <span className="font-mono-app text-[9px] text-[var(--muted-ink)]">
                v{policy.version} · relevance score{" "}
                {policy.relevance.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function AuditPage() {
  const query = useApiData<AuditEvent[]>("/risk/audit");
  const events = useMemo(() => query.data ?? [], [query.data]);
  return (
    <Shell title="Audit trail" eyebrow="Governance / Traceability">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="rail-label text-[var(--rust)]">
            Accountability by default
          </p>
          <h2 className="mt-1 font-display text-3xl uppercase leading-none">
            Decisions & human actions
          </h2>
          <p className="mt-2 text-xs text-[var(--muted-ink)]">
            A durable record of what happened, who acted, and which model
            version was in play.
          </p>
        </div>
        <div className="flex items-center gap-2 border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-xs">
          <History className="h-3.5 w-3.5 text-[var(--rust)]" />
          <span className="font-mono-app font-bold">{events.length}</span>
          <span className="font-mono-app text-[9px] uppercase text-[var(--muted-ink)]">
            events
          </span>
        </div>
      </div>
      {query.isError ? (
        <QueryState error onRetry={() => void query.refetch()} />
      ) : (
        <section className="bench-panel">
          {query.isLoading ? (
            <div className="space-y-2 p-5">
              {[1, 2, 3, 4].map((item) => (
                <LoadingBlock key={item} className="h-20" />
              ))}
            </div>
          ) : events.length ? (
            <div className="divide-y divide-[var(--line)]">
              {events.map((event) => (
                <AuditRow key={event.id} event={event} />
              ))}
            </div>
          ) : (
            <div className="p-5">
              <EmptyState
                title="No audit events yet"
                body="Human decisions will appear here as analysts review cases."
                icon={History}
              />
            </div>
          )}
        </section>
      )}
    </Shell>
  );
}
function AuditRow({ event }: { event: AuditEvent }) {
  return (
    <div
      data-testid={`audit-event-${event.id}`}
      className="grid gap-3 p-5 md:grid-cols-[130px_1fr_190px] md:items-center"
    >
      <div>
        <p className="font-mono-app text-[10px] text-[var(--muted-ink)]">
          {formatDate(event.timestamp)}
        </p>
        <p className="mt-1 font-mono-app text-[10px] text-[var(--muted-ink)]">
          {formatTime(event.timestamp).split(", ").pop()}
        </p>
      </div>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center border border-[var(--teal)]/40 bg-[var(--teal)]/10 text-[var(--teal)]">
          <BadgeCheck className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-bold">{event.event}</p>
          <p className="mt-1 text-xs leading-5 text-[var(--muted-ink)]">
            {event.note || "No additional analyst note recorded."}
          </p>
          <p className="mt-2 font-mono-app text-[10px] text-[var(--muted-ink)]">
            CASE {event.caseId}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 md:justify-end">
        <div className="text-right">
          <p className="text-xs font-bold">{event.actor}</p>
          <p className="mt-1 font-mono-app text-[9px] text-[var(--muted-ink)]">
            MODEL {event.decisionVersion}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 text-[var(--muted-ink)]" />
      </div>
    </div>
  );
}

type IEEECandidateEvaluation = {
  status: string;
  modelVersion: string;
  selectedModel: string;
  selectionMetric: string;
  split: string;
  featureCount: number;
  trainingRows: number;
  calibrationRows: number;
  selectionRows: number;
  lockedTestRows: number;
  candidateValidationResults: Record<
    string,
    {
      precision: number;
      recall: number;
      f1: number;
      pr_auc: number;
      roc_auc: number;
      false_positive_rate: number;
    }
  >;
  lockedTest: {
    precision: number;
    recall: number;
    f1: number;
    pr_auc: number;
    roc_auc: number;
    false_positive_rate: number;
    false_negative_rate: number;
    confusion_matrix_tn_fp_fn_tp: [number, number, number, number];
  };
  thresholds: {
    medium: number;
    high: number;
    review: number;
    costSensitive: number;
  };
  thresholdAnalysis: Array<{
    threshold: number;
    precision: number;
    recall: number;
    false_positive_rate: number;
    alert_rate: number;
    business_cost_inr: number;
  }>;
  explainability: string;
  disclaimer: string;
};

function EvaluationPage() {
  const overviewQuery = useApiData<RiskOverview>("/risk/overview");
  const transactionQuery = useApiData<RiskTransaction[]>("/risk/transactions");
  const ieeeQuery = useApiData<IEEECandidateEvaluation>(
    "/monitoring/ieee-cis",
    { live: false },
  );
  const overview = overviewQuery.data as RiskOverview | undefined;
  const ieee = ieeeQuery.data;
  const transactions = useMemo(
    () => transactionQuery.data ?? [],
    [transactionQuery.data],
  );
  const highRisk = transactions.filter(
    (item) => riskTone(item.riskLevel, item.riskScore) === "high",
  ).length;
  const explainable = transactions.filter(
    (item) => (item.factors?.length ?? 0) > 0,
  ).length;
  const explainability = transactions.length
    ? Math.round((explainable / transactions.length) * 100)
    : 0;
  return (
    <Shell title="Evaluation" eyebrow="Model performance / Business impact">
      <div className="mb-7">
        <p className="rail-label text-[var(--rust)]">Held-out view</p>
        <h2 className="mt-1 font-display text-3xl uppercase leading-none">
          Does the model earn trust?
        </h2>
        <p className="mt-2 max-w-2xl text-xs leading-5 text-[var(--muted-ink)]">
          A compact read on performance and operational impact from the
          currently available scored set.
        </p>
      </div>
      <QueryState
        error={
          overviewQuery.isError || transactionQuery.isError || ieeeQuery.isError
        }
        onRetry={() => {
          void overviewQuery.refetch();
          void transactionQuery.refetch();
          void ieeeQuery.refetch();
        }}
      />
      {overviewQuery.isLoading ||
      transactionQuery.isLoading ||
      ieeeQuery.isLoading ? (
        <div className="grid gap-5 md:grid-cols-2">
          <LoadingBlock className="h-64" />
          <LoadingBlock className="h-64" />
          <LoadingBlock className="h-56 md:col-span-2" />
        </div>
      ) : (
        <div className="space-y-5">
          {ieee && (
            <>
              <section className="border border-[var(--teal)]/60 bg-[var(--teal)]/10 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="rail-label text-[var(--teal)]">
                      Real-data candidate / Locked temporal test
                    </p>
                    <h3 className="mt-2 font-display text-3xl uppercase">
                      {ieee.modelVersion}
                    </h3>
                    <p className="mt-2 max-w-3xl text-xs leading-5 text-[var(--muted-ink)]">
                      {ieee.selectedModel.replaceAll("_", " ")} selected by{" "}
                      {ieee.selectionMetric.replaceAll("_", " ")}. {ieee.split}.
                    </p>
                  </div>
                  <span className="risk-badge risk-medium">
                    {ieee.status.replaceAll("_", " ")}
                  </span>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricCard
                    label="Locked-test PR-AUC"
                    value={ieee.lockedTest.pr_auc.toFixed(4)}
                    subtext="Primary imbalanced-data ranking metric"
                    icon={Target}
                    tone="teal"
                  />
                  <MetricCard
                    label="Locked-test ROC-AUC"
                    value={ieee.lockedTest.roc_auc.toFixed(4)}
                    subtext={`${ieee.lockedTestRows.toLocaleString()} future rows`}
                    icon={Gauge}
                  />
                  <MetricCard
                    label="Precision / recall"
                    value={`${(ieee.lockedTest.precision * 100).toFixed(1)}% / ${(ieee.lockedTest.recall * 100).toFixed(1)}%`}
                    subtext={`F1 ${(ieee.lockedTest.f1 * 100).toFixed(1)}%`}
                    icon={Activity}
                    tone="gold"
                  />
                  <MetricCard
                    label="False-positive rate"
                    value={`${(ieee.lockedTest.false_positive_rate * 100).toFixed(2)}%`}
                    subtext="At the validation-selected high threshold"
                    icon={AlertCircle}
                    tone="danger"
                  />
                </div>
              </section>

              <section className="bench-panel p-5">
                <SectionHeading
                  eyebrow="Candidate comparison"
                  title="Validation performance"
                  detail={`${ieee.trainingRows.toLocaleString()} training · ${ieee.calibrationRows.toLocaleString()} calibration · ${ieee.selectionRows.toLocaleString()} selection rows`}
                />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse text-left text-xs">
                    <caption className="sr-only">
                      Validation performance comparison for trained fraud model
                      candidates
                    </caption>
                    <thead>
                      <tr className="border-b border-[var(--line)] font-mono-app text-[9px] uppercase tracking-wider text-[var(--muted-ink)]">
                        <th scope="col" className="px-3 py-3">
                          Model
                        </th>
                        <th scope="col" className="px-3 py-3">
                          PR-AUC
                        </th>
                        <th scope="col" className="px-3 py-3">
                          ROC-AUC
                        </th>
                        <th scope="col" className="px-3 py-3">
                          Precision
                        </th>
                        <th scope="col" className="px-3 py-3">
                          Recall
                        </th>
                        <th scope="col" className="px-3 py-3">
                          F1
                        </th>
                        <th scope="col" className="px-3 py-3">
                          FPR
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(ieee.candidateValidationResults).map(
                        ([name, metrics]) => (
                          <tr
                            key={name}
                            className={cn(
                              "border-b border-[var(--line)] last:border-0",
                              name === ieee.selectedModel &&
                                "bg-[var(--teal)]/10",
                            )}
                          >
                            <th
                              scope="row"
                              className="px-3 py-3 font-bold uppercase"
                            >
                              {name.replaceAll("_", " ")}
                              {name === ieee.selectedModel && (
                                <span className="ml-2 font-mono-app text-[8px] text-[var(--teal)]">
                                  SELECTED
                                </span>
                              )}
                            </th>
                            {[
                              metrics.pr_auc,
                              metrics.roc_auc,
                              metrics.precision,
                              metrics.recall,
                              metrics.f1,
                              metrics.false_positive_rate,
                            ].map((value, index) => (
                              <td
                                key={index}
                                className="px-3 py-3 font-mono-app"
                              >
                                {value.toFixed(4)}
                              </td>
                            ))}
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="bench-panel p-5">
                <SectionHeading
                  eyebrow="Operating-point analysis"
                  title="Threshold behavior"
                  detail={`Medium ${(ieee.thresholds.medium * 100).toFixed(2)}% · High/review ${(ieee.thresholds.high * 100).toFixed(2)}% · Cost-sensitive ${(ieee.thresholds.costSensitive * 100).toFixed(2)}%`}
                />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] border-collapse text-left text-xs">
                    <caption className="sr-only">
                      Precision, recall, false-positive rate, alert rate, and
                      illustrative business cost by threshold
                    </caption>
                    <thead>
                      <tr className="border-b border-[var(--line)] font-mono-app text-[9px] uppercase tracking-wider text-[var(--muted-ink)]">
                        <th scope="col" className="px-3 py-3">
                          Threshold
                        </th>
                        <th scope="col" className="px-3 py-3">
                          Precision
                        </th>
                        <th scope="col" className="px-3 py-3">
                          Recall
                        </th>
                        <th scope="col" className="px-3 py-3">
                          FPR
                        </th>
                        <th scope="col" className="px-3 py-3">
                          Alert rate
                        </th>
                        <th scope="col" className="px-3 py-3">
                          Illustrative cost
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {ieee.thresholdAnalysis.map((row) => (
                        <tr
                          key={row.threshold}
                          className="border-b border-[var(--line)] last:border-0"
                        >
                          <th
                            scope="row"
                            className="px-3 py-3 font-mono-app font-bold"
                          >
                            {row.threshold.toFixed(2)}
                          </th>
                          <td className="px-3 py-3 font-mono-app">
                            {(row.precision * 100).toFixed(1)}%
                          </td>
                          <td className="px-3 py-3 font-mono-app">
                            {(row.recall * 100).toFixed(1)}%
                          </td>
                          <td className="px-3 py-3 font-mono-app">
                            {(row.false_positive_rate * 100).toFixed(2)}%
                          </td>
                          <td className="px-3 py-3 font-mono-app">
                            {(row.alert_rate * 100).toFixed(2)}%
                          </td>
                          <td className="px-3 py-3 font-mono-app">
                            {formatMoney(row.business_cost_inr, "INR")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-4 border border-[var(--brass)]/60 bg-[var(--brass)]/10 p-3 text-[11px] leading-5 text-[var(--muted-ink)]">
                  {ieee.disclaimer} Explainability:{" "}
                  {ieee.explainability.replaceAll("_", " ")}.
                </p>
              </section>
            </>
          )}
          <div className="grid gap-3 md:grid-cols-3">
            <MetricCard
              label="Average risk score"
              value={scoreLabel(overview?.averageRiskScore)}
              subtext="Across the scored window"
              icon={Gauge}
              tone="gold"
            />
            <MetricCard
              label="High-risk capture"
              value={
                transactions.length
                  ? `${Math.round((highRisk / transactions.length) * 100)}%`
                  : "—"
              }
              subtext={`${highRisk} events in the current set`}
              icon={Target}
              tone="danger"
            />
            <MetricCard
              label="Explainability coverage"
              value={`${explainability}%`}
              subtext="Events carrying factor evidence"
              icon={Sparkles}
              tone="teal"
            />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="bench-panel p-5">
              <SectionHeading
                eyebrow="Performance frame"
                title="Held-out model readout"
                detail="Operational proxy from live scored events"
              />
              <div className="space-y-5">
                <EvalBar
                  label="Signal coverage"
                  value={Math.min(
                    100,
                    overview?.transactionsAnalyzed
                      ? (transactions.length / overview.transactionsAnalyzed) *
                          100
                      : 0,
                  )}
                  note={`${transactions.length} events sampled`}
                />
                <EvalBar
                  label="Fraud rate in window"
                  value={scoreValue(overview?.fraudRate)}
                  note={`${formatCompact(overview?.fraudDetected)} confirmed detections`}
                />
                <EvalBar
                  label="Risk concentration"
                  value={
                    transactions.length
                      ? (highRisk / transactions.length) * 100
                      : 0
                  }
                  note={`${highRisk} high-risk events`}
                />
              </div>
            </section>
            <section className="relative overflow-hidden border border-[var(--rust)] bg-[var(--rust)] p-5 text-[var(--canvas)]">
              <div className="flex items-center justify-between">
                <p className="font-mono-app text-[10px] font-bold uppercase tracking-[.18em]">
                  Business impact
                </p>
                <Coins className="h-4 w-4 text-[var(--brass)]" />
              </div>
              <p className="mt-7 font-display text-5xl tracking-[-.1em]">
                {formatMoney(overview?.preventedLoss)}
              </p>
              <p className="mt-2 text-sm font-bold uppercase tracking-wide text-[var(--canvas)]/75">
                Prevented loss attributed to defensive action
              </p>
              <div className="mt-8 grid grid-cols-2 gap-3 border-t border-[var(--canvas)]/20 pt-4">
                <div>
                  <p className="font-mono-app text-xl font-bold">
                    {formatCompact(overview?.fraudDetected)}
                  </p>
                  <p className="mt-1 font-mono-app text-[10px] uppercase tracking-wider text-[var(--canvas)]/55">
                    Fraud detected
                  </p>
                </div>
                <div>
                  <p className="font-mono-app text-xl font-bold">
                    {formatCompact(overview?.activeInvestigations)}
                  </p>
                  <p className="mt-1 font-mono-app text-[10px] uppercase tracking-wider text-[var(--canvas)]/55">
                    Open reviews
                  </p>
                </div>
              </div>
            </section>
          </div>
          <section className="border border-[var(--brass)]/70 bg-[var(--brass)]/10 p-5">
            <div className="flex gap-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brass)]" />
              <div>
                <p className="text-xs font-bold text-[var(--brass)]">
                  Evaluation context
                </p>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--ink)]/75">
                  The IEEE-CIS section reports the locked temporal benchmark.
                  The cards below it use the active live scored set and remain
                  an operational snapshot rather than another benchmark claim.
                </p>
              </div>
            </div>
          </section>
        </div>
      )}
    </Shell>
  );
}
function EvalBar({
  label,
  value,
  note,
}: {
  label: string;
  value: number;
  note: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold">{label}</p>
          <p className="mt-1 text-[11px] text-[var(--muted-ink)]">{note}</p>
        </div>
        <span className="font-mono-app text-sm font-bold">
          {value.toFixed(1)}%
        </span>
      </div>
      <div className="h-2 bg-[var(--panel-2)]">
        <div
          className="h-full bg-[var(--rust)]"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}

function apiUrl(path: string) {
  const base =
    (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(
      /\/$/,
      "",
    ) ?? "";
  return `${base}/api/v1${path}`;
}

async function authenticatedRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = await getValidAccessToken();
  let response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (response.status === 401) {
    const refreshed = await refreshSession();
    if (refreshed) {
      response = await fetch(apiUrl(path), {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${refreshed}`,
          ...init?.headers,
        },
      });
    }
  }
  const body = await response.json();
  if (response.status === 401) expireSession();
  if (!response.ok) {
    const validation = Array.isArray(body.detail)
      ? body.detail
          .slice(0, 4)
          .map(
            (item: { loc?: Array<string | number>; msg?: string }) =>
              `${item.loc?.slice(1).join(".") || "record"}: ${item.msg || "invalid value"}`,
          )
          .join("; ")
      : undefined;
    throw new Error(
      typeof body.detail === "string"
        ? body.detail
        : (validation ?? body.error?.message ?? "Request failed"),
    );
  }
  return body as T;
}

type AssessmentResult = {
  transaction_id: string;
  risk_score: number;
  risk_level: string;
  recommended_action: string;
  fraud_probability: number;
  anomaly_score: number;
  behavior_score: number;
  velocity_score: number;
  graph_score: number;
  rule_score: number;
  contextual_adjustment: number;
  return_risk_score: number;
  engine_version: string;
  model_status: string;
  model_provenance: string;
  inference_latency_ms: number;
  feature_snapshot: Record<string, number | string | boolean | null>;
  behavior_context: {
    history_sample_size: number;
    baseline_source: string;
    model_average_amount: number;
    average_amount: number;
    normal_amount_min: number | null;
    normal_amount_max: number | null;
    typical_device: string | null;
    typical_location: string | null;
    typical_hour_start: number | null;
    typical_hour_end: number | null;
    current_amount: number;
    current_device: string | null;
    current_location: string | null;
    current_hour: number;
    submitted_is_new_device: boolean;
    submitted_is_new_location: boolean;
    is_new_device: boolean;
    is_new_location: boolean;
    model_amount_deviation_ratio: number;
    amount_deviation_ratio: number;
    deviation_level: string;
  };
  rule_results: Array<{
    code: string;
    label: string;
    condition: string;
    observed: string;
    fired: boolean;
    weight: number;
    evidence: string;
  }>;
  fusion_contributions: Array<{
    feature: string;
    impact: number;
    direction: string;
  }>;
  model_contributions: Array<{
    feature: string;
    impact: number;
    direction: string;
  }>;
  risk_explanation: string[];
  signals: Array<{ code: string; score: number; evidence: string }>;
  disclaimer: string;
};

function EngineOutput({
  title,
  question,
  value,
  detail,
  caution,
  unit = "/100",
}: {
  title: string;
  question: string;
  value: number;
  detail: string;
  caution?: string;
  unit?: string;
}) {
  const score = scoreValue(value);
  return (
    <article className="border border-[var(--line)] bg-[var(--canvas)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="rail-label text-[var(--rust)]">{title}</p>
          <p className="mt-2 text-[11px] leading-5 text-[var(--muted-ink)]">
            {question}
          </p>
        </div>
        <span className="whitespace-nowrap">
          <strong className="font-display text-3xl tracking-[-.06em]">
            {score.toFixed(score % 1 ? 1 : 0)}
          </strong>
          <small className="ml-1 font-mono-app text-[9px] text-[var(--muted-ink)]">
            {unit}
          </small>
        </span>
      </div>
      <div className="mt-4 h-1.5 bg-[var(--panel-2)]">
        <div
          className="h-full bg-[var(--rust)]"
          style={{ width: `${score}%` }}
        />
      </div>
      <p className="mt-3 text-[10px] leading-4 text-[var(--muted-ink)]">
        {detail}
      </p>
      {caution && (
        <p className="mt-3 border border-[var(--brass)]/60 bg-[var(--brass)]/10 p-2 text-[10px] font-bold leading-4 text-[var(--brass)]">
          {caution}
        </p>
      )}
    </article>
  );
}

function RiskPipeline({ result }: { result: AssessmentResult }) {
  const evidenceCount = result.signals.length;
  const steps = [
    ["01", "Transaction", result.transaction_id, "complete"],
    ["02", "RazorShield AI", "All intelligence ran automatically", "complete"],
    [
      "03",
      "Risk score",
      `${result.risk_score}/100 · ${result.risk_level}`,
      "complete",
    ],
    [
      "04",
      "Why",
      `${result.risk_explanation.length} explanation points`,
      "complete",
    ],
    ["05", "Evidence", `${evidenceCount} verified signals`, "complete"],
    [
      "06",
      "AI investigation",
      result.risk_score >= 31 ? "Prepared automatically" : "Screening complete",
      "complete",
    ],
    [
      "07",
      "Recommendation",
      result.recommended_action.replaceAll("_", " "),
      "complete",
    ],
    [
      "08",
      "Human decision",
      result.risk_score >= 31 ? "Awaiting reviewer" : "Not required",
      "pending",
    ],
    ["09", "Audit", "Every system event is recorded", "complete"],
  ];
  return (
    <section
      className="mt-6 bench-panel p-5"
      aria-labelledby="risk-pipeline-title"
    >
      <SectionHeading
        eyebrow="One automatic workflow"
        title="Transaction to decision brief"
        detail={`RazorShield completed the full intelligence path in ${result.inference_latency_ms.toFixed(2)} ms. No model operation was required.`}
      />
      <h3 id="risk-pipeline-title" className="sr-only">
        Automatic RazorShield AI workflow
      </h3>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map(([number, label, detail, state]) => (
          <article
            key={number}
            className={cn(
              "border p-4",
              state === "pending"
                ? "border-[var(--brass)] bg-[var(--brass)]/10"
                : "border-[var(--teal)]/40 bg-[var(--teal)]/5",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono-app text-[9px] font-bold text-[var(--teal)]">
                {number}
              </span>
              <span className="font-mono-app text-[8px] font-bold uppercase tracking-wider text-[var(--muted-ink)]">
                {state === "pending" ? "Human control" : "Automatic"}
              </span>
            </div>
            <p className="mt-2 text-xs font-bold uppercase">{label}</p>
            <p className="mt-1 text-[10px] leading-4 text-[var(--muted-ink)]">
              {detail}
            </p>
          </article>
        ))}
      </div>

      <details className="mt-4 border border-[var(--line)] bg-[var(--panel-2)]">
        <summary className="cursor-pointer px-4 py-3 font-mono-app text-[10px] font-bold uppercase tracking-wider text-[var(--muted-ink)] hover:text-[var(--ink)]">
          Technical diagnostics · read only
        </summary>
        <div className="grid gap-3 border-t border-[var(--line)] p-4 md:grid-cols-3">
          <EngineOutput
            title="Fraud model"
            question="Learned fraud-pattern likelihood"
            value={result.fraud_probability}
            detail={`${result.engine_version.split("/")[0]} · ${result.model_status}`}
            unit="%"
          />
          <EngineOutput
            title="Anomaly model"
            question="Departure from learned normal patterns"
            value={result.anomaly_score}
            detail="Unusual is a signal, never proof of fraud."
          />
          <EngineOutput
            title="Behavior engine"
            question="Departure from customer baseline"
            value={result.behavior_score}
            detail={`Deviation: ${result.behavior_context.deviation_level}`}
          />
          <EngineOutput
            title="Velocity engine"
            question="Transaction-frequency pressure"
            value={result.velocity_score}
            detail={`${result.feature_snapshot.transactions_last_5_minutes ?? 0} events / 5 min`}
          />
          <EngineOutput
            title="Graph engine"
            question="Device and recipient relationship risk"
            value={result.graph_score}
            detail={`${result.feature_snapshot.shared_device_accounts ?? 0} shared-device accounts · ${result.feature_snapshot.unique_customers_to_recipient ?? 0} recipient-linked customers`}
          />
          <EngineOutput
            title="Context engine"
            question="Business context adjustment"
            value={Math.abs(result.contextual_adjustment)}
            detail={`${result.contextual_adjustment >= 0 ? "+" : ""}${result.contextual_adjustment.toFixed(2)} net adjustment · ${result.contextual_adjustment < 0 ? "reduces risk without overriding the model" : "adds contextual risk"}`}
          />
        </div>
      </details>
    </section>
  );
}

function RuleEnginePanel({ result }: { result: AssessmentResult }) {
  const firedCount = result.rule_results.filter((rule) => rule.fired).length;
  return (
    <section className="mt-6 bench-panel p-5">
      <SectionHeading
        eyebrow="Deterministic intelligence"
        title="Configured rule evaluation"
        detail={`${firedCount} of ${result.rule_results.length} merchant rules fired for this event`}
      />
      <div className="grid gap-3 lg:grid-cols-2">
        {result.rule_results.map((rule) => (
          <article
            key={rule.code}
            className={cn(
              "border p-4",
              rule.fired
                ? "border-[var(--rust)] bg-[var(--rust)]/10"
                : "border-[var(--line)] bg-[var(--panel-2)]",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase">{rule.label}</p>
                <p className="mt-1 font-mono-app text-[9px] text-[var(--muted-ink)]">
                  {rule.code}
                </p>
              </div>
              <span
                className={cn(
                  "font-mono-app text-[9px] font-bold uppercase",
                  rule.fired ? "text-[var(--rust)]" : "text-[var(--teal)]",
                )}
              >
                {rule.fired ? "Fired" : "Clear"}
              </span>
            </div>
            <dl className="mt-3 grid gap-2 text-[10px] leading-4">
              <div>
                <dt className="text-[var(--muted-ink)]">IF</dt>
                <dd className="font-bold">{rule.condition}</dd>
              </div>
              <div>
                <dt className="text-[var(--muted-ink)]">OBSERVED</dt>
                <dd>{rule.observed}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
        <p className="text-[11px] text-[var(--muted-ink)]">
          Rules supplement trained models; they do not replace risk fusion or
          human judgment.
        </p>
        <Link href="/settings" className="bench-button">
          <Settings className="h-3.5 w-3.5" aria-hidden="true" /> Configure
          thresholds
        </Link>
      </div>
    </section>
  );
}

function ExplainabilityPanel({ result }: { result: AssessmentResult }) {
  const maxImpact = Math.max(
    ...result.fusion_contributions.map((item) => item.impact),
    0.01,
  );
  return (
    <section className="mt-6 grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
      <div className="bench-panel p-5">
        <SectionHeading
          eyebrow="Structured evidence"
          title="Why is this transaction risky?"
          detail="Observed conditions and deterministic rule evidence—not a claim about a person"
        />
        <ol className="space-y-3">
          {result.risk_explanation.map((item, index) => (
            <li
              key={`${item}-${index}`}
              className="grid grid-cols-[28px_1fr] gap-3 border-b border-[var(--line)] pb-3 text-xs leading-5 last:border-0 last:pb-0"
            >
              <span className="font-mono-app text-[10px] font-bold text-[var(--rust)]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
        <p className="mt-5 border border-[var(--brass)]/60 bg-[var(--brass)]/10 p-3 text-[11px] leading-5 text-[var(--brass)]">
          Model attribution uses signed linear log-odds contributions. It
          explains influence on this model output; it does not establish cause
          or guilt.
        </p>
      </div>
      <div className="bench-panel p-5">
        <SectionHeading
          eyebrow="Fusion attribution"
          title="Signal contribution"
          detail="Relative local influence in the versioned fusion model"
        />
        <div className="space-y-4">
          {result.fusion_contributions.map((item) => (
            <div key={item.feature}>
              <div className="flex justify-between gap-3 text-[10px] font-bold uppercase">
                <span>{item.feature}</span>
                <span
                  className={
                    item.direction === "INCREASES_RISK"
                      ? "text-[var(--rust)]"
                      : "text-[var(--teal)]"
                  }
                >
                  {item.direction.replaceAll("_", " ")}
                </span>
              </div>
              <div className="mt-2 h-1.5 bg-[var(--panel-2)]">
                <div
                  className={cn(
                    "h-full",
                    item.direction === "INCREASES_RISK"
                      ? "bg-[var(--rust)]"
                      : "bg-[var(--teal)]",
                  )}
                  style={{ width: `${(item.impact / maxImpact) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function InvestigationHandoff({ result }: { result: AssessmentResult }) {
  const steps = [
    ["01", "Risk detected", `${result.risk_score}/100 · ${result.risk_level}`],
    ["02", "Investigation created", `CASE-${result.transaction_id}`],
    ["03", "AI investigation", "Prepared automatically"],
    ["04", "Human decision", "Awaiting an authorized reviewer"],
  ];
  return (
    <section className="mt-6 border border-[var(--teal)]/60 bg-[var(--teal)]/10 p-5">
      <SectionHeading
        eyebrow="Controlled action path"
        title="High risk creates review—not an automatic financial action"
      />
      <div className="grid gap-2 md:grid-cols-4">
        {steps.map(([number, label, detail]) => (
          <div key={number} className="border border-[var(--teal)]/40 p-3">
            <span className="font-mono-app text-[9px] font-bold text-[var(--teal)]">
              {number}
            </span>
            <p className="mt-2 text-xs font-bold uppercase">{label}</p>
            <p className="mt-1 text-[10px] text-[var(--muted-ink)]">{detail}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] leading-5 text-[var(--muted-ink)]">
          RazorShield has assembled the decision brief automatically. A Reviewer
          or Admin remains responsible for the final decision.
        </p>
        <Link
          href={`/investigations/${result.transaction_id}`}
          className="bench-button"
        >
          <FileSearch className="h-3.5 w-3.5" aria-hidden="true" /> Open
          decision brief
        </Link>
      </div>
    </section>
  );
}

function BehaviorComparison({ result }: { result: AssessmentResult }) {
  const context = result.behavior_context;
  const normalRange =
    context.normal_amount_min !== null && context.normal_amount_max !== null
      ? `${formatMoney(context.normal_amount_min, "INR")}–${formatMoney(context.normal_amount_max, "INR")}`
      : "Not enough stored history";
  const typicalHours =
    context.typical_hour_start !== null && context.typical_hour_end !== null
      ? `${String(context.typical_hour_start).padStart(2, "0")}:00–${String(context.typical_hour_end).padStart(2, "0")}:59`
      : "Not enough stored history";
  return (
    <section className="mt-6 bench-panel p-5">
      <SectionHeading
        eyebrow="Behavioral engine"
        title={`Behavior deviation: ${context.deviation_level}`}
        detail={`${context.history_sample_size} prior customer events · ${context.baseline_source.replaceAll("_", " ").toLowerCase()}`}
      />
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="border border-[var(--line)] bg-[var(--panel-2)] p-4">
          <p className="rail-label">Customer baseline</p>
          <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-3 text-xs">
            <dt className="text-[var(--muted-ink)]">Stored-history average</dt>
            <dd className="font-mono-app font-bold">
              {formatMoney(context.average_amount, "INR")}
            </dd>
            <dt className="text-[var(--muted-ink)]">Model input average</dt>
            <dd className="font-mono-app font-bold">
              {formatMoney(context.model_average_amount, "INR")}
            </dd>
            <dt className="text-[var(--muted-ink)]">Observed range</dt>
            <dd className="text-right font-mono-app font-bold">
              {normalRange}
            </dd>
            <dt className="text-[var(--muted-ink)]">Typical device</dt>
            <dd className="font-mono-app font-bold">
              {context.typical_device ?? "Unavailable"}
            </dd>
            <dt className="text-[var(--muted-ink)]">Typical location</dt>
            <dd className="font-mono-app font-bold">
              {context.typical_location ?? "Unavailable"}
            </dd>
            <dt className="text-[var(--muted-ink)]">Observed time range</dt>
            <dd className="font-mono-app font-bold">{typicalHours}</dd>
          </dl>
        </div>
        <div className="border border-[var(--rust)] bg-[var(--rust)]/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="rail-label text-[var(--rust)]">Current transaction</p>
            <RiskBadge
              level={context.deviation_level}
              score={result.behavior_score}
            />
          </div>
          <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-3 text-xs">
            <dt className="text-[var(--muted-ink)]">Amount</dt>
            <dd className="font-mono-app font-bold">
              {formatMoney(context.current_amount, "INR")}
            </dd>
            <dt className="text-[var(--muted-ink)]">
              Amount vs stored baseline
            </dt>
            <dd className="font-mono-app font-bold">
              {context.amount_deviation_ratio.toFixed(2)}×
            </dd>
            <dt className="text-[var(--muted-ink)]">Amount vs model input</dt>
            <dd className="font-mono-app font-bold">
              {context.model_amount_deviation_ratio.toFixed(2)}×
            </dd>
            <dt className="text-[var(--muted-ink)]">Device</dt>
            <dd className="font-mono-app font-bold">
              {context.current_device ?? "Unavailable"}{" "}
              {context.is_new_device ? "/ NEW IN HISTORY" : "/ SEEN BEFORE"}
            </dd>
            <dt className="text-[var(--muted-ink)]">Location</dt>
            <dd className="font-mono-app font-bold">
              {context.current_location ?? "Unavailable"}{" "}
              {context.is_new_location ? "/ NEW IN HISTORY" : "/ SEEN BEFORE"}
            </dd>
            <dt className="text-[var(--muted-ink)]">Transaction time</dt>
            <dd className="font-mono-app font-bold">
              {String(context.current_hour).padStart(2, "0")}:00 hour
            </dd>
          </dl>
        </div>
      </div>
      {context.history_sample_size === 0 && (
        <p className="mt-3 border border-[var(--brass)]/60 bg-[var(--brass)]/10 p-3 text-[11px] leading-5 text-[var(--brass)]">
          No prior stored customer events were available. The engine used the
          submitted customer-average baseline and marks unavailable history
          explicitly.
        </p>
      )}
      {context.history_sample_size > 0 &&
        (context.submitted_is_new_device !== context.is_new_device ||
          context.submitted_is_new_location !== context.is_new_location) && (
          <p className="mt-3 border border-[var(--brass)]/60 bg-[var(--brass)]/10 p-3 text-[11px] leading-5 text-[var(--brass)]">
            Input reconciliation: a submitted new-device or new-location flag
            differs from stored merchant history. The model output preserves the
            submitted feature; this comparison labels the historical observation
            separately.
          </p>
        )}
    </section>
  );
}

type DatasetLookupOption = {
  value: string;
  description: string;
  searchText?: string;
};

function DatasetLookupField({
  id,
  label,
  value,
  selectedValue,
  searchPlaceholder,
  emptyMessage,
  options,
  loading,
  onChange,
  onSelect,
}: {
  id: string;
  label: string;
  value: string;
  selectedValue?: string;
  searchPlaceholder: string;
  emptyMessage: string;
  options: DatasetLookupOption[];
  loading?: boolean;
  onChange: (value: string) => void;
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-xs font-bold">
        {label}
      </label>
      <div className="flex">
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          type="text"
          className="min-h-11 min-w-0 flex-1 border border-r-0 border-[var(--input-line)] bg-[var(--canvas)] px-3 text-sm outline-none focus:border-[var(--rust)]"
          required
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-expanded={open}
              aria-label={`Browse ${label.toLowerCase()}s from the active dataset`}
              title={`Browse ${label.toLowerCase()}s`}
              className="flex min-h-11 min-w-11 items-center justify-center border border-[var(--input-line)] bg-[var(--panel-2)] text-[var(--muted-ink)] outline-none hover:border-[var(--rust)] hover:text-[var(--rust)] focus-visible:border-[var(--rust)] focus-visible:ring-2 focus-visible:ring-[var(--rust)]/25"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-[min(28rem,calc(100vw-2rem))] border-[var(--line-bright)] bg-[var(--panel)] p-0 text-[var(--ink)]"
          >
            <CommandMenu
              filter={(candidate, search) =>
                candidate.toLowerCase().includes(search.trim().toLowerCase())
                  ? 1
                  : 0
              }
              className="rounded-none bg-[var(--panel)] text-[var(--ink)]"
            >
              <CommandInput
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="font-mono-app text-xs"
              />
              <CommandList className="max-h-72">
                <CommandEmpty className="py-6 text-xs text-[var(--muted-ink)]">
                  {emptyMessage}
                </CommandEmpty>
                <CommandGroup
                  heading={`${options.length} available in the active dataset`}
                  className="[&_[cmdk-group-heading]]:font-mono-app [&_[cmdk-group-heading]]:text-[9px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-[var(--muted-ink)]"
                >
                  {options.map((option) => (
                    <CommandItem
                      key={option.value}
                      value={`${option.value} ${option.description} ${option.searchText ?? ""}`}
                      onSelect={() => {
                        onSelect(option.value);
                        setOpen(false);
                      }}
                      className="min-h-11 rounded-none border-b border-[var(--line)] px-3 py-2 data-[selected=true]:bg-[var(--rust)]/10 data-[selected=true]:text-[var(--ink)]"
                    >
                      <Check
                        className={cn(
                          "h-3.5 w-3.5 shrink-0 text-[var(--teal)]",
                          selectedValue === option.value
                            ? "opacity-100"
                            : "opacity-0",
                        )}
                        aria-hidden="true"
                      />
                      <span className="min-w-0">
                        <strong className="block truncate font-mono-app text-xs">
                          {option.value}
                        </strong>
                        <span className="mt-0.5 block truncate text-[10px] text-[var(--muted-ink)]">
                          {option.description}
                        </span>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </CommandMenu>
          </PopoverContent>
        </Popover>
      </div>
      <p className="mt-1.5 text-[10px] leading-4 text-[var(--muted-ink)]">
        {loading
          ? "Loading IDs from the active dataset…"
          : `${options.length} stored ID${options.length === 1 ? "" : "s"} available · type manually or use search`}
      </p>
    </div>
  );
}

function AssessmentPage() {
  const queryClient = useQueryClient();
  const transactionQuery = useApiData<RiskTransaction[]>("/risk/transactions");
  const user = JSON.parse(
    sessionStorage.getItem("razorshield_user") ?? "{}",
  ) as AuthUser;
  const [form, setForm] = useState({
    transaction_id: `TX-${Date.now().toString().slice(-6)}`,
    customer_id: "CUS-NEW",
    amount: "42000",
    customer_average_amount: "3200",
    device_id: "DEV-NEW",
    location: "Hyderabad",
    payment_method: "Card",
    transactions_last_5_minutes: "8",
    transactions_last_15_minutes: "8",
    transactions_last_hour: "21",
    failed_attempts_last_10_minutes: "5",
    shared_device_accounts: "6",
    historical_return_rate: "0.35",
    customer_age: "21",
    account_age_days: "1095",
    historical_fraud_count: "0",
    recipient_id: "ABC-UNIVERSITY",
    recipient_type: "INSTITUTION",
    recipient_category: "EDUCATION",
    transaction_intent: "EDUCATION",
    recipient_risk_score: "0.08",
    recipient_transaction_count: "1200",
    customer_recipient_transactions: "3",
    transactions_to_same_recipient_last_15_minutes: "1",
    amount_to_same_recipient_last_hour: "120000",
    unique_customers_to_recipient: "800",
    unique_devices_to_recipient: "650",
  });
  const [novelty, setNovelty] = useState({
    is_new_device: true,
    is_new_location: true,
  });
  const [recipientContext, setRecipientContext] = useState({
    recipient_verified: true,
    recipient_used_before: true,
  });
  const [result, setResult] = useState<AssessmentResult>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchMessage, setBatchMessage] = useState("");
  const [lookupMessage, setLookupMessage] = useState("");
  const [sourceTransactionId, setSourceTransactionId] = useState<string>();
  const [whyOpen, setWhyOpen] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);
  const transactions = useMemo(
    () => transactionQuery.data ?? [],
    [transactionQuery.data],
  );
  const transactionOptions = useMemo(
    () =>
      transactions.map((transaction) => ({
        value: transaction.transactionId,
        description: `${transaction.customerId} · ${formatMoney(transaction.amount, transaction.currency)} · ${transaction.riskLevel}`,
      })),
    [transactions],
  );
  const customerOptions = useMemo(() => {
    const customers = new Map<
      string,
      { count: number; latest: RiskTransaction; transactionIds: string[] }
    >();
    transactions.forEach((transaction) => {
      const current = customers.get(transaction.customerId);
      customers.set(transaction.customerId, {
        count: (current?.count ?? 0) + 1,
        transactionIds: [
          ...(current?.transactionIds ?? []),
          transaction.transactionId,
        ],
        latest:
          !current ||
          new Date(transaction.timestamp) > new Date(current.latest.timestamp)
            ? transaction
            : current.latest,
      });
    });
    return Array.from(customers.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([customerId, summary]) => ({
        value: customerId,
        description: `${summary.count} transaction${summary.count === 1 ? "" : "s"} · latest ${summary.latest.transactionId}`,
        searchText: summary.transactionIds.join(" "),
      }));
  }, [transactions]);
  const update = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const loadTransactionTemplate = (transactionId: string) => {
    const transaction = transactions.find(
      (item) => item.transactionId === transactionId,
    );
    if (!transaction) return;
    const nextTransactionId = `TX-RECHECK-${Date.now().toString().slice(-8)}`;
    setSourceTransactionId(transaction.transactionId);
    setForm((current) => ({
      ...current,
      transaction_id: nextTransactionId,
      customer_id: transaction.customerId,
      amount: String(transaction.amount),
    }));
    setLookupMessage(
      `${transaction.transactionId} loaded as a template. A new ID, ${nextTransactionId}, was created to preserve the original assessment.`,
    );
  };
  const selectCustomer = (customerId: string) => {
    setSourceTransactionId(undefined);
    update("customer_id", customerId);
    const count = transactions.filter(
      (transaction) => transaction.customerId === customerId,
    ).length;
    setLookupMessage(
      `${customerId} selected from ${count} stored transaction${count === 1 ? "" : "s"}.`,
    );
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = {
        ...form,
        merchant_id: user.merchant_id,
        amount: Number(form.amount),
        customer_average_amount: Number(form.customer_average_amount),
        transactions_last_5_minutes: Number(form.transactions_last_5_minutes),
        transactions_last_15_minutes: Number(form.transactions_last_15_minutes),
        transactions_last_hour: Number(form.transactions_last_hour),
        failed_attempts_last_10_minutes: Number(
          form.failed_attempts_last_10_minutes,
        ),
        shared_device_accounts: Number(form.shared_device_accounts),
        historical_return_rate: Number(form.historical_return_rate),
        customer_age: Number(form.customer_age),
        account_age_days: Number(form.account_age_days),
        historical_fraud_count: Number(form.historical_fraud_count),
        recipient_risk_score: Number(form.recipient_risk_score),
        recipient_transaction_count: Number(form.recipient_transaction_count),
        customer_recipient_transactions: Number(
          form.customer_recipient_transactions,
        ),
        transactions_to_same_recipient_last_15_minutes: Number(
          form.transactions_to_same_recipient_last_15_minutes,
        ),
        amount_to_same_recipient_last_hour: Number(
          form.amount_to_same_recipient_last_hour,
        ),
        unique_customers_to_recipient: Number(
          form.unique_customers_to_recipient,
        ),
        unique_devices_to_recipient: Number(form.unique_devices_to_recipient),
        recipient_verified: recipientContext.recipient_verified,
        recipient_used_before: recipientContext.recipient_used_before,
        is_new_device: novelty.is_new_device,
        is_new_location: novelty.is_new_location,
        payment_method: form.payment_method,
        currency: "INR",
      };
      const assessed = await authenticatedRequest<AssessmentResult>(
        "/risk/assess",
        { method: "POST", body: JSON.stringify(payload) },
      );
      setResult(assessed);
      window.dispatchEvent(new Event("razorshield-dataset-changed"));
      announceLiveDataRefresh();
      await queryClient.invalidateQueries();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Assessment failed");
    } finally {
      setBusy(false);
    }
  };
  const uploadBatch = async (file?: File) => {
    if (!file) return;
    setBatchBusy(true);
    setBatchMessage("");
    setError("");
    try {
      const text = await file.text();
      let rows: Array<Record<string, unknown>>;
      if (file.name.toLowerCase().endsWith(".json")) {
        const parsed = JSON.parse(text) as
          | Array<Record<string, unknown>>
          | { transactions: Array<Record<string, unknown>> };
        rows = Array.isArray(parsed) ? parsed : parsed.transactions;
      } else {
        const lines = text.trim().split(/\r?\n/).filter(Boolean);
        const headers =
          lines
            .shift()
            ?.split(",")
            .map((item) => item.trim()) ?? [];
        rows = lines.map((line) =>
          Object.fromEntries(
            line
              .split(",")
              .map((value, index) => [headers[index], value.trim()]),
          ),
        );
      }
      const transactions = rows.map((row) => ({
        ...row,
        merchant_id: user.merchant_id,
      }));
      const response = await authenticatedRequest<{ processed: number }>(
        "/risk/assess/batch",
        {
          method: "POST",
          body: JSON.stringify({ transactions, dataset_name: file.name }),
        },
      );
      setBatchMessage(
        `${response.processed} transactions validated, scored, and stored.`,
      );
      window.dispatchEvent(new Event("razorshield-dataset-changed"));
      announceLiveDataRefresh();
      await queryClient.invalidateQueries();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Batch assessment failed",
      );
    } finally {
      setBatchBusy(false);
    }
  };
  return (
    <Shell
      title="Risk assessment"
      eyebrow="Transaction ingestion / Real-time inference"
    >
      <section className="mb-6">
        <SectionHeading
          eyebrow="Three ingestion paths"
          title="Choose how transactions enter RazorShield"
          detail="Every path reaches the same authenticated, versioned risk assessment service."
        />
        <div className="grid gap-3 lg:grid-cols-3">
          <article className="bench-panel flex min-h-52 flex-col p-5">
            <div className="flex items-center justify-between">
              <span className="font-mono-app text-[10px] font-bold uppercase text-[var(--rust)]">
                Option A / API
              </span>
              <Activity
                className="h-4 w-4 text-[var(--rust)]"
                aria-hidden="true"
              />
            </div>
            <h2 className="mt-5 font-display text-xl uppercase">
              Real-time payment event
            </h2>
            <p className="mt-2 text-xs leading-5 text-[var(--muted-ink)]">
              A merchant or payment service posts one transaction using its
              bearer token.
            </p>
            <code className="mt-auto block border border-[var(--line)] bg-[var(--canvas)] p-3 font-mono-app text-[11px] text-[var(--teal)]">
              POST /api/v1/risk/assess
            </code>
          </article>

          <article className="bench-panel flex min-h-52 flex-col p-5">
            <div className="flex items-center justify-between">
              <span className="font-mono-app text-[10px] font-bold uppercase text-[var(--rust)]">
                Option B / Batch
              </span>
              <Upload
                className="h-4 w-4 text-[var(--rust)]"
                aria-hidden="true"
              />
            </div>
            <h2 className="mt-5 font-display text-xl uppercase">
              Upload CSV or JSON
            </h2>
            <p className="mt-2 text-xs leading-5 text-[var(--muted-ink)]">
              Validate, score, and activate up to 250 transaction rows in one
              batch.
            </p>
            <label className="bench-button mt-auto min-h-11 cursor-pointer justify-center">
              <Upload className="h-4 w-4" aria-hidden="true" />
              {batchBusy ? "Processing…" : "Upload CSV / JSON"}
              <input
                type="file"
                accept=".csv,.json,application/json,text/csv"
                disabled={batchBusy}
                onChange={(event) => void uploadBatch(event.target.files?.[0])}
                className="sr-only"
              />
            </label>
          </article>

          <article className="bench-panel flex min-h-52 flex-col p-5">
            <div className="flex items-center justify-between">
              <span className="font-mono-app text-[10px] font-bold uppercase text-[var(--rust)]">
                Option C / Single event
              </span>
              <Plus className="h-4 w-4 text-[var(--rust)]" aria-hidden="true" />
            </div>
            <h2 className="mt-5 font-display text-xl uppercase">
              Assess one transaction
            </h2>
            <p className="mt-2 text-xs leading-5 text-[var(--muted-ink)]">
              Enter one transaction. RazorShield automatically scores, explains,
              investigates, and recommends the next action.
            </p>
            <a
              href="#manual-assessment"
              className="bench-button mt-auto min-h-11 justify-center"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" /> Open
              transaction form
            </a>
          </article>
        </div>
        {batchMessage && (
          <p
            role="status"
            className="mt-3 border border-[var(--teal)]/60 bg-[var(--teal)]/10 p-3 text-xs font-bold text-[var(--teal)]"
          >
            {batchMessage}
          </p>
        )}
      </section>
      <div className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
        <section
          id="manual-assessment"
          className="bench-panel scroll-mt-28 p-5"
        >
          <SectionHeading
            eyebrow="Single transaction"
            title="Assess a transaction"
            detail="Submit once. The complete RazorShield AI workflow runs automatically."
          />
          <div className="mb-4 flex items-center justify-between gap-3 border border-[var(--line)] bg-[var(--panel-2)] p-3">
            <div>
              <p className="rail-label">Merchant ID</p>
              <p className="mt-1 font-mono-app text-xs font-bold text-[var(--ink)]">
                {user.merchant_reference ?? user.merchant_id}
              </p>
            </div>
            <span className="flex items-center gap-1.5 font-mono-app text-[9px] uppercase text-[var(--teal)]">
              <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />{" "}
              Authenticated scope
            </span>
          </div>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <DatasetLookupField
              id="assessment-transaction-id"
              label="Transaction ID"
              value={form.transaction_id}
              selectedValue={sourceTransactionId}
              searchPlaceholder="Search transaction ID or customer…"
              emptyMessage="No matching transaction was found."
              options={transactionOptions}
              loading={transactionQuery.isLoading}
              onChange={(value) => {
                setSourceTransactionId(undefined);
                setLookupMessage("");
                update("transaction_id", value);
              }}
              onSelect={loadTransactionTemplate}
            />
            <DatasetLookupField
              id="assessment-customer-id"
              label="Customer ID"
              value={form.customer_id}
              selectedValue={
                customerOptions.some(
                  (option) => option.value === form.customer_id,
                )
                  ? form.customer_id
                  : undefined
              }
              searchPlaceholder="Search customer or transaction ID…"
              emptyMessage="No matching customer was found."
              options={customerOptions}
              loading={transactionQuery.isLoading}
              onChange={(value) => {
                setLookupMessage("");
                update("customer_id", value);
              }}
              onSelect={selectCustomer}
            />
            {transactionQuery.isError && (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-3 border border-[var(--rust)] bg-[var(--rust)]/10 p-3 text-[11px] text-[var(--rust)] sm:col-span-2"
              >
                <span>The active dataset IDs could not be loaded.</span>
                <button
                  type="button"
                  onClick={() => void transactionQuery.refetch()}
                  className="bench-button min-h-9"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  Retry
                </button>
              </div>
            )}
            {lookupMessage && (
              <div
                role="status"
                aria-live="polite"
                className="flex flex-wrap items-center justify-between gap-3 border border-[var(--teal)]/60 bg-[var(--teal)]/10 p-3 text-[11px] leading-5 text-[var(--teal)] sm:col-span-2"
              >
                <span>{lookupMessage}</span>
                {sourceTransactionId && (
                  <Link
                    href={`/investigations/${encodeURIComponent(sourceTransactionId)}`}
                    className="bench-button min-h-9 shrink-0"
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    Open original
                  </Link>
                )}
              </div>
            )}
            {(
              [
                ["amount", "Amount (INR)"],
                ["customer_average_amount", "Customer average"],
                ["device_id", "Device ID"],
                ["location", "Location"],
                ["payment_method", "Payment method"],
                ["transactions_last_5_minutes", "Transactions / 5 min"],
                ["transactions_last_15_minutes", "Transactions / 15 min"],
                ["transactions_last_hour", "Transactions / hour"],
                ["failed_attempts_last_10_minutes", "Failed attempts / 10 min"],
                ["shared_device_accounts", "Shared device accounts"],
                ["historical_return_rate", "Historical return rate"],
              ] as Array<[keyof typeof form, string]>
            ).map(([key, label]) => (
              <label key={key} className="block">
                <span className="mb-2 block text-xs font-bold">{label}</span>
                <input
                  value={form[key]}
                  onChange={(event) => update(key, event.target.value)}
                  type={
                    key.includes("amount") ||
                    key.includes("minutes") ||
                    key.includes("hour") ||
                    key.includes("accounts") ||
                    key.includes("rate")
                      ? "number"
                      : "text"
                  }
                  step={key.includes("rate") ? ".01" : "any"}
                  className="min-h-11 w-full border border-[var(--input-line)] bg-[var(--canvas)] px-3 text-sm outline-none focus:border-[var(--rust)]"
                  required
                />
              </label>
            ))}
            <details className="border border-[var(--line)] bg-[var(--panel-2)] sm:col-span-2">
              <summary className="cursor-pointer px-4 py-3 font-mono-app text-[10px] font-bold uppercase tracking-wider text-[var(--ink)] hover:text-[var(--rust)]">
                Customer, recipient, and transaction context
              </summary>
              <div className="grid gap-4 border-t border-[var(--line)] p-4 sm:grid-cols-2">
                <p className="text-[10px] leading-4 text-[var(--muted-ink)] sm:col-span-2">
                  These fields contextualize risk. Customer age is monitored for
                  fairness and never acts as a fraud verdict.
                </p>
                {(
                  [
                    ["customer_age", "Customer age"],
                    ["account_age_days", "Account age (days)"],
                    ["historical_fraud_count", "Historical fraud outcomes"],
                    ["recipient_id", "Recipient ID"],
                    ["recipient_type", "Recipient type"],
                    ["recipient_risk_score", "Recipient risk (0–1)"],
                    [
                      "recipient_transaction_count",
                      "Recipient transaction count",
                    ],
                    [
                      "customer_recipient_transactions",
                      "Previous payments to recipient",
                    ],
                    [
                      "transactions_to_same_recipient_last_15_minutes",
                      "Same-recipient payments / 15 min",
                    ],
                    [
                      "amount_to_same_recipient_last_hour",
                      "Amount to recipient / hour",
                    ],
                    [
                      "unique_customers_to_recipient",
                      "Customers linked to recipient",
                    ],
                    [
                      "unique_devices_to_recipient",
                      "Devices linked to recipient",
                    ],
                  ] as Array<[keyof typeof form, string]>
                ).map(([key, label]) => (
                  <label key={key} className="block">
                    <span className="mb-2 block text-xs font-bold">
                      {label}
                    </span>
                    <input
                      value={form[key]}
                      onChange={(event) => update(key, event.target.value)}
                      type={
                        key === "recipient_id" || key === "recipient_type"
                          ? "text"
                          : "number"
                      }
                      min={key === "customer_age" ? 13 : 0}
                      max={key === "customer_age" ? 120 : undefined}
                      step={key === "recipient_risk_score" ? ".01" : "any"}
                      className="min-h-11 w-full border border-[var(--input-line)] bg-[var(--canvas)] px-3 text-sm outline-none focus:border-[var(--rust)]"
                      required
                    />
                  </label>
                ))}
                {(
                  [
                    ["recipient_category", "Recipient category"],
                    ["transaction_intent", "Transaction intent"],
                  ] as Array<
                    ["recipient_category" | "transaction_intent", string]
                  >
                ).map(([key, label]) => (
                  <label key={key} className="block">
                    <span className="mb-2 block text-xs font-bold">
                      {label}
                    </span>
                    <select
                      value={form[key]}
                      onChange={(event) => update(key, event.target.value)}
                      className="min-h-11 w-full border border-[var(--input-line)] bg-[var(--canvas)] px-3 text-sm outline-none focus:border-[var(--rust)]"
                    >
                      {[
                        "EDUCATION",
                        "HEALTHCARE",
                        "RENT",
                        "UTILITY",
                        "SHOPPING",
                        "TRAVEL",
                        "INVESTMENT",
                        "PERSONAL_TRANSFER",
                        "UNKNOWN",
                      ].map((option) => (
                        <option key={option} value={option}>
                          {option.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                {(
                  [
                    ["recipient_verified", "Verified recipient"],
                    ["recipient_used_before", "Recipient used before"],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex min-h-11 cursor-pointer items-center gap-3 border border-[var(--input-line)] bg-[var(--canvas)] px-3 text-xs font-bold"
                  >
                    <input
                      type="checkbox"
                      checked={recipientContext[key]}
                      onChange={(event) =>
                        setRecipientContext((current) => ({
                          ...current,
                          [key]: event.target.checked,
                        }))
                      }
                      className="h-4 w-4 accent-[var(--rust)]"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </details>
            <fieldset className="grid gap-3 border border-[var(--line)] bg-[var(--panel-2)] p-3 sm:col-span-2 sm:grid-cols-2">
              <legend className="px-1 text-xs font-bold">
                Submitted novelty signals
              </legend>
              {(
                [
                  ["is_new_device", "New device"],
                  ["is_new_location", "New location"],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex min-h-11 cursor-pointer items-center gap-3 border border-[var(--input-line)] bg-[var(--canvas)] px-3 text-xs font-bold"
                >
                  <input
                    type="checkbox"
                    checked={novelty[key]}
                    onChange={(event) =>
                      setNovelty((current) => ({
                        ...current,
                        [key]: event.target.checked,
                      }))
                    }
                    className="h-4 w-4 accent-[var(--rust)]"
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <button
              disabled={busy}
              className="bench-button min-h-11 justify-center sm:col-span-2"
            >
              {busy ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Activity className="h-4 w-4" />
              )}{" "}
              {busy ? "RazorShield AI is working" : "Submit transaction"}
            </button>
          </form>
          {error && (
            <div
              role="alert"
              className="mt-4 border border-[var(--rust)] bg-[var(--rust)]/10 p-3 text-xs text-[var(--rust)]"
            >
              {error}
            </div>
          )}
        </section>
        <section className="bench-panel p-5">
          {result ? (
            <div>
              <div className="flex items-start justify-between border-b border-[var(--line)] pb-5">
                <div>
                  <p className="rail-label text-[var(--rust)]">
                    {result.transaction_id}
                  </p>
                  <h2 className="mt-2 font-display text-3xl uppercase">
                    {result.recommended_action.replaceAll("_", " ")}
                  </h2>
                  <div className="mt-3">
                    <RiskBadge
                      level={result.risk_level}
                      score={result.risk_score}
                    />
                  </div>
                </div>
                <p className="font-display text-7xl tracking-[-.1em]">
                  {result.risk_score}
                </p>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="border border-[var(--line)] bg-[var(--panel-2)] p-4">
                  <p className="rail-label">Risk score</p>
                  <p className="mt-2 font-display text-3xl uppercase">
                    {result.risk_score} / 100
                  </p>
                </div>
                <div className="border border-[var(--line)] bg-[var(--panel-2)] p-4">
                  <p className="rail-label">Why & evidence</p>
                  <p className="mt-2 font-display text-3xl uppercase">
                    {result.signals.length} signals
                  </p>
                </div>
                <div className="border border-[var(--line)] bg-[var(--panel-2)] p-4">
                  <p className="rail-label">AI investigation</p>
                  <p className="mt-2 text-xs font-bold uppercase leading-5 text-[var(--teal)]">
                    {result.risk_score >= 31
                      ? "Prepared automatically"
                      : "Automatic screening complete"}
                  </p>
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <button
                  aria-expanded={whyOpen}
                  onClick={() => setWhyOpen((open) => !open)}
                  className="bench-button min-h-11 justify-center"
                >
                  <FileSearch className="h-4 w-4" /> Why this score?
                </button>
                <button
                  aria-expanded={actionOpen}
                  onClick={() => setActionOpen((open) => !open)}
                  className="bench-button min-h-11 justify-center"
                >
                  <Target className="h-4 w-4" /> What should I do?
                </button>
              </div>
              {whyOpen && (
                <section
                  role="region"
                  aria-label="Why this score"
                  className="mt-3 border border-[var(--line)] bg-[var(--canvas)] p-4"
                >
                  <BulletList
                    title="Evidence-backed explanation"
                    items={
                      result.risk_explanation.length
                        ? result.risk_explanation
                        : result.signals.map((signal) => signal.evidence)
                    }
                    tone="teal"
                  />
                  <p className="mt-3 text-[11px] text-[var(--muted-ink)]">
                    RazorShield combines the available behavioral, transaction,
                    network, and policy evidence automatically.
                  </p>
                </section>
              )}
              {actionOpen && (
                <section
                  role="region"
                  aria-label="Recommended next action"
                  className="mt-3 border border-[var(--brass)] bg-[var(--brass)]/10 p-4"
                >
                  <p className="rail-label text-[var(--brass)]">
                    Recommended action
                  </p>
                  <h3 className="mt-2 font-display text-2xl uppercase">
                    {result.recommended_action.replaceAll("_", " ")}
                  </h3>
                  <p className="mt-2 text-xs leading-5 text-[var(--muted-ink)]">
                    Review the verified evidence and missing information before
                    a human decision. RazorShield does not automatically execute
                    a financial action.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      href={`/investigations/${result.transaction_id}`}
                      className="bench-button"
                    >
                      View evidence
                    </Link>
                    <Link href="/reviews" className="bench-button">
                      Start human review
                    </Link>
                  </div>
                </section>
              )}
              <div className="mt-5">
                <BulletList
                  title="Evidence generated"
                  items={result.signals.map((signal) => signal.evidence)}
                  tone="teal"
                />
              </div>
              <p className="mt-5 border-t border-[var(--line)] pt-4 text-[11px] leading-5 text-[var(--muted-ink)]">
                {result.disclaimer}
              </p>
              <div
                className="mt-5 flex flex-wrap gap-2"
                aria-label="Next steps"
              >
                <Link
                  href={`/investigations/${result.transaction_id}`}
                  className="bench-button"
                >
                  <FileSearch className="h-3.5 w-3.5" aria-hidden="true" /> Open
                  decision brief
                </Link>
                <Link href="/reviews" className="bench-button">
                  <Users className="h-3.5 w-3.5" aria-hidden="true" /> Open
                  human review
                </Link>
                <Link href="/audit" className="bench-button">
                  <History className="h-3.5 w-3.5" aria-hidden="true" /> View
                  audit trail
                </Link>
              </div>
            </div>
          ) : (
            <EmptyState
              title="Ready for inference"
              body="Submit one transaction. RazorShield will automatically produce a risk score, explanation, evidence, AI investigation, and recommendation."
              icon={Activity}
            />
          )}
        </section>
      </div>
      {result && (
        <>
          <RiskPipeline result={result} />
          <details className="mt-6 bench-panel">
            <summary className="cursor-pointer px-5 py-4 font-mono-app text-[10px] font-bold uppercase tracking-wider text-[var(--muted-ink)] hover:text-[var(--ink)]">
              Advanced model evidence · read only
            </summary>
            <div className="border-t border-[var(--line)] px-5 pb-5">
              <RuleEnginePanel result={result} />
              <ExplainabilityPanel result={result} />
              <BehaviorComparison result={result} />
            </div>
          </details>
          {result.risk_level === "HIGH" && (
            <InvestigationHandoff result={result} />
          )}
        </>
      )}
    </Shell>
  );
}

function useApiData<T>(
  path: string,
  options: { live?: boolean; enabled?: boolean } = {},
) {
  const live = options.live ?? true;
  const enabled = options.enabled ?? true;
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(enabled);
  const load = useCallback(
    (showLoading = true) => {
      if (!enabled) {
        setLoading(false);
        return;
      }
      if (showLoading) setLoading(true);
      setError("");
      void authenticatedRequest<T>(path)
        .then(setData)
        .catch((caught: Error) => setError(caught.message))
        .finally(() => setLoading(false));
    },
    [enabled, path],
  );
  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    load();
    if (!live) return;
    const refresh = () => load(false);
    window.addEventListener(LIVE_DATA_REFRESH_EVENT, refresh);
    return () => window.removeEventListener(LIVE_DATA_REFRESH_EVENT, refresh);
  }, [enabled, live, load]);
  const reload = () => load();
  return {
    data,
    error,
    loading,
    reload,
    refetch: reload,
    isError: Boolean(error),
    isLoading: loading,
    isFetching: loading,
  };
}

type ReviewCase = {
  caseId: string;
  transactionId: string;
  customerId: string;
  riskScore: number;
  riskLevel: string;
  amount: number;
  currency: string;
  reason: string;
  status: string;
  assignedReviewer?: string;
  assignedToMe: boolean;
  caseType: string;
  recommendation: string;
  humanDecision?: string;
  createdAt: string;
  ageHours: number;
  slaStatus: string;
};
function ReviewQueuePage() {
  const [, setLocation] = useLocation();
  const query = useApiData<ReviewCase[]>("/reviews");
  const user = getStoredUser();
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [claiming, setClaiming] = useState<string | null>(null);
  const [claimError, setClaimError] = useState("");
  const cases = useMemo(
    () =>
      (query.data ?? []).filter(
        (item) => statusFilter === "ALL" || item.status === statusFilter,
      ),
    [query.data, statusFilter],
  );
  return (
    <Shell title="Review queue" eyebrow="Human control / Prioritized cases">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="rail-label text-[var(--rust)]">Decision boundary</p>
          <h2 className="mt-1 font-display text-3xl uppercase">
            Cases requiring attention
          </h2>
          <p className="mt-2 text-xs text-[var(--muted-ink)]">
            Open the automatically prepared decision brief and record a
            traceable human decision.
          </p>
        </div>
        <div className="flex gap-2">
          {["ALL", "OPEN", "ESCALATED", "PENDING_EVIDENCE", "RESOLVED"].map(
            (status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={cn(
                  "filter-button",
                  statusFilter === status && "filter-active",
                )}
              >
                {status.replaceAll("_", " ")}
              </button>
            ),
          )}
        </div>
      </div>
      {claimError && (
        <p role="alert" className="mb-4 text-sm text-[var(--rust)]">
          {claimError}
        </p>
      )}
      {query.error ? (
        <QueryState error onRetry={query.reload} label={query.error} />
      ) : query.loading ? (
        <LoadingBlock className="h-96" />
      ) : cases.length ? (
        <section className="bench-panel overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="border-b border-[var(--line)] bg-[var(--canvas)] font-mono-app text-[9px] uppercase tracking-wider text-[var(--muted-ink)]">
              <tr>
                {[
                  "Case",
                  "Transaction",
                  "Customer",
                  "Risk",
                  "Amount",
                  "Status",
                  "Reviewer",
                  "Age / SLA",
                  "",
                ].map((label) => (
                  <th key={label} className="px-4 py-3">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cases.map((item) => (
                <tr
                  key={item.caseId}
                  className="border-b border-[var(--line)] hover:bg-[var(--panel-2)]"
                >
                  <td className="px-4 py-4 font-mono-app font-bold">
                    {item.caseId}
                  </td>
                  <td className="px-4 py-4 font-mono-app text-[var(--rust)]">
                    {item.transactionId}
                  </td>
                  <td className="px-4 py-4">
                    <Link
                      href={`/entities/customers/${item.customerId}`}
                      className="hover:text-[var(--rust)]"
                    >
                      {item.customerId}
                    </Link>
                  </td>
                  <td className="px-4 py-4">
                    <RiskBadge level={item.riskLevel} score={item.riskScore} />
                  </td>
                  <td className="px-4 py-4 font-mono-app">
                    {formatMoney(item.amount, item.currency)}
                  </td>
                  <td className="px-4 py-4">
                    {item.status.replaceAll("_", " ")}
                  </td>
                  <td className="px-4 py-4">
                    {item.assignedReviewer ?? "Unassigned"}
                  </td>
                  <td className="px-4 py-4 text-[var(--muted-ink)]">
                    <span className="block">{item.ageHours.toFixed(1)}h</span>
                    <span
                      className={cn(
                        "text-[10px] font-bold uppercase",
                        item.slaStatus === "BREACHED" && "text-[var(--rust)]",
                      )}
                    >
                      {item.slaStatus.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex gap-2">
                      {!item.assignedReviewer &&
                        user &&
                        reviewerRoles.includes(user.role) && (
                          <button
                            disabled={claiming === item.caseId}
                            onClick={async () => {
                              setClaiming(item.caseId);
                              setClaimError("");
                              try {
                                await authenticatedRequest(
                                  `/reviews/${encodeURIComponent(item.caseId)}/claim`,
                                  { method: "POST" },
                                );
                                query.reload();
                              } catch (error) {
                                setClaimError(String((error as Error).message));
                              } finally {
                                setClaiming(null);
                              }
                            }}
                            className="bench-button"
                          >
                            {claiming === item.caseId ? "Claiming…" : "Claim"}
                          </button>
                        )}
                      <button
                        onClick={() =>
                          setLocation(`/investigations/${item.transactionId}`)
                        }
                        className="bench-button"
                      >
                        Open <ChevronRight className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <EmptyState
          title="Queue is clear"
          body="No cases match the selected status."
          icon={Users}
        />
      )}
    </Shell>
  );
}

type FraudIntelligence = {
  status: "SPIKE_DETECTED" | "NOMINAL" | "INSUFFICIENT_DATA";
  currentRate: number;
  baselineRate: number;
  score: number;
  flag: boolean;
  window: string;
  contributors: {
    locations: Array<[string, number]>;
    devices: Array<[string, number]>;
    paymentMethods: Array<[string, number]>;
  };
  sampleSize: number;
  currentSamples: number;
  baselineSamples: number;
  minimumSamples: { current: number; baseline: number };
  trend: Array<{ timestamp: string; riskScore: number; highRisk: boolean }>;
  unavailableContributors: string[];
  limitation: string;
};
function FraudIntelligencePage() {
  const query = useApiData<FraudIntelligence>("/fraud/intelligence");
  const data = query.data;
  return (
    <Shell
      title="Fraud intelligence"
      eyebrow="Spike detection / Emerging patterns"
    >
      <div className="mb-7">
        <p className="rail-label text-[var(--rust)]">Change detection</p>
        <h2 className="mt-1 font-display text-3xl uppercase">
          Where risk is accelerating
        </h2>
        <p className="mt-2 text-xs text-[var(--muted-ink)]">
          Latest stored events compared with the prior merchant baseline.
        </p>
      </div>
      {query.error ? (
        <QueryState error onRetry={query.reload} label={query.error} />
      ) : query.loading || !data ? (
        <LoadingBlock className="h-96" />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
          <section
            className={cn(
              "relative overflow-hidden border p-6",
              data.flag
                ? "border-[var(--rust)] bg-[var(--rust)] text-[var(--canvas)]"
                : "border-[var(--teal)] bg-[var(--panel)]",
            )}
          >
            <p className="rail-label">Fraud spike status</p>
            <div className="mt-6 flex flex-wrap items-end justify-between gap-5">
              <div>
                <h3 className="font-display text-4xl uppercase">
                  {data.status === "INSUFFICIENT_DATA"
                    ? "Insufficient data"
                    : data.flag
                      ? "Spike detected"
                      : "No spike detected"}
                </h3>
                <p className="mt-2 text-xs opacity-70">{data.window}</p>
              </div>
              <span className="font-display text-7xl tracking-[-.1em]">
                {data.score}
              </span>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-4 border-t border-current/20 pt-5">
              <div>
                <p className="font-mono-app text-2xl font-bold">
                  {(data.currentRate * 100).toFixed(1)}%
                </p>
                <p className="mt-1 text-xs opacity-65">
                  Current high-risk rate · {data.currentSamples} events
                </p>
              </div>
              <div>
                <p className="font-mono-app text-2xl font-bold">
                  {(data.baselineRate * 100).toFixed(1)}%
                </p>
                <p className="mt-1 text-xs opacity-65">
                  Baseline high-risk rate · {data.baselineSamples} events
                </p>
              </div>
            </div>
          </section>
          <section className="bench-panel p-5">
            <SectionHeading
              eyebrow="Possible contributors"
              title="Concentration signals"
              detail={`${data.sampleSize} stored events in scope`}
            />
            <div className="space-y-5">
              {(
                [
                  ["Locations", data.contributors.locations],
                  ["Devices", data.contributors.devices],
                  ["Payment methods", data.contributors.paymentMethods],
                ] as Array<[string, Array<[string, number]>]>
              ).map(([label, values]) => (
                <div key={label}>
                  <p className="mb-2 text-xs font-bold uppercase">{label}</p>
                  {values.length ? (
                    values.map(([name, count]) => (
                      <div
                        key={name}
                        className="mb-2 flex items-center justify-between border-b border-[var(--line)] pb-2 text-xs"
                      >
                        <span>{name}</span>
                        <span className="font-mono-app font-bold">{count}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-[var(--muted-ink)]">No data.</p>
                  )}
                </div>
              ))}
            </div>
          </section>
          <p className="xl:col-span-2 border border-[var(--brass)]/60 bg-[var(--brass)]/10 p-4 text-xs text-[var(--muted-ink)]">
            {data.limitation} Not collected in this schema:{" "}
            {data.unavailableContributors.join(", ")}.
          </p>
          <section className="xl:col-span-2 bench-panel p-5">
            <SectionHeading
              eyebrow="Stored-event trend"
              title="Risk score movement"
              detail="Each bar is an actual stored assessment; red marks HIGH risk."
            />
            <div
              className="flex h-44 items-end gap-2"
              role="img"
              aria-label="Stored risk score trend"
            >
              {data.trend.map((point) => (
                <div
                  key={point.timestamp}
                  className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2"
                >
                  <span className="font-mono-app text-[9px]">
                    {point.riskScore}
                  </span>
                  <span
                    className={cn(
                      "w-full max-w-12",
                      point.highRisk ? "bg-[var(--rust)]" : "bg-[var(--teal)]",
                    )}
                    style={{ height: `${Math.max(point.riskScore, 3)}%` }}
                    title={`${formatTime(point.timestamp)} · ${point.riskScore}/100`}
                  />
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </Shell>
  );
}

type AnalyticsPayload = {
  transactions: number;
  highRisk: number;
  mediumRisk: number;
  lowRisk: number;
  potentialLoss: number;
  confirmedFraud: number;
  preventedLoss: number;
  returnRiskCases: number;
  chargebackCandidates: number;
  openReviewWorkload: number;
  resolvedReviews: number;
  costModel: string;
  currency: string;
};
function AnalyticsPage() {
  const query = useApiData<AnalyticsPayload>("/analytics");
  const data = query.data;
  return (
    <Shell
      title="Merchant analytics"
      eyebrow="Business impact / Transparent measurement"
    >
      <div className="mb-7">
        <p className="rail-label text-[var(--rust)]">Accountable metrics</p>
        <h2 className="mt-1 font-display text-3xl uppercase">
          Operational impact
        </h2>
        <p className="mt-2 text-xs text-[var(--muted-ink)]">
          Risk workload and financial exposure without invented savings.
        </p>
      </div>
      {query.error ? (
        <QueryState error onRetry={query.reload} label={query.error} />
      ) : query.loading || !data ? (
        <LoadingBlock className="h-96" />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Transactions analyzed"
              value={formatCompact(data.transactions)}
              subtext="Stored merchant events"
              icon={Activity}
            />
            <MetricCard
              label="Potential loss"
              value={formatMoney(data.potentialLoss, data.currency)}
              subtext="Value of HIGH-risk events"
              icon={Coins}
              tone="danger"
            />
            <MetricCard
              label="Open workload"
              value={formatCompact(data.openReviewWorkload)}
              subtext="Cases needing attention"
              icon={Users}
              tone="gold"
            />
            <MetricCard
              label="Resolved reviews"
              value={formatCompact(data.resolvedReviews)}
              subtext="Human decisions completed"
              icon={BadgeCheck}
              tone="teal"
            />
          </div>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <section className="bench-panel p-5">
              <SectionHeading
                eyebrow="Risk distribution"
                title="Current portfolio"
              />
              <div className="space-y-5">
                <EvalBar
                  label="High risk"
                  value={
                    data.transactions
                      ? (data.highRisk / data.transactions) * 100
                      : 0
                  }
                  note={`${data.highRisk} transactions`}
                />
                <EvalBar
                  label="Medium risk"
                  value={
                    data.transactions
                      ? (data.mediumRisk / data.transactions) * 100
                      : 0
                  }
                  note={`${data.mediumRisk} transactions`}
                />
                <EvalBar
                  label="Low risk"
                  value={
                    data.transactions
                      ? (data.lowRisk / data.transactions) * 100
                      : 0
                  }
                  note={`${data.lowRisk} transactions`}
                />
              </div>
            </section>
            <section className="bench-panel p-5">
              <SectionHeading
                eyebrow="Operational categories"
                title="Post-payment exposure"
              />
              <dl className="space-y-4 text-xs">
                <div className="flex justify-between border-b border-[var(--line)] pb-3">
                  <dt>Return-risk cases</dt>
                  <dd className="font-mono-app font-bold">
                    {data.returnRiskCases}
                  </dd>
                </div>
                <div className="flex justify-between border-b border-[var(--line)] pb-3">
                  <dt>Chargeback candidates</dt>
                  <dd className="font-mono-app font-bold">
                    {data.chargebackCandidates}
                  </dd>
                </div>
                <div className="flex justify-between border-b border-[var(--line)] pb-3">
                  <dt>Confirmed fraud</dt>
                  <dd className="font-mono-app font-bold">
                    {data.confirmedFraud}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Attributed prevented loss</dt>
                  <dd className="font-mono-app font-bold">
                    {formatMoney(data.preventedLoss, data.currency)}
                  </dd>
                </div>
              </dl>
              <p className="mt-6 border-t border-[var(--line)] pt-4 text-[11px] leading-5 text-[var(--muted-ink)]">
                {data.costModel}
              </p>
            </section>
          </div>
        </>
      )}
    </Shell>
  );
}

type Customer360 = {
  customerId: string;
  riskScore: number;
  transactions: number;
  returns: number;
  chargebackCandidates: number;
  devices: string[];
  locations: string[];
  fraudFlags: number;
  relatedEntities: number;
  averageOrderValue: number;
  maximumReturnRisk: number;
  elevatedReturnRiskRate: number;
  ipAddressStatus: string;
  timeline: Array<{
    timestamp: string;
    event: string;
    reference: string;
    riskScore: number;
    detail: string;
  }>;
  provenance: string;
};
function Customer360Page() {
  const params = useParams<{ id: string }>();
  const query = useApiData<Customer360>(
    `/entities/customers/${encodeURIComponent(params.id)}`,
  );
  const data = query.data;
  return (
    <Shell
      title="Customer 360"
      eyebrow="Entity intelligence / Historical context"
    >
      {query.error ? (
        <QueryState error onRetry={query.reload} label={query.error} />
      ) : query.loading || !data ? (
        <LoadingBlock className="h-96" />
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="rail-label text-[var(--rust)]">Customer entity</p>
              <h2 className="mt-1 font-display text-4xl uppercase">
                {data.customerId}
              </h2>
              <p className="mt-2 text-xs text-[var(--muted-ink)]">
                {data.provenance}
              </p>
            </div>
            <div className="text-right">
              <p className="font-display text-6xl tracking-[-.1em]">
                {data.riskScore}
              </p>
              <p className="rail-label">Maximum observed risk</p>
            </div>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <MetricCard
              label="Transactions"
              value={String(data.transactions)}
              subtext="Stored activity"
              icon={Activity}
            />
            <MetricCard
              label="Returns"
              value={String(data.returns)}
              subtext="Elevated return risk"
              icon={ArrowDownRight}
              tone="gold"
            />
            <MetricCard
              label="Chargeback candidates"
              value={String(data.chargebackCandidates)}
              subtext="Score-based, not observed disputes"
              icon={ShieldAlert}
            />
            <MetricCard
              label="Devices"
              value={String(data.devices.length)}
              subtext="Known device IDs"
              icon={Fingerprint}
            />
            <MetricCard
              label="Locations"
              value={String(data.locations.length)}
              subtext="Observed locations"
              icon={Network}
            />
            <MetricCard
              label="Fraud flags"
              value={String(data.fraudFlags)}
              subtext="High-risk events"
              icon={Flag}
              tone="danger"
            />
          </div>
          <div className="mt-5 grid gap-5 lg:grid-cols-[.7fr_1.3fr]">
            <section className="bench-panel p-5">
              <SectionHeading eyebrow="Relationships" title="Known context" />
              <p className="rail-label">Devices</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {data.devices.map((item) => (
                  <span key={item} className="risk-badge">
                    {item}
                  </span>
                ))}
              </div>
              <p className="rail-label mt-6">Locations</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {data.locations.map((item) => (
                  <span key={item} className="risk-badge">
                    {item}
                  </span>
                ))}
              </div>
              <dl className="mt-6 space-y-3 border-t border-[var(--line)] pt-4 text-xs">
                <div className="flex justify-between">
                  <dt className="text-[var(--muted-ink)]">
                    Average order value
                  </dt>
                  <dd className="font-mono-app font-bold">
                    {formatMoney(data.averageOrderValue, "INR")}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[var(--muted-ink)]">
                    Maximum return risk
                  </dt>
                  <dd className="font-mono-app font-bold">
                    {data.maximumReturnRisk}/100
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[var(--muted-ink)]">
                    Elevated return-risk rate
                  </dt>
                  <dd className="font-mono-app font-bold">
                    {(data.elevatedReturnRiskRate * 100).toFixed(0)}%
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[var(--muted-ink)]">IP addresses</dt>
                  <dd className="font-mono-app font-bold">
                    {data.ipAddressStatus.replaceAll("_", " ")}
                  </dd>
                </div>
              </dl>
            </section>
            <section className="bench-panel p-5">
              <SectionHeading eyebrow="Chronology" title="Activity timeline" />
              <div className="space-y-0">
                {data.timeline.map((item) => (
                  <div
                    key={`${item.reference}-${item.timestamp}`}
                    className="grid grid-cols-[18px_1fr] gap-3"
                  >
                    <div className="flex flex-col items-center">
                      <span className="mt-1 h-2 w-2 rounded-full bg-[var(--rust)]" />
                      <span className="h-full w-px bg-[var(--line)]" />
                    </div>
                    <div className="pb-5">
                      <div className="flex flex-wrap justify-between gap-2">
                        <strong className="text-xs">
                          {item.event} · {item.reference}
                        </strong>
                        <span className="font-mono-app text-[9px] text-[var(--muted-ink)]">
                          {formatTime(item.timestamp)}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-[var(--muted-ink)]">
                        {item.detail} · Risk {item.riskScore}/100
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </Shell>
  );
}

type SettingsPayload = {
  displayName: string;
  role: string;
  merchantId: string;
  merchantName: string;
  environment: string;
  agentFinancialActions: string;
  dataProvenance: string;
};
type RuleConfiguration = {
  version: number;
  high_amount_ratio: number;
  velocity_5m_threshold: number;
  failed_attempts_threshold: number;
  shared_device_accounts_threshold: number;
  new_device_amount_ratio: number;
  geographic_amount_ratio: number;
  updated_at: string | null;
};
type PolicyRecord = {
  id: string;
  name: string;
  category: string;
  version: string;
  content: string;
  isActive: boolean;
};
function SettingsPage() {
  const query = useApiData<SettingsPayload>("/settings/profile", {
    live: false,
  });
  const ruleQuery = useApiData<RuleConfiguration>("/risk/rules/config", {
    live: false,
  });
  const policyQuery = useApiData<PolicyRecord[]>("/agent/policies", {
    live: false,
  });
  const data = query.data;
  const [ruleDraft, setRuleDraft] = useState<RuleConfiguration>();
  const [ruleFeedback, setRuleFeedback] = useState("");
  const [savingRules, setSavingRules] = useState(false);
  useEffect(() => {
    if (ruleQuery.data) setRuleDraft(ruleQuery.data);
  }, [ruleQuery.data]);
  const saveRules = async (event: FormEvent) => {
    event.preventDefault();
    if (!ruleDraft) return;
    setSavingRules(true);
    setRuleFeedback("");
    try {
      const saved = await authenticatedRequest<RuleConfiguration>(
        "/risk/rules/config",
        {
          method: "PATCH",
          body: JSON.stringify({
            high_amount_ratio: ruleDraft.high_amount_ratio,
            velocity_5m_threshold: ruleDraft.velocity_5m_threshold,
            failed_attempts_threshold: ruleDraft.failed_attempts_threshold,
            shared_device_accounts_threshold:
              ruleDraft.shared_device_accounts_threshold,
            new_device_amount_ratio: ruleDraft.new_device_amount_ratio,
            geographic_amount_ratio: ruleDraft.geographic_amount_ratio,
          }),
        },
      );
      setRuleDraft(saved);
      setRuleFeedback(
        `Rule configuration v${saved.version} saved and audited.`,
      );
      announceLiveDataRefresh();
    } catch (caught) {
      setRuleFeedback(
        caught instanceof Error ? caught.message : "Rules could not be saved.",
      );
    } finally {
      setSavingRules(false);
    }
  };
  return (
    <Shell title="Settings" eyebrow="Merchant profile / Safety controls">
      {query.error ? (
        <QueryState error onRetry={query.reload} label={query.error} />
      ) : query.loading || !data ? (
        <LoadingBlock className="h-80" />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="bench-panel p-5">
            <SectionHeading
              eyebrow="Authenticated profile"
              title={data.displayName}
              detail={data.role.replaceAll("_", " ")}
            />
            <dl className="space-y-4 text-xs">
              <div className="flex justify-between border-b border-[var(--line)] pb-3">
                <dt className="text-[var(--muted-ink)]">Merchant</dt>
                <dd className="font-bold">{data.merchantName}</dd>
              </div>
              <div className="flex justify-between border-b border-[var(--line)] pb-3">
                <dt className="text-[var(--muted-ink)]">Merchant ID</dt>
                <dd className="font-mono-app">{data.merchantId}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--muted-ink)]">Environment</dt>
                <dd className="font-mono-app uppercase">{data.environment}</dd>
              </div>
            </dl>
          </section>
          <section className="border border-[var(--teal)]/60 bg-[var(--teal)]/10 p-5">
            <SectionHeading
              eyebrow="Defense-only boundary"
              title="Agent safety"
            />
            <div className="flex items-center justify-between border-b border-[var(--teal)]/30 pb-4">
              <span className="text-xs">Autonomous financial actions</span>
              <span className="risk-badge risk-low">
                {data.agentFinancialActions}
              </span>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs">Data provenance</span>
              <span className="font-mono-app text-[10px] font-bold">
                {data.dataProvenance}
              </span>
            </div>
            <p className="mt-6 text-xs leading-5 text-[var(--muted-ink)]">
              Risk thresholds and policies are server-controlled. Production
              changes require an ADMIN workflow and audited policy versioning.
            </p>
          </section>
          <section className="bench-panel p-5 lg:col-span-2">
            <SectionHeading
              eyebrow="Rule engine"
              title={`Merchant thresholds · v${ruleDraft?.version ?? "—"}`}
              detail="Changes apply to future assessments and create an audit event"
            />
            {ruleQuery.error ? (
              <QueryState
                error
                onRetry={ruleQuery.reload}
                label={ruleQuery.error}
              />
            ) : !ruleDraft ? (
              <LoadingBlock className="h-48" />
            ) : (
              <form
                onSubmit={(event) => void saveRules(event)}
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
              >
                {(
                  [
                    ["high_amount_ratio", "High amount ratio", "× average"],
                    [
                      "velocity_5m_threshold",
                      "Velocity threshold",
                      "events / 5 min",
                    ],
                    [
                      "failed_attempts_threshold",
                      "Failed attempts",
                      "events / 10 min",
                    ],
                    [
                      "shared_device_accounts_threshold",
                      "Shared accounts",
                      "accounts",
                    ],
                    [
                      "new_device_amount_ratio",
                      "New-device amount",
                      "× average",
                    ],
                    [
                      "geographic_amount_ratio",
                      "New-location amount",
                      "× average",
                    ],
                  ] as Array<[keyof RuleConfiguration, string, string]>
                ).map(([key, label, unit]) => (
                  <label key={key} className="block">
                    <span className="mb-2 block text-xs font-bold">
                      {label}
                    </span>
                    <span className="flex min-h-11 items-center border border-[var(--input-line)] bg-[var(--canvas)] focus-within:border-[var(--rust)]">
                      <input
                        type="number"
                        min="1"
                        step={key.includes("ratio") ? ".1" : "1"}
                        value={ruleDraft[key] ?? ""}
                        onChange={(event) =>
                          setRuleDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  [key]: Number(event.target.value),
                                }
                              : current,
                          )
                        }
                        className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
                        required
                      />
                      <span className="pr-3 font-mono-app text-[9px] text-[var(--muted-ink)]">
                        {unit}
                      </span>
                    </span>
                  </label>
                ))}
                <div className="flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-4 sm:col-span-2 lg:col-span-3">
                  <button
                    disabled={savingRules}
                    className="bench-button min-h-11"
                  >
                    {savingRules ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Settings className="h-4 w-4" />
                    )}
                    Save rule thresholds
                  </button>
                  {ruleFeedback && (
                    <p role="status" className="text-xs text-[var(--teal)]">
                      {ruleFeedback}
                    </p>
                  )}
                </div>
              </form>
            )}
          </section>
          <section className="bench-panel p-5 lg:col-span-2">
            <SectionHeading
              eyebrow="RAG knowledge base"
              title="Active organization policies"
              detail="Only active, merchant-scoped records are eligible for investigator retrieval"
            />
            {policyQuery.error ? (
              <QueryState
                error
                onRetry={policyQuery.reload}
                label={policyQuery.error}
              />
            ) : policyQuery.loading ? (
              <LoadingBlock className="h-48" />
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {(policyQuery.data ?? []).map((policy) => (
                  <article
                    key={policy.id}
                    className="border border-[var(--line)] bg-[var(--panel-2)] p-4"
                  >
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="font-mono-app text-[9px] font-bold text-[var(--teal)]">
                        {policy.category.replaceAll("_", " ")}
                      </span>
                      <span className="font-mono-app text-[9px] text-[var(--muted-ink)]">
                        v{policy.version}
                      </span>
                    </div>
                    <h3 className="mt-2 text-xs font-bold uppercase">
                      {policy.name}
                    </h3>
                    <p className="mt-2 line-clamp-4 text-[11px] leading-5 text-[var(--muted-ink)]">
                      {policy.content}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </Shell>
  );
}

type MonitoringPayload = {
  models: Record<
    string,
    {
      version: string;
      algorithm: string;
      threshold?: number;
      metrics?: Record<string, number | number[][]>;
    }
  >;
  dataset: {
    provenance: string;
    rows: number;
    held_out_rows: number;
    split: string;
  };
  operational: {
    measuredRequests: number;
    averageInferenceLatencyMs?: number;
    errorRate?: number;
    errorRateStatus: string;
  };
  drift: {
    status: string;
    sampleSize: number;
    minimumRequired: number;
    referenceSamples: number;
    recentSamples: number;
    features: Record<string, string>;
    method: string;
  };
  disclaimer: string;
};
function MonitoringPage() {
  const query = useApiData<MonitoringPayload>("/monitoring/models");
  const data = query.data;
  const error = query.error;
  return (
    <Shell title="Model monitoring" eyebrow="MLOps / Provenance & quality">
      <div className="mb-7">
        <p className="rail-label text-[var(--rust)]">Measured, never implied</p>
        <h2 className="mt-1 font-display text-3xl uppercase">
          Version registry
        </h2>
        <p className="mt-2 text-xs text-[var(--muted-ink)]">
          Held-out metrics and provenance loaded from the artifact manifest.
        </p>
      </div>
      {error ? (
        <QueryState error onRetry={query.reload} label={error} />
      ) : !data ? (
        <LoadingBlock className="h-80" />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Object.entries(data.models).map(([name, model]) => (
              <section key={name} className="bench-panel p-5">
                <p className="rail-label text-[var(--rust)]">{name}</p>
                <h3 className="mt-2 font-display text-xl uppercase">
                  {model.version}
                </h3>
                <p className="mt-1 text-[11px] text-[var(--muted-ink)]">
                  {model.algorithm.replaceAll("_", " ")}
                </p>
                {model.metrics ? (
                  <dl className="mt-5 space-y-2">
                    {Object.entries(model.metrics).map(([metric, value]) => (
                      <div
                        key={metric}
                        className="flex justify-between border-b border-[var(--line)] pb-2 text-xs"
                      >
                        <dt className="uppercase text-[var(--muted-ink)]">
                          {metric.replaceAll("_", "-")}
                        </dt>
                        <dd className="font-mono-app font-bold">
                          {typeof value === "number"
                            ? value.toFixed(4)
                            : value.flat().join(" / ")}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-5 text-xs text-[var(--muted-ink)]">
                    Unsupervised model; contamination is model configuration,
                    not labeled accuracy.
                  </p>
                )}
              </section>
            ))}
          </div>
          <section className="mt-5 grid gap-3 md:grid-cols-3">
            <MetricCard
              label="Measured inference requests"
              value={String(data.operational.measuredRequests)}
              subtext="Requests carrying persisted timing"
              icon={Activity}
            />
            <MetricCard
              label="Average inference latency"
              value={
                data.operational.averageInferenceLatencyMs === undefined ||
                data.operational.averageInferenceLatencyMs === null
                  ? "—"
                  : `${data.operational.averageInferenceLatencyMs.toFixed(2)} ms`
              }
              subtext="Measured server model execution"
              icon={Gauge}
              tone="teal"
            />
            <MetricCard
              label="Error rate"
              value={
                data.operational.errorRate === undefined ||
                data.operational.errorRate === null
                  ? "—"
                  : `${(data.operational.errorRate * 100).toFixed(2)}%`
              }
              subtext={data.operational.errorRateStatus.replaceAll("_", " ")}
              icon={AlertCircle}
              tone="gold"
            />
          </section>
          <section className="mt-5 border border-[var(--brass)]/70 bg-[var(--brass)]/10 p-5">
            <p className="text-xs font-bold text-[var(--brass)]">
              {data.dataset.provenance} DATA /{" "}
              {data.dataset.rows.toLocaleString()} ROWS /{" "}
              {data.dataset.split.replaceAll("_", " ")}
            </p>
            <p className="mt-2 text-xs leading-5 text-[var(--ink)]/75">
              {data.disclaimer} Drift: {data.drift.status.replaceAll("_", " ")}.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(data.drift.features).map(([feature, status]) => (
                <div
                  key={feature}
                  className="border border-[var(--brass)]/40 bg-[var(--canvas)]/40 p-3"
                >
                  <p className="text-[10px] font-bold">
                    {feature.replace(/([A-Z])/g, " $1")}
                  </p>
                  <p className="mt-1 font-mono-app text-[9px] text-[var(--muted-ink)]">
                    {status.replaceAll("_", " ")}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[10px] text-[var(--muted-ink)]">
              Live sample {data.drift.sampleSize} / minimum{" "}
              {data.drift.minimumRequired}; reference {data.drift.referenceSamples}
              {" / "}recent {data.drift.recentSamples}. {data.drift.method}
            </p>
          </section>
        </>
      )}
    </Shell>
  );
}

function AccessDeniedPage({ user }: { user: AuthUser }) {
  return (
    <Shell title="Access restricted" eyebrow="Merchant access / Role policy">
      <section className="bench-panel mx-auto max-w-2xl p-7 text-center sm:p-10">
        <div className="mx-auto flex h-12 w-12 items-center justify-center border border-[var(--rust)] bg-[var(--rust)]/10 text-[var(--rust)]">
          <LockKeyhole className="h-5 w-5" aria-hidden="true" />
        </div>
        <p className="rail-label mt-6 text-[var(--rust)]">
          403 / Role boundary
        </p>
        <h2 className="mt-2 font-display text-3xl uppercase">
          This workspace is outside your access
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[var(--muted-ink)]">
          {user.display_name} is signed in as {roleLabel(user.role)}.
          RazorShield protects this route and its underlying actions using
          merchant role policy.
        </p>
        <Link href="/" className="bench-button mt-6 min-h-11 justify-center">
          <LayoutDashboard className="h-4 w-4" aria-hidden="true" /> Return to
          dashboard
        </Link>
      </section>
    </Shell>
  );
}

function RoleGate({
  user,
  roles,
  children,
}: {
  user: AuthUser;
  roles: UserRole[];
  children: ReactNode;
}) {
  return canAccess(user, roles) ? children : <AccessDeniedPage user={user} />;
}

function Router({ user }: { user: AuthUser }) {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={OverviewPage} />
        <Route path="/transactions">
          <RoleGate user={user} roles={analystRoles}>
            <TransactionsPage />
          </RoleGate>
        </Route>
        <Route path="/datasets">
          <RoleGate user={user} roles={analystRoles}>
            <DatasetAnalysisPage />
          </RoleGate>
        </Route>
        <Route path="/assess">
          <RoleGate user={user} roles={analystRoles}>
            <AssessmentPage />
          </RoleGate>
        </Route>
        <Route path="/simulator">
          <RoleGate user={user} roles={investigationRoles}>
            <Shell title="Risk simulator" eyebrow="Hypothetical experiments">
              <RiskSimulator request={authenticatedRequest} />
            </Shell>
          </RoleGate>
        </Route>
        <Route path="/operations">
          <RoleGate user={user} roles={analyticsRoles}>
            <Shell
              title="Risk operations"
              eyebrow="Merchant risk command center"
            >
              <OperationsConsole
                request={authenticatedRequest}
                isAdmin={user.role === "ADMIN"}
                mayInvestigate={investigationRoles.includes(user.role)}
              />
            </Shell>
          </RoleGate>
        </Route>
        <Route path="/investigations">
          <RoleGate user={user} roles={investigationRoles}>
            <InvestigationsPage />
          </RoleGate>
        </Route>
        <Route path="/investigations/:id">
          <RoleGate user={user} roles={investigationRoles}>
            <InvestigationsPage />
          </RoleGate>
        </Route>
        <Route path="/reviews">
          <RoleGate user={user} roles={investigationRoles}>
            <ReviewQueuePage />
          </RoleGate>
        </Route>
        <Route path="/fraud-intelligence">
          <RoleGate user={user} roles={analystRoles}>
            <FraudIntelligencePage />
          </RoleGate>
        </Route>
        <Route path="/network">
          <RoleGate user={user} roles={analystRoles}>
            <NetworkPage />
          </RoleGate>
        </Route>
        <Route path="/entities/customers/:id">
          <RoleGate user={user} roles={investigationRoles}>
            <Customer360Page />
          </RoleGate>
        </Route>
        <Route path="/chargebacks">
          <RoleGate user={user} roles={analystRoles}>
            <SupportingView mode="chargebacks" />
          </RoleGate>
        </Route>
        <Route path="/returns">
          <RoleGate user={user} roles={analystRoles}>
            <ReturnRiskPage />
          </RoleGate>
        </Route>
        <Route path="/audit">
          <RoleGate user={user} roles={investigationRoles}>
            <AuditPage />
          </RoleGate>
        </Route>
        <Route path="/evaluation">
          <RoleGate user={user} roles={analyticsRoles}>
            <EvaluationPage />
          </RoleGate>
        </Route>
        <Route path="/analytics">
          <RoleGate user={user} roles={analyticsRoles}>
            <AnalyticsPage />
          </RoleGate>
        </Route>
        <Route path="/monitoring">
          <RoleGate user={user} roles={analyticsRoles}>
            <MonitoringPage />
          </RoleGate>
        </Route>
        <Route path="/settings">
          <RoleGate user={user} roles={["ADMIN"]}>
            <SettingsPage />
          </RoleGate>
        </Route>
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function App() {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      return JSON.parse(
        sessionStorage.getItem("razorshield_user") ?? "null",
      ) as AuthUser | null;
    } catch {
      return null;
    }
  });
  const [sessionMessage, setSessionMessage] = useState("");
  useEffect(() => {
    const handleSessionExpired = () => {
      queryClient.clear();
      setSessionMessage("Your session expired. Sign in again to continue.");
      setUser(null);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () =>
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, []);
  useEffect(() => {
    if (!user) return;
    const refresh = () => {
      void queryClient.invalidateQueries({ refetchType: "active" });
      announceLiveDataRefresh();
    };
    const interval = window.setInterval(refresh, LIVE_REFRESH_INTERVAL_MS);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [user]);
  if (!user || !sessionStorage.getItem("razorshield_access_token"))
    return (
      <AuthScreen
        onAuthenticated={(authenticatedUser) => {
          window.history.replaceState(null, "", "/");
          clearSessionNotice();
          setSessionMessage("");
          setUser(authenticatedUser);
        }}
        initialMessage={sessionMessage || getSessionNotice()}
      />
    );
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router user={user} />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
export default App;
