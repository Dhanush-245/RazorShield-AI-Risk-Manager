import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  Check,
  ChevronRight,
  CircleDot,
  Coins,
  Command,
  Database,
  ExternalLink,
  FileSearch,
  Fingerprint,
  Flag,
  Gauge,
  History,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  Network,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import {
  getGetInvestigationQueryKey,
  getGetRiskOverviewQueryKey,
  getGetRiskNetworkQueryKey,
  getGetRiskTransactionQueryKey,
  getListAuditEventsQueryKey,
  getListRiskTransactionsQueryKey,
  useDecideReview,
  useGetInvestigation,
  useGetRiskNetwork,
  useGetRiskOverview,
  useGetRiskTransaction,
  useListAuditEvents,
  useListRiskTransactions,
} from '@workspace/api-client-react';
import type { AuditEvent, Investigation, RiskNetwork, RiskOverview, RiskTransaction } from '@workspace/api-client-react';
import { Link, Route, Switch, useLocation, useParams, Router as WouterRouter } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();

type ReviewDecision = 'approve' | 'reject' | 'escalate' | 'request_evidence';

const navItems = [
  { href: '/', label: 'Risk posture', icon: LayoutDashboard, exact: true },
  { href: '/investigations', label: 'Investigations', icon: FileSearch },
  { href: '/network', label: 'Risk network', icon: Network },
  { href: '/chargebacks', label: 'Chargebacks', icon: ShieldAlert },
  { href: '/returns', label: 'Returns', icon: ArrowDownRight },
];

const secondaryNav = [
  { href: '/audit', label: 'Audit trail', icon: History },
  { href: '/evaluation', label: 'Evaluation', icon: Gauge },
];

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function formatMoney(value: number | undefined, currency = 'USD') {
  if (value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
}

function formatCompact(value: number | undefined) {
  if (value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function formatTime(value?: string) {
  if (!value) return 'Unknown time';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function formatDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function scoreValue(value: number | undefined) {
  if (value === undefined || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value <= 1 ? value * 100 : value));
}

function scoreLabel(value: number | undefined) {
  const normalized = scoreValue(value);
  return `${normalized.toFixed(normalized % 1 ? 1 : 0)}`;
}

function riskTone(level?: string, score?: number) {
  const value = (level ?? '').toLowerCase();
  if (value.includes('high') || value.includes('critical') || scoreValue(score) >= 75) return 'high';
  if (value.includes('medium') || value.includes('review') || scoreValue(score) >= 45) return 'medium';
  return 'low';
}

function RiskBadge({ level, score }: { level?: string; score?: number }) {
  const tone = riskTone(level, score);
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[.13em]',
      tone === 'high' && 'border-red-300/70 bg-red-50 text-red-700',
      tone === 'medium' && 'border-amber-300/70 bg-amber-50 text-amber-700',
      tone === 'low' && 'border-teal-300/70 bg-teal-50 text-teal-700')}>
      <span className={cn('h-1.5 w-1.5 rounded-full', tone === 'high' ? 'bg-red-500' : tone === 'medium' ? 'bg-amber-500' : 'bg-teal-500')} />
      {level || tone}
    </span>
  );
}

function LoadingBlock({ className = '' }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-slate-200/80', className)} />;
}

function QueryState({ error, onRetry, label = 'Unable to load this signal' }: { error?: boolean; onRetry: () => void; label?: string }) {
  if (!error) return null;
  return (
    <div className="flex min-h-36 items-center justify-center rounded-lg border border-red-200 bg-red-50/60 p-6 text-center">
      <div>
        <AlertCircle className="mx-auto mb-2 h-5 w-5 text-red-600" />
        <p className="text-sm font-semibold text-red-900">{label}</p>
        <p className="mt-1 text-xs text-red-700/80">The decision surface is still safe. Try the request again.</p>
        <button data-testid="button-retry-query" onClick={onRetry} className="mt-3 inline-flex items-center gap-2 rounded-md border border-red-200 bg-card px-3 py-2 text-xs font-bold text-red-800 hover:bg-red-100">
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </button>
      </div>
    </div>
  );
}

function EmptyState({ title, body, icon: Icon = Database }: { title: string; body: string; icon?: typeof Database }) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 p-8 text-center">
      <div className="mb-3 rounded-full border border-border bg-secondary p-3 text-muted-foreground"><Icon className="h-5 w-5" /></div>
      <p className="text-sm font-bold text-foreground">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{body}</p>
    </div>
  );
}

function Header({ title, eyebrow, onMenu }: { title: string; eyebrow: string; onMenu: () => void }) {
  const [, setLocation] = useLocation();
  return (
    <header className="flex min-h-[78px] items-center justify-between gap-4 border-b border-border bg-card/75 px-4 py-4 backdrop-blur-sm md:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <button data-testid="button-open-navigation" onClick={onMenu} className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground md:hidden"><Menu className="h-5 w-5" /></button>
        <div className="min-w-0">
          <p className="font-mono-app text-[10px] font-bold uppercase tracking-[.18em] text-muted-foreground">{eyebrow}</p>
          <h1 className="truncate text-xl font-bold tracking-[-.03em] text-foreground md:text-2xl">{title}</h1>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="hidden items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground lg:flex">
          <Command className="h-3.5 w-3.5" /><span>Quick find</span><span className="font-mono-app rounded border border-border px-1 text-[9px]">⌘ K</span>
        </div>
        <button data-testid="button-command-search" onClick={() => setLocation('/investigations')} className="rounded-md border border-border bg-background p-2 text-muted-foreground hover:border-primary/40 hover:text-primary lg:hidden"><Search className="h-4 w-4" /></button>
        <div className="hidden h-8 w-px bg-border sm:block" />
        <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">AR</span>
          <span className="hidden text-xs font-semibold text-foreground sm:inline">A. Rivera</span>
        </div>
      </div>
    </header>
  );
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [location] = useLocation();
  return (
    <>
      <div className={cn('fixed inset-0 z-30 bg-slate-950/40 backdrop-blur-sm md:hidden', !open && 'hidden')} onClick={onClose} />
      <aside className={cn('fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-200 md:relative md:translate-x-0', open ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex h-[78px] items-center justify-between border-b border-sidebar-border px-5">
          <Link href="/" data-testid="link-brand-home" className="flex items-center gap-3" onClick={onClose}>
            <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-[0_0_0_4px_hsl(43_96%_58%/.12)]">
              <Shield className="h-5 w-5" strokeWidth={2.5} />
              <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-teal-400" />
            </div>
            <div><p className="text-[15px] font-bold tracking-[-.03em] text-white">RazorShield</p><p className="font-mono-app text-[9px] uppercase tracking-[.18em] text-sidebar-foreground/55">Risk intelligence</p></div>
          </Link>
          <button data-testid="button-close-navigation" onClick={onClose} className="rounded-md p-1.5 text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-white md:hidden"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-3 pt-7">
          <p className="px-3 pb-2 font-mono-app text-[9px] font-bold uppercase tracking-[.2em] text-sidebar-foreground/40">Command center</p>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const active = item.exact ? location === item.href : location.startsWith(item.href);
              const Icon = item.icon;
              return <Link key={item.href} href={item.href} onClick={onClose} data-testid={`link-nav-${item.label.toLowerCase().replaceAll(' ', '-')}`} className={cn('group flex items-center justify-between rounded-md px-3 py-2.5 text-sm font-semibold', active ? 'bg-sidebar-accent text-white' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground')}>
                <span className="flex items-center gap-3"><Icon className={cn('h-4 w-4', active ? 'text-sidebar-primary' : 'text-sidebar-foreground/45 group-hover:text-sidebar-foreground')} />{item.label}</span>
                {item.label === 'Investigations' && <span className="rounded bg-sidebar-primary/15 px-1.5 py-0.5 font-mono-app text-[9px] text-sidebar-primary">LIVE</span>}
              </Link>;
            })}
          </nav>
          <p className="px-3 pb-2 pt-8 font-mono-app text-[9px] font-bold uppercase tracking-[.2em] text-sidebar-foreground/40">Governance</p>
          <nav className="space-y-1">
            {secondaryNav.map((item) => {
              const active = location.startsWith(item.href);
              const Icon = item.icon;
              return <Link key={item.href} href={item.href} onClick={onClose} data-testid={`link-nav-${item.label.toLowerCase().replaceAll(' ', '-')}`} className={cn('flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold', active ? 'bg-sidebar-accent text-white' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground')}>
                <Icon className={cn('h-4 w-4', active ? 'text-sidebar-primary' : 'text-sidebar-foreground/45')} />{item.label}
              </Link>;
            })}
          </nav>
        </div>
        <div className="mt-auto p-4">
          <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/60 p-3">
            <div className="mb-2 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-teal-400 shadow-[0_0_0_3px_hsl(164_42%_42%/.15)]" /><span className="font-mono-app text-[9px] font-bold uppercase tracking-[.16em] text-teal-300">Systems nominal</span></div>
            <p className="text-[11px] leading-4 text-sidebar-foreground/55">All scoring pipelines reporting within expected latency.</p>
            <div className="mt-3 flex items-center justify-between border-t border-sidebar-border pt-2 font-mono-app text-[9px] text-sidebar-foreground/40"><span>MODEL v3.8.2</span><LockKeyhole className="h-3 w-3" /></div>
          </div>
        </div>
      </aside>
    </>
  );
}

function Shell({ children, title, eyebrow }: { children: ReactNode; title: string; eyebrow: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return <div className="noise-overlay risk-shell flex min-h-[100dvh] text-foreground">
    <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
    <div className="min-w-0 flex-1"><Header title={title} eyebrow={eyebrow} onMenu={() => setMenuOpen(true)} /><main className="mx-auto max-w-[1600px] p-4 md:p-8">{children}</main></div>
  </div>;
}

function SectionHeading({ eyebrow, title, detail, action }: { eyebrow?: string; title: string; detail?: string; action?: ReactNode }) {
  return <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div>{eyebrow && <p className="font-mono-app text-[10px] font-bold uppercase tracking-[.18em] text-primary">{eyebrow}</p>}<h2 className="mt-1 text-lg font-bold tracking-[-.025em] text-foreground">{title}</h2>{detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}</div>{action}</div>;
}

function MetricCard({ label, value, subtext, icon: Icon, tone = 'neutral', trend }: { label: string; value: string; subtext: string; icon: typeof Activity; tone?: 'neutral' | 'danger' | 'gold' | 'teal'; trend?: 'up' | 'down' }) {
  return <div className="group rounded-lg border border-border bg-card p-4 shadow-[0_1px_2px_hsl(216_35%_16%/.04)] transition-transform hover:-translate-y-0.5">
    <div className="flex items-start justify-between"><span className={cn('flex h-8 w-8 items-center justify-center rounded-md', tone === 'danger' ? 'bg-red-100 text-red-700' : tone === 'gold' ? 'bg-amber-100 text-amber-700' : tone === 'teal' ? 'bg-teal-100 text-teal-700' : 'bg-secondary text-muted-foreground')}><Icon className="h-4 w-4" /></span>{trend && <span className={cn('flex items-center gap-0.5 text-[10px] font-bold', trend === 'up' ? 'text-red-600' : 'text-teal-700')}>{trend === 'up' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}7d</span>}</div>
    <p className="mt-4 font-mono-app text-2xl font-bold tracking-[-.07em] text-foreground">{value}</p><p className="mt-1 text-xs font-semibold text-foreground">{label}</p><p className="mt-1 text-[11px] text-muted-foreground">{subtext}</p>
  </div>;
}

function Sparkline({ trend }: { trend: Array<{ label: string; risk: number; volume: number }> }) {
  const values = trend.length ? trend.map((point) => point.risk) : [28, 34, 31, 40, 37, 43, 40];
  const max = Math.max(...values, 1); const min = Math.min(...values, 0); const span = Math.max(max - min, 1);
  const points = values.map((value, index) => `${(index / Math.max(values.length - 1, 1)) * 100},${94 - ((value - min) / span) * 70}`).join(' ');
  return <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full" aria-label="Risk trend chart"><defs><linearGradient id="riskFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#f4c84e" stopOpacity=".32" /><stop offset="1" stopColor="#f4c84e" stopOpacity="0" /></linearGradient></defs><polyline points={`0,100 ${points} 100,100`} fill="url(#riskFill)" stroke="none" /><polyline points={points} fill="none" stroke="#f4c84e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /></svg>;
}

function TransactionRow({ transaction, selected, onSelect }: { transaction: RiskTransaction; selected?: boolean; onSelect: () => void }) {
  return <button data-testid={`button-transaction-${transaction.transactionId}`} onClick={onSelect} className={cn('group w-full border-b border-border/80 px-4 py-3 text-left last:border-0 hover:bg-secondary/50', selected && 'bg-amber-50/70 shadow-[inset_3px_0_0_hsl(43_96%_58%)]')}>
    <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><span className="font-mono-app text-xs font-bold text-foreground">{transaction.transactionId}</span><RiskBadge level={transaction.riskLevel} score={transaction.riskScore} /></div><span className="font-mono-app text-xs font-bold text-foreground">{formatMoney(transaction.amount, transaction.currency)}</span></div>
    <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-muted-foreground"><span className="truncate">{transaction.customerId} <span className="px-1 text-border">/</span> {transaction.merchantId}</span><span>{formatTime(transaction.timestamp)}</span></div>
  </button>;
}

function OverviewPage() {
  const [, setLocation] = useLocation();
  const overviewQuery = useGetRiskOverview();
  const transactionQuery = useListRiskTransactions();
  const overview = overviewQuery.data as RiskOverview | undefined;
  const transactions = useMemo(() => transactionQuery.data ?? [], [transactionQuery.data]);
  const trend = overview?.trend ?? [];
  return <Shell title="Risk posture" eyebrow="Overview / Live posture">
    <div className="rs-reveal mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><p className="font-mono-app text-[10px] uppercase tracking-[.2em] text-muted-foreground">Wednesday, 23 October 2024</p><h2 className="mt-2 text-[28px] font-bold tracking-[-.055em] text-foreground md:text-4xl">Know the signal.<br /><span className="text-primary">Own the decision.</span></h2></div>
      <button data-testid="button-refresh-overview" onClick={() => { void overviewQuery.refetch(); void transactionQuery.refetch(); }} className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-bold text-foreground hover:border-primary/40 hover:bg-secondary"><RefreshCw className={cn('h-3.5 w-3.5', overviewQuery.isFetching && 'animate-spin')} /> Refresh posture</button>
    </div>
    <QueryState error={overviewQuery.isError} onRetry={() => void overviewQuery.refetch()} />
    {overviewQuery.isLoading ? <div className="grid gap-4 lg:grid-cols-[1.35fr_repeat(4,1fr)]"><LoadingBlock className="h-44 lg:row-span-2" />{[1, 2, 3, 4].map((item) => <LoadingBlock key={item} className="h-44" />)}</div> : overview && <div className="grid gap-4 lg:grid-cols-[1.35fr_repeat(4,1fr)]">
      <div className="relative overflow-hidden rounded-lg bg-primary p-5 text-primary-foreground shadow-[0_14px_28px_hsl(220_46%_26%/.18)] lg:row-span-2">
        <div className="absolute -right-10 -top-16 h-48 w-48 rounded-full border-[24px] border-primary-foreground/5" /><div className="absolute -right-20 -top-6 h-64 w-64 rounded-full border border-primary-foreground/5" />
        <div className="relative flex h-full flex-col justify-between"><div><div className="flex items-center justify-between"><p className="font-mono-app text-[10px] font-bold uppercase tracking-[.18em] text-primary-foreground/60">Current risk posture</p><span className="flex items-center gap-1.5 rounded-full bg-teal-400/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-teal-200"><span className="h-1.5 w-1.5 rounded-full bg-teal-300" />{overview.spikeStatus || 'Nominal'}</span></div><div className="mt-7 flex items-end gap-2"><span className="font-mono-app text-6xl font-bold tracking-[-.1em] text-sidebar-primary">{scoreLabel(overview.averageRiskScore)}</span><span className="mb-2 font-mono-app text-sm text-primary-foreground/55">/ 100</span></div><p className="mt-1 text-sm font-semibold text-primary-foreground/75">Average scored risk</p></div><div className="mt-10 border-t border-primary-foreground/10 pt-4"><div className="flex items-center justify-between text-[11px]"><span className="text-primary-foreground/55">Fraud rate</span><span className="font-mono-app font-bold text-sidebar-primary">{scoreValue(overview.fraudRate).toFixed(1)}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary-foreground/10"><div className="h-full rounded-full bg-sidebar-primary" style={{ width: `${Math.min(scoreValue(overview.fraudRate) * 4, 100)}%` }} /></div></div></div>
      </div>
      <MetricCard label="High-risk events" value={formatCompact(overview.highRisk)} subtext="Require analyst review" icon={ShieldAlert} tone="danger" trend="up" />
      <MetricCard label="Fraud detected" value={formatCompact(overview.fraudDetected)} subtext="Confirmed in current window" icon={Fingerprint} tone="gold" />
      <MetricCard label="Loss prevented" value={formatMoney(overview.preventedLoss)} subtext="Defensive actions attributed" icon={Coins} tone="teal" trend="down" />
      <MetricCard label="Active investigations" value={formatCompact(overview.activeInvestigations)} subtext="Cases waiting for a decision" icon={FileSearch} />
    </div>}
    <div className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_1fr]">
      <section className="rs-reveal rs-reveal-1 rounded-lg border border-border bg-card p-5">
        <SectionHeading eyebrow="Signal over time" title="Risk intensity" detail="Seven-day movement across scored activity" action={<span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-teal-700"><ArrowDownRight className="h-3 w-3" /> 4.8% vs prior window</span>} />
        <div className="relative h-56 overflow-hidden rounded-md border border-border/70 bg-background hairline-grid"><div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border" /><div className="absolute inset-x-0 bottom-4 top-4"><Sparkline trend={trend} /></div><div className="absolute inset-x-4 bottom-2 flex justify-between font-mono-app text-[9px] text-muted-foreground">{(trend.length ? trend : [{ label: 'Mon' }, { label: 'Tue' }, { label: 'Wed' }, { label: 'Thu' }, { label: 'Fri' }, { label: 'Sat' }, { label: 'Sun' }]).map((point, index) => <span key={`${point.label}-${index}`}>{point.label}</span>)}</div></div>
      </section>
      <section className="rs-reveal rs-reveal-2 rounded-lg border border-border bg-card p-5">
        <SectionHeading eyebrow="Model telemetry" title="Signal composition" detail="What is driving current risk scores" />
        <div className="space-y-4">{[['Behavioral pattern', 72, 'teal'], ['Velocity pressure', 51, 'amber'], ['Graph proximity', 38, 'navy'], ['Anomaly signature', 29, 'red']].map(([label, value, tone]) => <div key={label as string}><div className="mb-1.5 flex items-center justify-between text-xs"><span className="font-semibold">{label}</span><span className="font-mono-app text-muted-foreground">{value}%</span></div><div className="h-2 rounded-full bg-secondary"><div className={cn('h-full rounded-full', tone === 'teal' ? 'bg-teal-500' : tone === 'amber' ? 'bg-amber-400' : tone === 'red' ? 'bg-red-500' : 'bg-primary')} style={{ width: `${value}%` }} /></div></div>)}</div>
        <div className="mt-6 flex items-center gap-2 border-t border-border pt-4 text-[11px] text-muted-foreground"><Sparkles className="h-3.5 w-3.5 text-primary" /> Explainability coverage <span className="ml-auto font-mono-app font-bold text-foreground">94.2%</span></div>
      </section>
    </div>
    <section className="rs-reveal rs-reveal-3 mt-6 rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5"><div><p className="font-mono-app text-[10px] font-bold uppercase tracking-[.18em] text-primary">Live queue</p><h2 className="mt-1 text-lg font-bold tracking-[-.025em]">Recent activity</h2></div><Link href="/investigations" data-testid="link-view-all-investigations" className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:text-primary/70">View investigation queue <ChevronRight className="h-3.5 w-3.5" /></Link></div>
      {transactionQuery.isLoading ? <div className="space-y-1 p-4">{[1, 2, 3].map((item) => <LoadingBlock key={item} className="h-14" />)}</div> : transactionQuery.isError ? <div className="p-4"><QueryState error onRetry={() => void transactionQuery.refetch()} /></div> : transactions.length ? <div>{transactions.slice(0, 5).map((transaction) => <TransactionRow key={transaction.transactionId} transaction={transaction} onSelect={() => setLocation(`/investigations?transaction=${transaction.transactionId}`)} />)}</div> : <div className="p-4"><EmptyState title="No scored activity yet" body="When transactions enter the risk engine, the latest events will appear here." /></div>}
    </section>
  </Shell>;
}

function InvestigationDetail({ transactionId }: { transactionId?: string }) {
  const queryClient = useQueryClient();
  const transactionQuery = useGetRiskTransaction(transactionId ?? '', { query: { enabled: Boolean(transactionId), queryKey: getGetRiskTransactionQueryKey(transactionId ?? '') } });
  const investigationQuery = useGetInvestigation(transactionId ?? '', { query: { enabled: Boolean(transactionId), queryKey: getGetInvestigationQueryKey(transactionId ?? '') } });
  const review = useDecideReview();
  const [note, setNote] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string }>();
  const investigation = investigationQuery.data as Investigation | undefined;
  const transaction = (investigation?.transaction ?? transactionQuery.data) as RiskTransaction | undefined;
  const submit = (decision: ReviewDecision) => {
    if (!transactionId) return;
    setFeedback(undefined);
    review.mutate({ caseId: transactionId, data: { decision, note: note.trim() || undefined } }, {
      onSuccess: (event) => {
        setFeedback({ type: 'success', text: `${decision.replace('_', ' ')} recorded as ${event.decisionVersion}.` });
        void queryClient.invalidateQueries({ queryKey: getListAuditEventsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getListRiskTransactionsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetRiskOverviewQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetRiskTransactionQueryKey(transactionId) });
      },
      onError: () => setFeedback({ type: 'error', text: 'Decision could not be recorded. No case state was changed.' }),
    });
  };
  if (!transactionId) return <EmptyState title="Select an investigation" body="Choose a transaction from the queue to inspect its evidence, uncertainty, and recommended action." icon={FileSearch} />;
  if (transactionQuery.isLoading || investigationQuery.isLoading) return <div className="space-y-4"><LoadingBlock className="h-36" /><LoadingBlock className="h-56" /><LoadingBlock className="h-44" /></div>;
  if (transactionQuery.isError || investigationQuery.isError) return <QueryState error onRetry={() => { void transactionQuery.refetch(); void investigationQuery.refetch(); }} label="Investigation evidence unavailable" />;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><span className="font-mono-app text-xs font-bold text-primary">{transaction?.transactionId}</span><RiskBadge level={transaction?.riskLevel} score={transaction?.riskScore} /></div><h2 className="mt-2 text-2xl font-bold tracking-[-.04em]">Evidence review</h2><p className="mt-1 text-xs text-muted-foreground">{transaction?.customerId} · {transaction?.merchantId} · {formatTime(transaction?.timestamp)}</p></div><div className="text-right"><p className="font-mono-app text-3xl font-bold tracking-[-.08em] text-foreground">{scoreLabel(transaction?.riskScore)}</p><p className="font-mono-app text-[9px] uppercase tracking-[.16em] text-muted-foreground">Risk score / 100</p></div></div>
    {feedback && <div data-testid="status-review-feedback" className={cn('flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold', feedback.type === 'success' ? 'border-teal-200 bg-teal-50 text-teal-800' : 'border-red-200 bg-red-50 text-red-800')}><span className="h-1.5 w-1.5 rounded-full bg-current" />{feedback.text}</div>}
    <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
      <div className="space-y-5">
        <section className="rounded-lg border border-border bg-card p-5"><SectionHeading eyebrow="Model readout" title="What we know so far" detail="A plain-language account of the scored event" /><p className="text-[14px] leading-7 text-foreground/80">{investigation?.summary || 'The model has not supplied a written summary for this event.'}</p><div className="mt-5 grid gap-3 sm:grid-cols-3"><ScoreMeter label="Fraud probability" value={transaction?.fraudProbability} /><ScoreMeter label="Anomaly score" value={transaction?.anomalyScore} /><ScoreMeter label="Graph score" value={transaction?.graphScore} /></div></section>
        <section className="rounded-lg border border-border bg-card p-5"><SectionHeading eyebrow="Signal ledger" title="Facts vs. inference" /><div className="grid gap-5 md:grid-cols-2"><BulletList title="Observed facts" items={investigation?.facts ?? transaction?.factors ?? []} tone="teal" /><BulletList title="Model inferences" items={investigation?.inferences ?? []} tone="amber" /></div></section>
        <section className="rounded-lg border border-border bg-card p-5"><SectionHeading eyebrow="Source material" title="Evidence attached" detail="Inspect the source before taking action" />{investigation?.evidence?.length ? <div className="divide-y divide-border">{investigation.evidence.map((item, index) => <div key={`${item.label}-${index}`} data-testid={`evidence-item-${index}`} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div className="flex items-center gap-3"><div className="rounded-md bg-secondary p-2 text-muted-foreground"><Database className="h-4 w-4" /></div><div><p className="text-xs font-bold">{item.label}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{item.source}</p></div></div><span className="font-mono-app text-[10px] text-foreground">{item.value}</span></div>)}</div> : <EmptyState title="No evidence attached" body="Request supporting evidence before finalizing this case." />}</section>
      </div>
      <div className="space-y-5">
        <section className="rounded-lg border border-primary/30 bg-primary p-5 text-primary-foreground shadow-[0_14px_28px_hsl(220_46%_26%/.12)]"><div className="flex items-center justify-between"><p className="font-mono-app text-[10px] font-bold uppercase tracking-[.18em] text-sidebar-primary">Recommended action</p><Target className="h-4 w-4 text-sidebar-primary" /></div><p className="mt-4 text-xl font-bold tracking-[-.035em]">{investigation?.recommendation || 'Review required'}</p><div className="mt-6 border-t border-primary-foreground/10 pt-4"><div className="flex justify-between text-[11px]"><span className="text-primary-foreground/60">Model confidence</span><span className="font-mono-app font-bold text-sidebar-primary">{scoreValue(investigation?.confidence).toFixed(1)}%</span></div><div className="mt-2 h-1.5 rounded-full bg-primary-foreground/10"><div className="h-full rounded-full bg-sidebar-primary" style={{ width: `${scoreValue(investigation?.confidence)}%` }} /></div></div></section>
        {investigation?.missingInformation?.length ? <section className="rounded-lg border border-amber-300/60 bg-amber-50 p-5"><div className="flex items-center gap-2 text-amber-800"><AlertCircle className="h-4 w-4" /><p className="font-mono-app text-[10px] font-bold uppercase tracking-[.16em]">Uncertainty to resolve</p></div><ul className="mt-3 space-y-2">{investigation.missingInformation.map((item, index) => <li key={`${item}-${index}`} className="flex gap-2 text-xs leading-5 text-amber-900"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-amber-600" />{item}</li>)}</ul></section> : null}
        <section className="rounded-lg border border-border bg-card p-5"><SectionHeading eyebrow="Human control" title="Record a decision" detail="Your note becomes part of the case audit trail." /><textarea data-testid="input-review-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add context for the next analyst…" className="min-h-20 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-xs outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring/20" /><div className="mt-4 grid grid-cols-2 gap-2"><DecisionButton label="Approve" icon={Check} onClick={() => submit('approve')} disabled={review.isPending} kind="approve" /><DecisionButton label="Reject" icon={X} onClick={() => submit('reject')} disabled={review.isPending} kind="reject" /><DecisionButton label="Escalate" icon={Flag} onClick={() => submit('escalate')} disabled={review.isPending} kind="escalate" /><DecisionButton label="Request evidence" icon={FileSearch} onClick={() => submit('request_evidence')} disabled={review.isPending} kind="evidence" /></div>{review.isPending && <p className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground"><RefreshCw className="h-3 w-3 animate-spin" /> Recording your decision…</p>}</section>
      </div>
    </div>
  </div>;
}

function ScoreMeter({ label, value }: { label: string; value?: number }) {
  const score = scoreValue(value); return <div className="rounded-md border border-border bg-background p-3"><div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><span>{label}</span><span className="font-mono-app text-foreground">{score.toFixed(0)}</span></div><div className="mt-2 h-1.5 rounded-full bg-secondary"><div className={cn('h-full rounded-full', score >= 70 ? 'bg-red-500' : score >= 45 ? 'bg-amber-400' : 'bg-teal-500')} style={{ width: `${score}%` }} /></div></div>;
}

function BulletList({ title, items, tone }: { title: string; items: string[]; tone: 'teal' | 'amber' }) {
  return <div><p className="mb-3 flex items-center gap-2 text-xs font-bold"><span className={cn('h-1.5 w-1.5 rounded-full', tone === 'teal' ? 'bg-teal-500' : 'bg-amber-500')} />{title}</p>{items.length ? <ul className="space-y-2">{items.map((item, index) => <li key={`${item}-${index}`} className="flex gap-2 text-xs leading-5 text-muted-foreground"><span className="font-mono-app text-[10px] text-border">{String(index + 1).padStart(2, '0')}</span>{item}</li>)}</ul> : <p className="text-xs text-muted-foreground">No signals recorded.</p>}</div>;
}

function DecisionButton({ label, icon: Icon, onClick, disabled, kind }: { label: string; icon: typeof Check; onClick: () => void; disabled?: boolean; kind: 'approve' | 'reject' | 'escalate' | 'evidence' }) {
  return <button data-testid={`button-decision-${kind}`} onClick={onClick} disabled={disabled} className={cn('flex items-center justify-center gap-1.5 rounded-md border px-2 py-2.5 text-[10px] font-bold uppercase tracking-wider', kind === 'approve' ? 'border-teal-300 bg-teal-50 text-teal-800 hover:bg-teal-100' : kind === 'reject' ? 'border-red-300 bg-red-50 text-red-800 hover:bg-red-100' : kind === 'escalate' ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100' : 'border-border bg-secondary text-foreground hover:bg-secondary/70')}><Icon className="h-3.5 w-3.5" />{label}</button>;
}

function InvestigationsPage() {
  const [selectedId, setSelectedId] = useState<string>();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const transactionQuery = useListRiskTransactions();
  const params = useParams<{ id?: string }>();
  const transactions = useMemo(() => transactionQuery.data ?? [], [transactionQuery.data]);
  useEffect(() => { const queryId = new URLSearchParams(window.location.search).get('transaction'); setSelectedId(params.id || queryId || transactions[0]?.transactionId); }, [params.id, transactions]);
  const filtered = useMemo(() => transactions.filter((item) => {
    const matchesSearch = !search || [item.transactionId, item.customerId, item.merchantId].some((field) => field.toLowerCase().includes(search.toLowerCase()));
    const matchesFilter = filter === 'all' || riskTone(item.riskLevel, item.riskScore) === filter;
    return matchesSearch && matchesFilter;
  }), [transactions, search, filter]);
  return <Shell title="Investigations" eyebrow="Analyst queue / Human review">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="font-mono-app text-[10px] uppercase tracking-[.2em] text-primary">Signal to decision</p><h2 className="mt-1 text-2xl font-bold tracking-[-.04em]">Investigation queue</h2><p className="mt-1 text-xs text-muted-foreground">Review the highest-consequence events first. Every action is traceable.</p></div><div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs"><span className="h-1.5 w-1.5 rounded-full bg-teal-500" /><span className="font-mono-app font-bold">{transactions.length}</span><span className="text-muted-foreground">scored events</span></div></div>
    {transactionQuery.isError ? <QueryState error onRetry={() => void transactionQuery.refetch()} /> : <div className="grid min-h-[680px] gap-5 xl:grid-cols-[380px_1fr]">
      <section className="overflow-hidden rounded-lg border border-border bg-card"><div className="border-b border-border p-4"><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input data-testid="input-investigation-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search transaction, customer…" className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-xs outline-none focus:border-primary" /></div><div className="mt-3 flex items-center gap-1.5">{['all', 'high', 'medium', 'low'].map((item) => <button key={item} data-testid={`button-filter-${item}`} onClick={() => setFilter(item)} className={cn('rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider', filter === item ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground')}>{item}</button>)}</div></div><div className="max-h-[590px] overflow-y-auto">{transactionQuery.isLoading ? <div className="space-y-2 p-3">{[1, 2, 3, 4].map((item) => <LoadingBlock key={item} className="h-16" />)}</div> : filtered.length ? filtered.map((transaction) => <TransactionRow key={transaction.transactionId} transaction={transaction} selected={selectedId === transaction.transactionId} onSelect={() => setSelectedId(transaction.transactionId)} />) : <div className="p-4"><EmptyState title="No matching events" body="Adjust the search or filter to widen the queue." icon={Search} /></div>}</div><div className="border-t border-border bg-background px-4 py-3 text-[10px] text-muted-foreground">Showing {filtered.length} of {transactions.length} events</div></section>
      <section><InvestigationDetail transactionId={selectedId} /></section>
    </div>}
  </Shell>;
}

function NetworkPage() {
  const query = useGetRiskNetwork({ query: { queryKey: getGetRiskNetworkQueryKey() } });
  const network = query.data as RiskNetwork | undefined;
  const [selected, setSelected] = useState<string>();
  return <Shell title="Risk network" eyebrow="Entity relationships / Exposure">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="font-mono-app text-[10px] uppercase tracking-[.2em] text-primary">Connected risk</p><h2 className="mt-1 text-2xl font-bold tracking-[-.04em]">Suspicious entity network</h2><p className="mt-1 text-xs text-muted-foreground">See the relationships that a single event cannot explain.</p></div>{network && <div className="flex items-center gap-5 text-xs"><div><span className="font-mono-app font-bold">{network.nodes.length}</span><span className="ml-1.5 text-muted-foreground">entities</span></div><div><span className="font-mono-app font-bold">{network.clusterCount}</span><span className="ml-1.5 text-muted-foreground">clusters</span></div></div>}</div>
    <QueryState error={query.isError} onRetry={() => void query.refetch()} />
    {query.isLoading ? <div className="grid gap-5 lg:grid-cols-[1fr_300px]"><LoadingBlock className="h-[600px]" /><LoadingBlock className="h-[600px]" /></div> : network ? <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <section className="relative min-h-[600px] overflow-hidden rounded-lg border border-border bg-card hairline-grid"><div className="absolute left-5 top-5 z-10 rounded-md border border-border bg-card/85 px-3 py-2 backdrop-blur-sm"><p className="font-mono-app text-[9px] uppercase tracking-[.16em] text-muted-foreground">Relationship map</p><p className="mt-1 text-xs font-bold">{network.links.length} active links</p></div><svg viewBox="0 0 900 600" className="absolute inset-0 h-full w-full"><g stroke="#c6cdd6" strokeWidth="1.5" strokeDasharray="4 5">{network.links.map((link, index) => { const sourceIndex = network.nodes.findIndex((node) => node.id === link.source); const targetIndex = network.nodes.findIndex((node) => node.id === link.target); const x1 = 130 + (Math.max(sourceIndex, 0) % 4) * 210; const y1 = 175 + (Math.floor(Math.max(sourceIndex, 0) / 4) % 3) * 145; const x2 = 130 + (Math.max(targetIndex, 0) % 4) * 210; const y2 = 175 + (Math.floor(Math.max(targetIndex, 0) / 4) % 3) * 145; return <line key={`${link.source}-${link.target}-${index}`} x1={x1} y1={y1} x2={x2} y2={y2} />; })}</g>{network.nodes.map((node, index) => { const x = 130 + (index % 4) * 210; const y = 175 + (Math.floor(index / 4) % 3) * 145; const tone = riskTone(undefined, node.risk); return <g key={node.id} className="cursor-pointer" onClick={() => setSelected(node.id)}><circle cx={x} cy={y} r={selected === node.id ? 31 : 26} fill={tone === 'high' ? '#fee2e2' : tone === 'medium' ? '#fef3c7' : '#ccfbf1'} stroke={tone === 'high' ? '#dc2626' : tone === 'medium' ? '#d97706' : '#0f766e'} strokeWidth={selected === node.id ? 3 : 1.5} /><circle cx={x} cy={y} r="4" fill={tone === 'high' ? '#dc2626' : tone === 'medium' ? '#d97706' : '#0f766e'} /><text x={x} y={y + 47} textAnchor="middle" className="fill-slate-700 text-[11px] font-semibold">{node.label}</text><text x={x} y={y + 61} textAnchor="middle" className="fill-slate-400 text-[9px]">{node.type} · {scoreLabel(node.risk)}</text></g>; })}</svg>{!network.nodes.length && <div className="absolute inset-0 flex items-center justify-center p-6"><EmptyState title="No connected entities" body="The graph will populate as relationship signals are scored." icon={Network} /></div>}</section>
      <section className="rounded-lg border border-border bg-card p-5"><SectionHeading eyebrow="Selected entity" title={selected ? network.nodes.find((node) => node.id === selected)?.label || 'Entity detail' : 'Inspect the graph'} detail={selected ? 'Relationship risk profile' : 'Select a node to inspect'} />{selected ? (() => { const node = network.nodes.find((item) => item.id === selected); return <div className="space-y-4"><div className="rounded-md border border-border bg-background p-4"><p className="font-mono-app text-2xl font-bold">{scoreLabel(node?.risk)}</p><p className="mt-1 text-xs text-muted-foreground">Entity risk score</p><div className="mt-3"><RiskBadge score={node?.risk} level={riskTone(undefined, node?.risk)} /></div></div><div className="space-y-3 text-xs"><div className="flex justify-between border-b border-border pb-3"><span className="text-muted-foreground">Entity type</span><span className="font-semibold">{node?.type}</span></div><div className="flex justify-between border-b border-border pb-3"><span className="text-muted-foreground">Connections</span><span className="font-mono-app font-bold">{network.links.filter((link) => link.source === selected || link.target === selected).length}</span></div><div className="flex justify-between"><span className="text-muted-foreground">Entity ID</span><span className="font-mono-app text-[10px]">{node?.id}</span></div></div><Link href="/investigations" data-testid="link-network-investigate" className="flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2.5 text-xs font-bold text-primary-foreground hover:bg-primary/90">Open investigation queue <ExternalLink className="h-3.5 w-3.5" /></Link></div>; })() : <div className="flex min-h-64 flex-col items-center justify-center text-center"><CircleDot className="h-6 w-6 text-muted-foreground" /><p className="mt-3 text-sm font-bold">One click from context</p><p className="mt-1 max-w-[210px] text-xs leading-5 text-muted-foreground">Select any entity in the map to reveal its score and connections.</p></div>}</section>
    </div> : <EmptyState title="Network is quiet" body="No suspicious relationships are available for this window." icon={Network} />}
  </Shell>;
}

function SupportingView({ mode }: { mode: 'chargebacks' | 'returns' }) {
  const transactionQuery = useListRiskTransactions();
  const transactions = useMemo(() => transactionQuery.data ?? [], [transactionQuery.data]);
  const [selectedId, setSelectedId] = useState<string>();
  const candidates = useMemo(() => transactions.filter((item) => mode === 'chargebacks' ? riskTone(item.riskLevel, item.riskScore) === 'high' : (item.factors ?? []).some((factor) => factor.toLowerCase().includes('return') || factor.toLowerCase().includes('behavior'))), [transactions, mode]);
  useEffect(() => { if (!selectedId && candidates[0]) setSelectedId(candidates[0].transactionId); }, [candidates, selectedId]);
  const selected = candidates.find((item) => item.transactionId === selectedId);
  const title = mode === 'chargebacks' ? 'Chargeback evidence' : 'Return-risk support';
  const eyebrow = mode === 'chargebacks' ? 'Dispute operations / Evidence' : 'Post-purchase / Supporting view';
  return <Shell title={mode === 'chargebacks' ? 'Chargebacks' : 'Returns'} eyebrow={eyebrow}>
    <div className="mb-6"><p className="font-mono-app text-[10px] uppercase tracking-[.2em] text-primary">{mode === 'chargebacks' ? 'Evidence review surface' : 'Behavioral risk surface'}</p><h2 className="mt-1 text-2xl font-bold tracking-[-.04em]">{title}</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{mode === 'chargebacks' ? 'Bring the transaction, model rationale, and source evidence together before a dispute response is approved.' : 'Use existing risk signals to prioritize return-related events that may need a closer human look.'}</p></div>
    {transactionQuery.isError ? <QueryState error onRetry={() => void transactionQuery.refetch()} /> : <div className="grid gap-5 lg:grid-cols-[minmax(290px,360px)_1fr]">
      <section className="overflow-hidden rounded-lg border border-border bg-card"><div className="border-b border-border p-4"><div className="flex items-center justify-between"><span className="font-mono-app text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Priority set</span><span className="font-mono-app text-sm font-bold">{candidates.length}</span></div></div>{transactionQuery.isLoading ? <div className="space-y-2 p-3">{[1, 2, 3].map((item) => <LoadingBlock key={item} className="h-16" />)}</div> : candidates.length ? candidates.map((item) => <TransactionRow key={item.transactionId} transaction={item} selected={selectedId === item.transactionId} onSelect={() => setSelectedId(item.transactionId)} />) : <div className="p-4"><EmptyState title="No candidates in this window" body="This view only surfaces existing scored transaction signals." /></div>}</section>
      <section className="rounded-lg border border-border bg-card p-5">{selected ? <SupportingDetail transaction={selected} mode={mode} /> : <EmptyState title="Nothing selected" body="Choose a transaction from the priority set to review its supporting signals." icon={FileSearch} />}</section>
    </div>}
  </Shell>;
}

function SupportingDetail({ transaction, mode }: { transaction: RiskTransaction; mode: 'chargebacks' | 'returns' }) {
  return <div><div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5"><div><div className="flex items-center gap-2"><span className="font-mono-app text-xs font-bold text-primary">{transaction.transactionId}</span><RiskBadge level={transaction.riskLevel} score={transaction.riskScore} /></div><h3 className="mt-2 text-xl font-bold tracking-[-.035em]">{mode === 'chargebacks' ? 'Dispute evidence packet' : 'Return-risk signal packet'}</h3><p className="mt-1 text-xs text-muted-foreground">{formatMoney(transaction.amount, transaction.currency)} · {formatDate(transaction.timestamp)}</p></div><Link href={`/investigations/${transaction.transactionId}`} data-testid="link-open-supporting-investigation" className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs font-bold hover:border-primary/50"><FileSearch className="h-3.5 w-3.5" /> Full investigation</Link></div><div className="mt-6 grid gap-4 md:grid-cols-2"><div className="rounded-md border border-border bg-background p-4"><p className="font-mono-app text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Transaction context</p><dl className="mt-4 space-y-3 text-xs"><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Customer</dt><dd className="font-mono-app font-bold">{transaction.customerId}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Merchant</dt><dd className="font-mono-app font-bold">{transaction.merchantId}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Decision</dt><dd className="font-semibold capitalize">{transaction.decision || 'Review'}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Status</dt><dd className="font-semibold capitalize">{transaction.status || 'Open'}</dd></div></dl></div><div className="rounded-md border border-border bg-background p-4"><p className="font-mono-app text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Supporting scores</p><div className="mt-4 space-y-3"><ScoreMeter label="Behavior" value={transaction.behaviorScore} /><ScoreMeter label="Velocity" value={transaction.velocityScore} /><ScoreMeter label="Anomaly" value={transaction.anomalyScore} /></div></div></div><div className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4"><div className="flex items-center gap-2 text-amber-900"><AlertCircle className="h-4 w-4" /><p className="text-xs font-bold">Analyst checkpoint</p></div><p className="mt-2 text-xs leading-5 text-amber-900/80">Supporting views surface risk signals; they do not replace the evidence-backed decision workflow.</p></div><div className="mt-5"><p className="font-mono-app text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Factors on record</p><div className="mt-3 flex flex-wrap gap-2">{(transaction.factors ?? []).map((factor, index) => <span key={`${factor}-${index}`} className="rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] font-semibold text-foreground">{factor}</span>)}</div></div></div>;
}

function AuditPage() {
  const query = useListAuditEvents();
  const events = useMemo(() => query.data ?? [], [query.data]);
  return <Shell title="Audit trail" eyebrow="Governance / Traceability">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="font-mono-app text-[10px] uppercase tracking-[.2em] text-primary">Accountability by default</p><h2 className="mt-1 text-2xl font-bold tracking-[-.04em]">Decisions & human actions</h2><p className="mt-1 text-xs text-muted-foreground">A durable record of what happened, who acted, and which model version was in play.</p></div><div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs"><History className="h-3.5 w-3.5 text-primary" /><span className="font-mono-app font-bold">{events.length}</span><span className="text-muted-foreground">events</span></div></div>
    {query.isError ? <QueryState error onRetry={() => void query.refetch()} /> : <section className="rounded-lg border border-border bg-card">{query.isLoading ? <div className="space-y-2 p-5">{[1, 2, 3, 4].map((item) => <LoadingBlock key={item} className="h-20" />)}</div> : events.length ? <div className="divide-y divide-border">{events.map((event) => <AuditRow key={event.id} event={event} />)}</div> : <div className="p-5"><EmptyState title="No audit events yet" body="Human decisions will appear here as analysts review cases." icon={History} /></div>}</section>}
  </Shell>;
}

function AuditRow({ event }: { event: AuditEvent }) {
  return <div data-testid={`audit-event-${event.id}`} className="grid gap-3 p-5 md:grid-cols-[130px_1fr_190px] md:items-center"><div><p className="font-mono-app text-[10px] text-muted-foreground">{formatDate(event.timestamp)}</p><p className="mt-1 font-mono-app text-[10px] text-muted-foreground">{formatTime(event.timestamp).split(', ').pop()}</p></div><div className="flex items-start gap-3"><span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary text-primary"><BadgeCheck className="h-4 w-4" /></span><div><p className="text-sm font-bold">{event.event}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{event.note || 'No additional analyst note recorded.'}</p><p className="mt-2 font-mono-app text-[10px] text-muted-foreground">CASE {event.caseId}</p></div></div><div className="flex items-center justify-between gap-3 md:justify-end"><div className="text-right"><p className="text-xs font-bold">{event.actor}</p><p className="mt-1 font-mono-app text-[9px] text-muted-foreground">MODEL {event.decisionVersion}</p></div><ChevronRight className="h-4 w-4 text-border" /></div></div>;
}

function EvaluationPage() {
  const overviewQuery = useGetRiskOverview();
  const transactionQuery = useListRiskTransactions();
  const overview = overviewQuery.data as RiskOverview | undefined;
  const transactions = useMemo(() => transactionQuery.data ?? [], [transactionQuery.data]);
  const highRisk = transactions.filter((item) => riskTone(item.riskLevel, item.riskScore) === 'high').length;
  const explainable = transactions.filter((item) => (item.factors?.length ?? 0) > 0).length;
  const explainability = transactions.length ? Math.round((explainable / transactions.length) * 100) : 0;
  return <Shell title="Evaluation" eyebrow="Model performance / Business impact">
    <div className="mb-6"><p className="font-mono-app text-[10px] uppercase tracking-[.2em] text-primary">Held-out view</p><h2 className="mt-1 text-2xl font-bold tracking-[-.04em]">Does the model earn trust?</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">A compact read on performance and operational impact from the currently available scored set.</p></div>
    <QueryState error={overviewQuery.isError || transactionQuery.isError} onRetry={() => { void overviewQuery.refetch(); void transactionQuery.refetch(); }} />
    {overviewQuery.isLoading || transactionQuery.isLoading ? <div className="grid gap-5 md:grid-cols-2"><LoadingBlock className="h-64" /><LoadingBlock className="h-64" /><LoadingBlock className="h-56 md:col-span-2" /></div> : <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3"><MetricCard label="Average risk score" value={scoreLabel(overview?.averageRiskScore)} subtext="Across the scored window" icon={Gauge} tone="gold" /><MetricCard label="High-risk capture" value={transactions.length ? `${Math.round((highRisk / transactions.length) * 100)}%` : '—'} subtext={`${highRisk} events in the current set`} icon={Target} tone="danger" /><MetricCard label="Explainability coverage" value={`${explainability}%`} subtext="Events carrying factor evidence" icon={Sparkles} tone="teal" /></div>
      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]"><section className="rounded-lg border border-border bg-card p-5"><SectionHeading eyebrow="Performance frame" title="Held-out model readout" detail="Operational proxy from live scored events" /><div className="space-y-5"><EvalBar label="Signal coverage" value={Math.min(100, overview?.transactionsAnalyzed ? (transactions.length / overview.transactionsAnalyzed) * 100 : 0)} note={`${transactions.length} events sampled`} /><EvalBar label="Fraud rate in window" value={scoreValue(overview?.fraudRate)} note={`${formatCompact(overview?.fraudDetected)} confirmed detections`} /><EvalBar label="Risk concentration" value={transactions.length ? (highRisk / transactions.length) * 100 : 0} note={`${highRisk} high-risk events`} /></div></section><section className="rounded-lg border border-border bg-primary p-5 text-primary-foreground"><div className="flex items-center justify-between"><p className="font-mono-app text-[10px] font-bold uppercase tracking-[.18em] text-sidebar-primary">Business impact</p><Coins className="h-4 w-4 text-sidebar-primary" /></div><p className="mt-7 font-mono-app text-5xl font-bold tracking-[-.1em] text-sidebar-primary">{formatMoney(overview?.preventedLoss)}</p><p className="mt-2 text-sm font-semibold text-primary-foreground/75">Prevented loss attributed to defensive action</p><div className="mt-8 grid grid-cols-2 gap-3 border-t border-primary-foreground/10 pt-4"><div><p className="font-mono-app text-xl font-bold">{formatCompact(overview?.fraudDetected)}</p><p className="mt-1 text-[10px] uppercase tracking-wider text-primary-foreground/55">Fraud detected</p></div><div><p className="font-mono-app text-xl font-bold">{formatCompact(overview?.activeInvestigations)}</p><p className="mt-1 text-[10px] uppercase tracking-wider text-primary-foreground/55">Open reviews</p></div></div></section></div>
      <section className="rounded-lg border border-amber-200 bg-amber-50 p-5"><div className="flex gap-3"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><div><p className="text-xs font-bold text-amber-900">Evaluation context</p><p className="mt-1 max-w-3xl text-xs leading-5 text-amber-900/75">The evaluation route is using the live scored set because no dedicated held-out evaluation endpoint is exposed in the current API contract. Treat these metrics as an operational snapshot, not a benchmark claim.</p></div></div></section>
    </div>}
  </Shell>;
}

function EvalBar({ label, value, note }: { label: string; value: number; note: string }) {
  return <div><div className="mb-2 flex items-end justify-between gap-3"><div><p className="text-xs font-bold">{label}</p><p className="mt-1 text-[11px] text-muted-foreground">{note}</p></div><span className="font-mono-app text-sm font-bold">{value.toFixed(1)}%</span></div><div className="h-2 rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div></div>;
}

function Router() {
  return <RoutedErrorBoundary><Switch>
    <Route path="/" component={OverviewPage} />
    <Route path="/investigations" component={InvestigationsPage} />
    <Route path="/investigations/:id" component={InvestigationsPage} />
    <Route path="/network" component={NetworkPage} />
    <Route path="/chargebacks" component={() => <SupportingView mode="chargebacks" />} />
    <Route path="/returns" component={() => <SupportingView mode="returns" />} />
    <Route path="/audit" component={AuditPage} />
    <Route path="/evaluation" component={EvaluationPage} />
    <Route component={NotFound} />
  </Switch></RoutedErrorBoundary>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;