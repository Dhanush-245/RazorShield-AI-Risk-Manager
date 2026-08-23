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
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  Sparkles,
  Target,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  getGetInvestigationQueryKey,
  getGetRiskNetworkQueryKey,
  getGetRiskOverviewQueryKey,
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
import { Link, Route, Router as WouterRouter, Switch, useLocation, useParams } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
type ReviewDecision = 'approve' | 'reject' | 'escalate' | 'request_evidence';
type Tone = 'high' | 'medium' | 'low';

const navItems: Array<{ href: string; label: string; icon: LucideIcon; exact?: boolean }> = [
  { href: '/', label: 'Risk posture', icon: LayoutDashboard, exact: true },
  { href: '/investigations', label: 'Investigations', icon: FileSearch },
  { href: '/network', label: 'Risk network', icon: Network },
  { href: '/chargebacks', label: 'Chargebacks', icon: ShieldAlert },
  { href: '/returns', label: 'Returns', icon: ArrowDownRight },
];
const secondaryNav: Array<{ href: string; label: string; icon: LucideIcon }> = [
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
  const score = scoreValue(value);
  return score.toFixed(score % 1 ? 1 : 0);
}
function riskTone(level?: string, score?: number): Tone {
  const value = (level ?? '').toLowerCase();
  if (value.includes('high') || value.includes('critical') || scoreValue(score) >= 75) return 'high';
  if (value.includes('medium') || value.includes('review') || scoreValue(score) >= 45) return 'medium';
  return 'low';
}
function toneColor(tone: Tone) {
  return tone === 'high' ? 'var(--rust)' : tone === 'medium' ? 'var(--brass)' : 'var(--teal)';
}

function RiskBadge({ level, score }: { level?: string; score?: number }) {
  const tone = riskTone(level, score);
  return (
    <span data-testid={`status-risk-${tone}`} className={cn('risk-badge', tone === 'high' && 'risk-high', tone === 'medium' && 'risk-medium', tone === 'low' && 'risk-low')}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {level || tone}
    </span>
  );
}

function LoadingBlock({ className = '' }: { className?: string }) {
  return <div className={cn('skeleton-block', className)} />;
}

function QueryState({ error, onRetry, label = 'Unable to load this signal' }: { error?: boolean; onRetry: () => void; label?: string }) {
  if (!error) return null;
  return (
    <div data-testid="status-query-error" className="bench-panel flex min-h-40 items-center justify-center p-6 text-center">
      <div>
        <AlertCircle className="mx-auto mb-2 h-5 w-5 text-[var(--rust)]" />
        <p className="text-sm font-bold text-[var(--ink)]">{label}</p>
        <p className="mt-1 text-xs text-[var(--muted-ink)]">The decision surface is safe. Try the request again.</p>
        <button data-testid="button-retry-query" onClick={onRetry} className="bench-button mt-4">
          <RefreshCw className="h-3.5 w-3.5" /> Retry request
        </button>
      </div>
    </div>
  );
}

function EmptyState({ title, body, icon: Icon = Database }: { title: string; body: string; icon?: LucideIcon }) {
  return (
    <div className="empty-state">
      <div className="mb-3 flex h-10 w-10 items-center justify-center border border-[var(--line)] bg-[var(--panel-2)] text-[var(--muted-ink)]"><Icon className="h-5 w-5" /></div>
      <p className="text-sm font-bold text-[var(--ink)]">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-5 text-[var(--muted-ink)]">{body}</p>
    </div>
  );
}

function Header({ title, eyebrow, onMenu }: { title: string; eyebrow: string; onMenu: () => void }) {
  const [, setLocation] = useLocation();
  return (
    <header className="bench-header">
      <div className="flex min-w-0 items-center">
        <button data-testid="button-open-navigation" onClick={onMenu} className="mr-3 border-r border-[var(--line)] px-4 py-5 text-[var(--muted-ink)] hover:text-[var(--rust)] md:hidden"><Menu className="h-5 w-5" /></button>
        <div className="min-w-0 px-4 py-4 md:px-7">
          <p className="font-mono-app text-[9px] font-bold uppercase tracking-[.28em] text-[var(--rust)]">{eyebrow}</p>
          <h1 className="mt-1 truncate font-display text-xl uppercase leading-none tracking-[-.02em] text-[var(--ink)] md:text-2xl">{title}</h1>
        </div>
      </div>
      <div className="flex items-center">
        <div className="hidden items-center gap-2 border-l border-[var(--line)] px-5 py-4 font-mono-app text-[9px] uppercase tracking-[.18em] text-[var(--muted-ink)] lg:flex">
          <Command className="h-3.5 w-3.5" /> Quick find <span className="border border-[var(--line)] px-1.5 py-0.5 text-[8px]">CMD K</span>
        </div>
        <button data-testid="button-command-search" onClick={() => setLocation('/investigations')} className="border-l border-[var(--line)] p-5 text-[var(--muted-ink)] hover:text-[var(--rust)] lg:hidden"><Search className="h-4 w-4" /></button>
        <div className="hidden h-8 w-px bg-[var(--line)] sm:block" />
        <div className="mr-4 flex items-center gap-2 border-l border-[var(--line)] px-4 py-3 md:mr-6">
          <span className="flex h-7 w-7 items-center justify-center bg-[var(--rust)] font-mono-app text-[10px] font-bold text-[var(--canvas)]">AR</span>
          <span className="hidden font-mono-app text-[10px] uppercase tracking-wider text-[var(--ink)] sm:inline">A. Rivera</span>
        </div>
      </div>
    </header>
  );
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [location] = useLocation();
  return (
    <>
      <div className={cn('fixed inset-0 z-30 bg-black/60 md:hidden', !open && 'hidden')} onClick={onClose} />
      <aside className={cn('bench-sidebar', open ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex h-[77px] items-center justify-between border-b border-[var(--line)] px-5">
          <Link href="/" data-testid="link-brand-home" className="flex items-center gap-3" onClick={onClose}>
            <span className="flex h-9 w-9 items-center justify-center bg-[var(--rust)] text-[var(--canvas)]"><Shield className="h-5 w-5" strokeWidth={2.5} /></span>
            <span><strong className="font-display text-[17px] uppercase tracking-tight text-[var(--ink)]">RazorShield</strong><small className="mt-0.5 block font-mono-app text-[8px] uppercase tracking-[.2em] text-[var(--muted-ink)]">Risk foundry</small></span>
          </Link>
          <button data-testid="button-close-navigation" onClick={onClose} className="text-[var(--muted-ink)] hover:text-[var(--ink)] md:hidden"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-3 pt-7">
          <p className="rail-label px-3 pb-2">Command center</p>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const active = item.exact ? location === item.href : location.startsWith(item.href);
              const Icon = item.icon;
              return <Link key={item.href} href={item.href} onClick={onClose} data-testid={`link-nav-${item.label.toLowerCase().replaceAll(' ', '-')}`} className={cn('nav-link', active && 'nav-link-active')}><span className="flex items-center gap-3"><Icon className="h-4 w-4" />{item.label}</span>{item.label === 'Investigations' && <span className="font-mono-app text-[8px] text-[var(--brass)]">LIVE</span>}</Link>;
            })}
          </nav>
          <p className="rail-label px-3 pb-2 pt-8">Governance</p>
          <nav className="space-y-1">
            {secondaryNav.map((item) => {
              const active = location.startsWith(item.href);
              const Icon = item.icon;
              return <Link key={item.href} href={item.href} onClick={onClose} data-testid={`link-nav-${item.label.toLowerCase().replaceAll(' ', '-')}`} className={cn('nav-link', active && 'nav-link-active')}><span className="flex items-center gap-3"><Icon className="h-4 w-4" />{item.label}</span></Link>;
            })}
          </nav>
        </div>
        <div className="mt-auto p-4">
          <div className="border border-[var(--line)] bg-[var(--panel-2)] p-3">
            <div className="mb-2 flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[var(--teal)]" /><span className="font-mono-app text-[9px] font-bold uppercase tracking-[.16em] text-[var(--teal)]">Systems nominal</span></div>
            <p className="text-[11px] leading-4 text-[var(--muted-ink)]">Scoring pipelines reporting within expected latency.</p>
            <div className="mt-3 flex items-center justify-between border-t border-[var(--line)] pt-2 font-mono-app text-[9px] text-[var(--muted-ink)]"><span>MODEL V3.8.2</span><LockKeyhole className="h-3 w-3" /></div>
          </div>
        </div>
      </aside>
    </>
  );
}

function Shell({ children, title, eyebrow }: { children: ReactNode; title: string; eyebrow: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return <div className="noise-overlay bench-grid flex min-h-[100dvh] text-[var(--ink)]"><Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} /><div className="min-w-0 flex-1"><Header title={title} eyebrow={eyebrow} onMenu={() => setMenuOpen(true)} /><main className="mx-auto max-w-[1640px] p-4 md:p-7 xl:p-9">{children}</main></div></div>;
}

function SectionHeading({ eyebrow, title, detail, action }: { eyebrow?: string; title: string; detail?: string; action?: ReactNode }) {
  return <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div>{eyebrow && <p className="rail-label text-[var(--rust)]">{eyebrow}</p>}<h2 className="mt-1 font-display text-xl uppercase leading-none tracking-[-.015em] text-[var(--ink)]">{title}</h2>{detail && <p className="mt-2 text-xs text-[var(--muted-ink)]">{detail}</p>}</div>{action}</div>;
}

function MetricCard({ label, value, subtext, icon: Icon, tone = 'neutral', trend }: { label: string; value: string; subtext: string; icon: LucideIcon; tone?: 'neutral' | 'danger' | 'gold' | 'teal'; trend?: 'up' | 'down' }) {
  return <div className="bench-panel group p-4 transition-transform hover:-translate-y-0.5"><div className="flex items-start justify-between"><span className={cn('flex h-8 w-8 items-center justify-center border', tone === 'danger' ? 'border-[var(--rust)]/60 bg-[var(--rust)]/10 text-[var(--rust)]' : tone === 'gold' ? 'border-[var(--brass)]/60 bg-[var(--brass)]/10 text-[var(--brass)]' : tone === 'teal' ? 'border-[var(--teal)]/60 bg-[var(--teal)]/10 text-[var(--teal)]' : 'border-[var(--line)] bg-[var(--panel-2)] text-[var(--muted-ink)]')}><Icon className="h-4 w-4" /></span>{trend && <span className={cn('flex items-center gap-0.5 font-mono-app text-[9px] font-bold', trend === 'up' ? 'text-[var(--rust)]' : 'text-[var(--teal)]')}>{trend === 'up' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />} 7D</span>}</div><p className="mt-5 font-mono-app text-2xl font-bold tracking-[-.08em] text-[var(--ink)]">{value}</p><p className="mt-1 text-xs font-bold uppercase tracking-wide text-[var(--ink)]">{label}</p><p className="mt-1 text-[11px] text-[var(--muted-ink)]">{subtext}</p></div>;
}

function Sparkline({ trend }: { trend: Array<{ label: string; risk: number; volume: number }> }) {
  const values = trend.length ? trend.map((point) => point.risk) : [28, 34, 31, 40, 37, 43, 40];
  const max = Math.max(...values, 1); const min = Math.min(...values, 0); const span = Math.max(max - min, 1);
  const points = values.map((value, index) => `${(index / Math.max(values.length - 1, 1)) * 100},${94 - ((value - min) / span) * 70}`).join(' ');
  return <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full" aria-label="Risk trend chart"><defs><linearGradient id="riskFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--rust)" stopOpacity=".32" /><stop offset="1" stopColor="var(--rust)" stopOpacity="0" /></linearGradient></defs><polyline points={`0,100 ${points} 100,100`} fill="url(#riskFill)" stroke="none" /><polyline points={points} fill="none" stroke="var(--rust)" strokeWidth="2.2" strokeLinecap="square" strokeLinejoin="miter" vectorEffect="non-scaling-stroke" /></svg>;
}

function TransactionRow({ transaction, selected, onSelect }: { transaction: RiskTransaction; selected?: boolean; onSelect: () => void }) {
  return <button data-testid={`button-transaction-${transaction.transactionId}`} onClick={onSelect} className={cn('spec-row w-full px-4 py-3 text-left', selected && 'spec-row-active')}><div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><span className="font-mono-app text-xs font-bold text-[var(--ink)]">{transaction.transactionId}</span><RiskBadge level={transaction.riskLevel} score={transaction.riskScore} /></div><span className="font-mono-app text-xs font-bold text-[var(--ink)]">{formatMoney(transaction.amount, transaction.currency)}</span></div><div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-[var(--muted-ink)]"><span className="truncate">{transaction.customerId}<span className="px-1 text-[var(--line)]">/</span>{transaction.merchantId}</span><span>{formatTime(transaction.timestamp)}</span></div></button>;
}

function OverviewPage() {
  const [, setLocation] = useLocation();
  const overviewQuery = useGetRiskOverview();
  const transactionQuery = useListRiskTransactions();
  const overview = overviewQuery.data as RiskOverview | undefined;
  const transactions = useMemo(() => transactionQuery.data ?? [], [transactionQuery.data]);
  const trend = overview?.trend ?? [];
  return <Shell title="Risk posture" eyebrow="Overview / Live posture">
    <div className="rs-reveal mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="font-mono-app text-[10px] uppercase tracking-[.26em] text-[var(--muted-ink)]">Inspection window / 23 OCT 2024</p><h2 className="mt-2 font-display text-4xl uppercase leading-[.88] tracking-[-.03em] text-[var(--ink)] md:text-6xl">Know the<br /><span className="text-[var(--rust)]">signal.</span> Own<br />the verdict.</h2></div><button data-testid="button-refresh-overview" onClick={() => { void overviewQuery.refetch(); void transactionQuery.refetch(); }} className="bench-button"><RefreshCw className={cn('h-3.5 w-3.5', overviewQuery.isFetching && 'animate-spin')} /> Refresh posture</button></div>
    <QueryState error={overviewQuery.isError} onRetry={() => void overviewQuery.refetch()} />
    {overviewQuery.isLoading ? <div className="grid gap-3 lg:grid-cols-[1.3fr_repeat(4,1fr)]"><LoadingBlock className="h-48 lg:row-span-2" />{[1, 2, 3, 4].map((item) => <LoadingBlock key={item} className="h-48" />)}</div> : overview && <div className="grid gap-3 lg:grid-cols-[1.3fr_repeat(4,1fr)]">
      <div className="relative overflow-hidden border border-[var(--rust)] bg-[var(--rust)] p-5 text-[var(--canvas)] lg:row-span-2"><div className="absolute -right-8 -top-12 h-52 w-52 border-[22px] border-[var(--canvas)]/10" /><div className="relative flex h-full flex-col justify-between"><div><div className="flex items-center justify-between gap-3"><p className="font-mono-app text-[9px] font-bold uppercase tracking-[.2em] text-[var(--canvas)]/65">Current risk posture</p><span className="flex items-center gap-1.5 border border-[var(--canvas)]/35 px-2 py-1 font-mono-app text-[9px] font-bold uppercase tracking-wider"><span className="h-1.5 w-1.5 rounded-full bg-[var(--teal)]" />{overview.spikeStatus || 'Nominal'}</span></div><div className="mt-8 flex items-end gap-2"><span className="font-display text-7xl leading-none tracking-[-.1em] text-[var(--canvas)]">{scoreLabel(overview.averageRiskScore)}</span><span className="mb-2 font-mono-app text-sm text-[var(--canvas)]/60">/ 100</span></div><p className="mt-1 text-sm font-bold uppercase tracking-wide text-[var(--canvas)]/75">Average scored risk</p></div><div className="mt-10 border-t border-[var(--canvas)]/20 pt-4"><div className="flex items-center justify-between text-[11px]"><span className="text-[var(--canvas)]/60">Fraud rate</span><span className="font-mono-app font-bold">{scoreValue(overview.fraudRate).toFixed(1)}%</span></div><div className="mt-2 h-1.5 bg-[var(--canvas)]/15"><div className="h-full bg-[var(--brass)]" style={{ width: `${Math.min(scoreValue(overview.fraudRate) * 4, 100)}%` }} /></div></div></div></div>
      <MetricCard label="High-risk events" value={formatCompact(overview.highRisk)} subtext="Require analyst review" icon={ShieldAlert} tone="danger" trend="up" />
      <MetricCard label="Fraud detected" value={formatCompact(overview.fraudDetected)} subtext="Confirmed in current window" icon={Fingerprint} tone="gold" />
      <MetricCard label="Loss prevented" value={formatMoney(overview.preventedLoss)} subtext="Defensive actions attributed" icon={Coins} tone="teal" trend="down" />
      <MetricCard label="Active investigations" value={formatCompact(overview.activeInvestigations)} subtext="Cases waiting for a decision" icon={FileSearch} />
    </div>}
    <div className="mt-6 grid gap-3 xl:grid-cols-[1.45fr_1fr]">
      <section className="rs-reveal rs-reveal-1 bench-panel p-5"><SectionHeading eyebrow="Signal over time" title="Risk intensity" detail="Seven-day movement across scored activity" action={<span className="inline-flex items-center gap-1.5 font-mono-app text-[9px] font-bold uppercase tracking-wider text-[var(--teal)]"><ArrowDownRight className="h-3 w-3" /> 4.8% vs prior</span>} /><div className="relative h-56 overflow-hidden border border-[var(--line)] bg-[var(--canvas)] bench-grid"><div className="absolute inset-x-0 top-1/2 border-t border-dashed border-[var(--line)]" /><div className="absolute inset-x-4 bottom-7 top-4"><Sparkline trend={trend} /></div><div className="absolute inset-x-4 bottom-2 flex justify-between font-mono-app text-[9px] text-[var(--muted-ink)]">{(trend.length ? trend : [{ label: 'Mon' }, { label: 'Tue' }, { label: 'Wed' }, { label: 'Thu' }, { label: 'Fri' }, { label: 'Sat' }, { label: 'Sun' }]).map((point, index) => <span key={`${point.label}-${index}`}>{point.label}</span>)}</div></div></section>
      <section className="rs-reveal rs-reveal-2 bench-panel p-5"><SectionHeading eyebrow="Model telemetry" title="Signal composition" detail="What is driving current risk scores" /><div className="space-y-4">{[['Behavioral pattern', 72, 'teal'], ['Velocity pressure', 51, 'brass'], ['Graph proximity', 38, 'rust'], ['Anomaly signature', 29, 'rust']].map(([label, value, tone]) => <div key={label as string}><div className="mb-1.5 flex items-center justify-between text-xs"><span className="font-bold">{label}</span><span className="font-mono-app text-[var(--muted-ink)]">{value}%</span></div><div className="h-2 bg-[var(--panel-2)]"><div className={cn('h-full', tone === 'teal' ? 'bg-[var(--teal)]' : tone === 'brass' ? 'bg-[var(--brass)]' : 'bg-[var(--rust)]')} style={{ width: `${value}%` }} /></div></div>)}</div><div className="mt-6 flex items-center gap-2 border-t border-[var(--line)] pt-4 text-[11px] text-[var(--muted-ink)]"><Sparkles className="h-3.5 w-3.5 text-[var(--brass)]" /> Explainability coverage <span className="ml-auto font-mono-app font-bold text-[var(--ink)]">94.2%</span></div></section>
    </div>
    <section className="rs-reveal rs-reveal-3 mt-6 bench-panel"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] p-5"><div><p className="rail-label text-[var(--rust)]">Live queue</p><h2 className="mt-1 font-display text-xl uppercase leading-none">Recent activity</h2></div><Link href="/investigations" data-testid="link-view-all-investigations" className="inline-flex items-center gap-1 font-mono-app text-[10px] font-bold uppercase tracking-wider text-[var(--rust)] hover:text-[var(--brass)]">Open investigation queue <ChevronRight className="h-3.5 w-3.5" /></Link></div>{transactionQuery.isLoading ? <div className="space-y-1 p-4">{[1, 2, 3].map((item) => <LoadingBlock key={item} className="h-14" />)}</div> : transactionQuery.isError ? <div className="p-4"><QueryState error onRetry={() => void transactionQuery.refetch()} /></div> : transactions.length ? <div>{transactions.slice(0, 5).map((transaction) => <TransactionRow key={transaction.transactionId} transaction={transaction} onSelect={() => setLocation(`/investigations?transaction=${transaction.transactionId}`)} />)}</div> : <div className="p-4"><EmptyState title="No scored activity yet" body="When transactions enter the risk engine, the latest events will appear here." /></div>}</section>
  </Shell>;
}

function ScoreMeter({ label, value }: { label: string; value?: number }) {
  const score = scoreValue(value);
  return <div className="border border-[var(--line)] bg-[var(--canvas)] p-3"><div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-[var(--muted-ink)]"><span>{label}</span><span className="font-mono-app text-[var(--ink)]">{score.toFixed(0)}</span></div><div className="mt-2 h-1.5 bg-[var(--panel-2)]"><div className="h-full" style={{ width: `${score}%`, backgroundColor: toneColor(score >= 70 ? 'high' : score >= 45 ? 'medium' : 'low') }} /></div></div>;
}

function BulletList({ title, items, tone }: { title: string; items: string[]; tone: 'teal' | 'amber' }) {
  return <div><p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide"><span className={cn('h-1.5 w-1.5 rounded-full', tone === 'teal' ? 'bg-[var(--teal)]' : 'bg-[var(--brass)]')} />{title}</p>{items.length ? <ul className="space-y-2">{items.map((item, index) => <li key={`${item}-${index}`} className="flex gap-2 text-xs leading-5 text-[var(--muted-ink)]"><span className="font-mono-app text-[10px] text-[var(--rust)]">{String(index + 1).padStart(2, '0')}</span>{item}</li>)}</ul> : <p className="text-xs text-[var(--muted-ink)]">No signals recorded.</p>}</div>;
}

function DecisionButton({ label, icon: Icon, onClick, disabled, kind }: { label: string; icon: LucideIcon; onClick: () => void; disabled?: boolean; kind: 'approve' | 'reject' | 'escalate' | 'evidence' }) {
  return <button data-testid={`button-decision-${kind}`} onClick={onClick} disabled={disabled} className={cn('decision-button', kind === 'approve' && 'decision-approve', kind === 'reject' && 'decision-reject', kind === 'escalate' && 'decision-escalate')}><Icon className="h-3.5 w-3.5" />{label}</button>;
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
    <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><span className="font-mono-app text-xs font-bold text-[var(--rust)]">{transaction?.transactionId}</span><RiskBadge level={transaction?.riskLevel} score={transaction?.riskScore} /></div><h2 className="mt-2 font-display text-3xl uppercase leading-none">Evidence review</h2><p className="mt-2 text-xs text-[var(--muted-ink)]">{transaction?.customerId} / {transaction?.merchantId} / {formatTime(transaction?.timestamp)}</p></div><div className="text-right"><p className="font-display text-5xl leading-none tracking-[-.08em] text-[var(--ink)]">{scoreLabel(transaction?.riskScore)}</p><p className="mt-1 font-mono-app text-[9px] uppercase tracking-[.16em] text-[var(--muted-ink)]">Risk score / 100</p></div></div>
    {feedback && <div data-testid="status-review-feedback" className={cn('flex items-center gap-2 border px-3 py-2 text-xs font-semibold', feedback.type === 'success' ? 'border-[var(--teal)]/60 bg-[var(--teal)]/10 text-[var(--teal)]' : 'border-[var(--rust)]/60 bg-[var(--rust)]/10 text-[var(--rust)]')}><span className="h-1.5 w-1.5 rounded-full bg-current" />{feedback.text}</div>}
    <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]"><div className="space-y-5">
      <section className="bench-panel p-5"><SectionHeading eyebrow="Model readout" title="What we know so far" detail="A plain-language account of the scored event" /><p className="text-[14px] leading-7 text-[var(--ink)]/80">{investigation?.summary || 'The model has not supplied a written summary for this event.'}</p><div className="mt-5 grid gap-3 sm:grid-cols-3"><ScoreMeter label="Fraud probability" value={transaction?.fraudProbability} /><ScoreMeter label="Anomaly score" value={transaction?.anomalyScore} /><ScoreMeter label="Graph score" value={transaction?.graphScore} /></div></section>
      <section className="bench-panel p-5"><SectionHeading eyebrow="Signal ledger" title="Facts vs. inference" /><div className="grid gap-5 md:grid-cols-2"><BulletList title="Observed facts" items={investigation?.facts ?? transaction?.factors ?? []} tone="teal" /><BulletList title="Model inferences" items={investigation?.inferences ?? []} tone="amber" /></div></section>
      <section className="bench-panel p-5"><SectionHeading eyebrow="Source material" title="Evidence attached" detail="Inspect the source before taking action" />{investigation?.evidence?.length ? <div className="divide-y divide-[var(--line)]">{investigation.evidence.map((item, index) => <div key={`${item.label}-${index}`} data-testid={`evidence-item-${index}`} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div className="flex items-center gap-3"><div className="border border-[var(--line)] bg-[var(--panel-2)] p-2 text-[var(--muted-ink)]"><Database className="h-4 w-4" /></div><div><p className="text-xs font-bold uppercase tracking-wide">{item.label}</p><p className="mt-0.5 text-[11px] text-[var(--muted-ink)]">{item.source}</p></div></div><span className="font-mono-app text-[10px] text-[var(--ink)]">{item.value}</span></div>)}</div> : <EmptyState title="No evidence attached" body="Request supporting evidence before finalizing this case." />}</section>
    </div><div className="space-y-5">
      <section className="relative overflow-hidden border border-[var(--rust)] bg-[var(--rust)] p-5 text-[var(--canvas)]"><div className="absolute -right-8 -top-8 h-28 w-28 border-[12px] border-[var(--canvas)]/10" /><div className="relative flex items-center justify-between"><p className="font-mono-app text-[10px] font-bold uppercase tracking-[.18em]">Recommended action</p><Target className="h-4 w-4 text-[var(--brass)]" /></div><p className="relative mt-5 font-display text-2xl uppercase leading-none">{investigation?.recommendation || 'Review required'}</p><div className="relative mt-7 border-t border-[var(--canvas)]/20 pt-4"><div className="flex justify-between text-[11px]"><span className="text-[var(--canvas)]/60">Model confidence</span><span className="font-mono-app font-bold">{scoreValue(investigation?.confidence).toFixed(1)}%</span></div><div className="mt-2 h-1.5 bg-[var(--canvas)]/15"><div className="h-full bg-[var(--brass)]" style={{ width: `${scoreValue(investigation?.confidence)}%` }} /></div></div></section>
      {investigation?.missingInformation?.length ? <section className="border border-[var(--brass)]/70 bg-[var(--brass)]/10 p-5"><div className="flex items-center gap-2 text-[var(--brass)]"><AlertCircle className="h-4 w-4" /><p className="font-mono-app text-[10px] font-bold uppercase tracking-[.16em]">Uncertainty to resolve</p></div><ul className="mt-3 space-y-2">{investigation.missingInformation.map((item, index) => <li key={`${item}-${index}`} className="flex gap-2 text-xs leading-5 text-[var(--ink)]"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--brass)]" />{item}</li>)}</ul></section> : null}
      <section className="bench-panel p-5"><SectionHeading eyebrow="Human control" title="Record a decision" detail="Your note becomes part of the case audit trail." /><textarea data-testid="input-review-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add context for the next analyst..." className="min-h-20 w-full resize-y border border-[var(--input-line)] bg-[var(--canvas)] px-3 py-2 text-xs text-[var(--ink)] outline-none placeholder:text-[var(--muted-ink)] focus:border-[var(--rust)]" /><div className="mt-4 grid grid-cols-2 gap-2"><DecisionButton label="Approve" icon={Check} onClick={() => submit('approve')} disabled={review.isPending} kind="approve" /><DecisionButton label="Reject" icon={X} onClick={() => submit('reject')} disabled={review.isPending} kind="reject" /><DecisionButton label="Escalate" icon={Flag} onClick={() => submit('escalate')} disabled={review.isPending} kind="escalate" /><DecisionButton label="Request evidence" icon={FileSearch} onClick={() => submit('request_evidence')} disabled={review.isPending} kind="evidence" /></div>{review.isPending && <p className="mt-3 flex items-center gap-2 text-[11px] text-[var(--muted-ink)]"><RefreshCw className="h-3 w-3 animate-spin" /> Recording your decision...</p>}</section>
    </div></div>
  </div>;
}

function InvestigationsPage() {
  const [selectedId, setSelectedId] = useState<string>();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const transactionQuery = useListRiskTransactions();
  const params = useParams<{ id?: string }>();
  const transactions = useMemo(() => transactionQuery.data ?? [], [transactionQuery.data]);
  useEffect(() => { const queryId = new URLSearchParams(window.location.search).get('transaction'); setSelectedId(params.id || queryId || transactions[0]?.transactionId); }, [params.id, transactions]);
  const filtered = useMemo(() => transactions.filter((item) => { const matchesSearch = !search || [item.transactionId, item.customerId, item.merchantId].some((field) => field.toLowerCase().includes(search.toLowerCase())); const matchesFilter = filter === 'all' || riskTone(item.riskLevel, item.riskScore) === filter; return matchesSearch && matchesFilter; }), [transactions, search, filter]);
  return <Shell title="Investigations" eyebrow="Analyst queue / Human review">
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="rail-label text-[var(--rust)]">Signal to decision</p><h2 className="mt-1 font-display text-3xl uppercase leading-none">Investigation queue</h2><p className="mt-2 text-xs text-[var(--muted-ink)]">Review the highest-consequence events first. Every action is traceable.</p></div><div className="flex items-center gap-2 border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-xs"><span className="h-1.5 w-1.5 rounded-full bg-[var(--teal)]" /><span className="font-mono-app font-bold">{transactions.length}</span><span className="font-mono-app text-[9px] uppercase text-[var(--muted-ink)]">scored events</span></div></div>
    {transactionQuery.isError ? <QueryState error onRetry={() => void transactionQuery.refetch()} /> : <div className="grid min-h-[680px] gap-5 xl:grid-cols-[380px_1fr]"><section className="bench-panel overflow-hidden"><div className="border-b border-[var(--line)] p-4"><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--muted-ink)]" /><input data-testid="input-investigation-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search transaction, customer..." className="h-9 w-full border border-[var(--input-line)] bg-[var(--canvas)] pl-9 pr-3 text-xs text-[var(--ink)] outline-none focus:border-[var(--rust)]" /></div><div className="mt-3 flex items-center gap-1.5">{['all', 'high', 'medium', 'low'].map((item) => <button key={item} data-testid={`button-filter-${item}`} onClick={() => setFilter(item)} className={cn('filter-button', filter === item && 'filter-active')}>{item}</button>)}</div></div><div className="max-h-[590px] overflow-y-auto">{transactionQuery.isLoading ? <div className="space-y-2 p-3">{[1, 2, 3, 4].map((item) => <LoadingBlock key={item} className="h-16" />)}</div> : filtered.length ? filtered.map((transaction) => <TransactionRow key={transaction.transactionId} transaction={transaction} selected={selectedId === transaction.transactionId} onSelect={() => setSelectedId(transaction.transactionId)} />) : <div className="p-4"><EmptyState title="No matching events" body="Adjust the search or filter to widen the queue." icon={Search} /></div>}</div><div className="border-t border-[var(--line)] bg-[var(--canvas)] px-4 py-3 font-mono-app text-[10px] text-[var(--muted-ink)]">Showing {filtered.length} of {transactions.length} events</div></section><section><InvestigationDetail transactionId={selectedId} /></section></div>}
  </Shell>;
}

function NetworkPage() {
  const query = useGetRiskNetwork({ query: { queryKey: getGetRiskNetworkQueryKey() } });
  const network = query.data as RiskNetwork | undefined;
  const [selected, setSelected] = useState<string>();
  return <Shell title="Risk network" eyebrow="Entity relationships / Exposure">
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="rail-label text-[var(--rust)]">Connected risk</p><h2 className="mt-1 font-display text-3xl uppercase leading-none">Suspicious entity network</h2><p className="mt-2 text-xs text-[var(--muted-ink)]">See the relationships that a single event cannot explain.</p></div>{network && <div className="flex items-center gap-5 font-mono-app text-[10px] uppercase text-[var(--muted-ink)]"><div><span className="text-lg font-bold text-[var(--ink)]">{network.nodes.length}</span> entities</div><div><span className="text-lg font-bold text-[var(--ink)]">{network.clusterCount}</span> clusters</div></div>}</div>
    <QueryState error={query.isError} onRetry={() => void query.refetch()} />
    {query.isLoading ? <div className="grid gap-5 lg:grid-cols-[1fr_300px]"><LoadingBlock className="h-[600px]" /><LoadingBlock className="h-[600px]" /></div> : network ? <div className="grid gap-5 lg:grid-cols-[1fr_300px]"><section className="relative min-h-[600px] overflow-hidden border border-[var(--line)] bg-[var(--panel)] bench-grid"><div className="absolute left-5 top-5 z-10 border border-[var(--line)] bg-[var(--panel)]/90 px-3 py-2"><p className="rail-label">Relationship map</p><p className="mt-1 text-xs font-bold">{network.links.length} active links</p></div><svg viewBox="0 0 900 600" className="absolute inset-0 h-full w-full"><g stroke="var(--line-bright)" strokeWidth="1.5" strokeDasharray="4 5">{network.links.map((link, index) => { const sourceIndex = network.nodes.findIndex((node) => node.id === link.source); const targetIndex = network.nodes.findIndex((node) => node.id === link.target); const x1 = 130 + (Math.max(sourceIndex, 0) % 4) * 210; const y1 = 175 + (Math.floor(Math.max(sourceIndex, 0) / 4) % 3) * 145; const x2 = 130 + (Math.max(targetIndex, 0) % 4) * 210; const y2 = 175 + (Math.floor(Math.max(targetIndex, 0) / 4) % 3) * 145; return <line key={`${link.source}-${link.target}-${index}`} x1={x1} y1={y1} x2={x2} y2={y2} />; })}</g>{network.nodes.map((node, index) => { const x = 130 + (index % 4) * 210; const y = 175 + (Math.floor(index / 4) % 3) * 145; const tone = riskTone(undefined, node.risk); return <g key={node.id} className="cursor-pointer" onClick={() => setSelected(node.id)}><circle cx={x} cy={y} r={selected === node.id ? 31 : 26} fill="var(--panel-2)" stroke={toneColor(tone)} strokeWidth={selected === node.id ? 3 : 1.5} /><circle cx={x} cy={y} r="4" fill={toneColor(tone)} /><text x={x} y={y + 47} textAnchor="middle" className="fill-[var(--ink)] text-[11px] font-semibold">{node.label}</text><text x={x} y={y + 61} textAnchor="middle" className="fill-[var(--muted-ink)] text-[9px]">{node.type} / {scoreLabel(node.risk)}</text></g>; })}</svg>{!network.nodes.length && <div className="absolute inset-0 flex items-center justify-center p-6"><EmptyState title="No connected entities" body="The graph will populate as relationship signals are scored." icon={Network} /></div>}</section><section className="bench-panel p-5"><SectionHeading eyebrow="Selected entity" title={selected ? network.nodes.find((node) => node.id === selected)?.label || 'Entity detail' : 'Inspect the graph'} detail={selected ? 'Relationship risk profile' : 'Select a node to inspect'} />{selected ? (() => { const node = network.nodes.find((item) => item.id === selected); return <div className="space-y-4"><div className="border border-[var(--line)] bg-[var(--canvas)] p-4"><p className="font-display text-4xl">{scoreLabel(node?.risk)}</p><p className="mt-1 text-xs text-[var(--muted-ink)]">Entity risk score</p><div className="mt-3"><RiskBadge score={node?.risk} level={riskTone(undefined, node?.risk)} /></div></div><div className="space-y-3 text-xs"><div className="flex justify-between border-b border-[var(--line)] pb-3"><span className="text-[var(--muted-ink)]">Entity type</span><span className="font-semibold">{node?.type}</span></div><div className="flex justify-between border-b border-[var(--line)] pb-3"><span className="text-[var(--muted-ink)]">Connections</span><span className="font-mono-app font-bold">{network.links.filter((link) => link.source === selected || link.target === selected).length}</span></div><div className="flex justify-between"><span className="text-[var(--muted-ink)]">Entity ID</span><span className="font-mono-app text-[10px]">{node?.id}</span></div></div><Link href="/investigations" data-testid="link-network-investigate" className="flex items-center justify-center gap-2 bg-[var(--rust)] px-3 py-2.5 font-mono-app text-[10px] font-bold uppercase tracking-wider text-[var(--canvas)] hover:bg-[var(--brass)]">Open investigation queue <ExternalLink className="h-3.5 w-3.5" /></Link></div>; })() : <div className="flex min-h-64 flex-col items-center justify-center text-center"><CircleDot className="h-6 w-6 text-[var(--muted-ink)]" /><p className="mt-3 text-sm font-bold">One click from context</p><p className="mt-1 max-w-[210px] text-xs leading-5 text-[var(--muted-ink)]">Select any entity in the map to reveal its score and connections.</p></div>}</section></div> : <EmptyState title="Network is quiet" body="No suspicious relationships are available for this window." icon={Network} />}
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
  return <Shell title={mode === 'chargebacks' ? 'Chargebacks' : 'Returns'} eyebrow={mode === 'chargebacks' ? 'Dispute operations / Evidence' : 'Post-purchase / Supporting view'}>
    <div className="mb-7"><p className="rail-label text-[var(--rust)]">{mode === 'chargebacks' ? 'Evidence review surface' : 'Behavioral risk surface'}</p><h2 className="mt-1 font-display text-3xl uppercase leading-none">{title}</h2><p className="mt-2 max-w-2xl text-xs leading-5 text-[var(--muted-ink)]">{mode === 'chargebacks' ? 'Bring the transaction, model rationale, and source evidence together before a dispute response is approved.' : 'Use existing risk signals to prioritize return-related events that may need a closer human look.'}</p></div>
    {transactionQuery.isError ? <QueryState error onRetry={() => void transactionQuery.refetch()} /> : <div className="grid gap-5 lg:grid-cols-[minmax(290px,360px)_1fr]"><section className="bench-panel overflow-hidden"><div className="flex items-center justify-between border-b border-[var(--line)] p-4"><span className="rail-label">Priority set</span><span className="font-mono-app text-sm font-bold">{candidates.length}</span></div>{transactionQuery.isLoading ? <div className="space-y-2 p-3">{[1, 2, 3].map((item) => <LoadingBlock key={item} className="h-16" />)}</div> : candidates.length ? candidates.map((item) => <TransactionRow key={item.transactionId} transaction={item} selected={selectedId === item.transactionId} onSelect={() => setSelectedId(item.transactionId)} />) : <div className="p-4"><EmptyState title="No candidates in this window" body="This view only surfaces existing scored transaction signals." /></div>}</section><section className="bench-panel p-5">{selected ? <SupportingDetail transaction={selected} mode={mode} /> : <EmptyState title="Nothing selected" body="Choose a transaction from the priority set to review its supporting signals." icon={FileSearch} />}</section></div>}
  </Shell>;
}

function SupportingDetail({ transaction, mode }: { transaction: RiskTransaction; mode: 'chargebacks' | 'returns' }) {
  return <div><div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line)] pb-5"><div><div className="flex items-center gap-2"><span className="font-mono-app text-xs font-bold text-[var(--rust)]">{transaction.transactionId}</span><RiskBadge level={transaction.riskLevel} score={transaction.riskScore} /></div><h3 className="mt-2 font-display text-2xl uppercase leading-none">{mode === 'chargebacks' ? 'Dispute evidence packet' : 'Return-risk signal packet'}</h3><p className="mt-2 text-xs text-[var(--muted-ink)]">{formatMoney(transaction.amount, transaction.currency)} / {formatDate(transaction.timestamp)}</p></div><Link href={`/investigations/${transaction.transactionId}`} data-testid="link-open-supporting-investigation" className="bench-button"><FileSearch className="h-3.5 w-3.5" /> Full investigation</Link></div><div className="mt-6 grid gap-4 md:grid-cols-2"><div className="border border-[var(--line)] bg-[var(--canvas)] p-4"><p className="rail-label">Transaction context</p><dl className="mt-4 space-y-3 text-xs"><div className="flex justify-between gap-4"><dt className="text-[var(--muted-ink)]">Customer</dt><dd className="font-mono-app font-bold">{transaction.customerId}</dd></div><div className="flex justify-between gap-4"><dt className="text-[var(--muted-ink)]">Merchant</dt><dd className="font-mono-app font-bold">{transaction.merchantId}</dd></div><div className="flex justify-between gap-4"><dt className="text-[var(--muted-ink)]">Decision</dt><dd className="font-semibold capitalize">{transaction.decision || 'Review'}</dd></div><div className="flex justify-between gap-4"><dt className="text-[var(--muted-ink)]">Status</dt><dd className="font-semibold capitalize">{transaction.status || 'Open'}</dd></div></dl></div><div className="border border-[var(--line)] bg-[var(--canvas)] p-4"><p className="rail-label">Supporting scores</p><div className="mt-4 space-y-3"><ScoreMeter label="Behavior" value={transaction.behaviorScore} /><ScoreMeter label="Velocity" value={transaction.velocityScore} /><ScoreMeter label="Anomaly" value={transaction.anomalyScore} /></div></div></div><div className="mt-5 border border-[var(--brass)]/70 bg-[var(--brass)]/10 p-4"><div className="flex items-center gap-2 text-[var(--brass)]"><AlertCircle className="h-4 w-4" /><p className="text-xs font-bold">Analyst checkpoint</p></div><p className="mt-2 text-xs leading-5 text-[var(--ink)]/75">Supporting views surface risk signals; they do not replace the evidence-backed decision workflow.</p></div><div className="mt-5"><p className="rail-label">Factors on record</p><div className="mt-3 flex flex-wrap gap-2">{(transaction.factors ?? []).map((factor, index) => <span key={`${factor}-${index}`} className="border border-[var(--line)] bg-[var(--panel-2)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink)]">{factor}</span>)}</div></div></div>;
}

function AuditPage() {
  const query = useListAuditEvents();
  const events = useMemo(() => query.data ?? [], [query.data]);
  return <Shell title="Audit trail" eyebrow="Governance / Traceability">
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="rail-label text-[var(--rust)]">Accountability by default</p><h2 className="mt-1 font-display text-3xl uppercase leading-none">Decisions & human actions</h2><p className="mt-2 text-xs text-[var(--muted-ink)]">A durable record of what happened, who acted, and which model version was in play.</p></div><div className="flex items-center gap-2 border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-xs"><History className="h-3.5 w-3.5 text-[var(--rust)]" /><span className="font-mono-app font-bold">{events.length}</span><span className="font-mono-app text-[9px] uppercase text-[var(--muted-ink)]">events</span></div></div>
    {query.isError ? <QueryState error onRetry={() => void query.refetch()} /> : <section className="bench-panel">{query.isLoading ? <div className="space-y-2 p-5">{[1, 2, 3, 4].map((item) => <LoadingBlock key={item} className="h-20" />)}</div> : events.length ? <div className="divide-y divide-[var(--line)]">{events.map((event) => <AuditRow key={event.id} event={event} />)}</div> : <div className="p-5"><EmptyState title="No audit events yet" body="Human decisions will appear here as analysts review cases." icon={History} /></div>}</section>}
  </Shell>;
}
function AuditRow({ event }: { event: AuditEvent }) {
  return <div data-testid={`audit-event-${event.id}`} className="grid gap-3 p-5 md:grid-cols-[130px_1fr_190px] md:items-center"><div><p className="font-mono-app text-[10px] text-[var(--muted-ink)]">{formatDate(event.timestamp)}</p><p className="mt-1 font-mono-app text-[10px] text-[var(--muted-ink)]">{formatTime(event.timestamp).split(', ').pop()}</p></div><div className="flex items-start gap-3"><span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center border border-[var(--teal)]/40 bg-[var(--teal)]/10 text-[var(--teal)]"><BadgeCheck className="h-4 w-4" /></span><div><p className="text-sm font-bold">{event.event}</p><p className="mt-1 text-xs leading-5 text-[var(--muted-ink)]">{event.note || 'No additional analyst note recorded.'}</p><p className="mt-2 font-mono-app text-[10px] text-[var(--muted-ink)]">CASE {event.caseId}</p></div></div><div className="flex items-center justify-between gap-3 md:justify-end"><div className="text-right"><p className="text-xs font-bold">{event.actor}</p><p className="mt-1 font-mono-app text-[9px] text-[var(--muted-ink)]">MODEL {event.decisionVersion}</p></div><ChevronRight className="h-4 w-4 text-[var(--muted-ink)]" /></div></div>;
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
    <div className="mb-7"><p className="rail-label text-[var(--rust)]">Held-out view</p><h2 className="mt-1 font-display text-3xl uppercase leading-none">Does the model earn trust?</h2><p className="mt-2 max-w-2xl text-xs leading-5 text-[var(--muted-ink)]">A compact read on performance and operational impact from the currently available scored set.</p></div>
    <QueryState error={overviewQuery.isError || transactionQuery.isError} onRetry={() => { void overviewQuery.refetch(); void transactionQuery.refetch(); }} />
    {overviewQuery.isLoading || transactionQuery.isLoading ? <div className="grid gap-5 md:grid-cols-2"><LoadingBlock className="h-64" /><LoadingBlock className="h-64" /><LoadingBlock className="h-56 md:col-span-2" /></div> : <div className="space-y-5"><div className="grid gap-3 md:grid-cols-3"><MetricCard label="Average risk score" value={scoreLabel(overview?.averageRiskScore)} subtext="Across the scored window" icon={Gauge} tone="gold" /><MetricCard label="High-risk capture" value={transactions.length ? `${Math.round((highRisk / transactions.length) * 100)}%` : '—'} subtext={`${highRisk} events in the current set`} icon={Target} tone="danger" /><MetricCard label="Explainability coverage" value={`${explainability}%`} subtext="Events carrying factor evidence" icon={Sparkles} tone="teal" /></div><div className="grid gap-5 lg:grid-cols-2"><section className="bench-panel p-5"><SectionHeading eyebrow="Performance frame" title="Held-out model readout" detail="Operational proxy from live scored events" /><div className="space-y-5"><EvalBar label="Signal coverage" value={Math.min(100, overview?.transactionsAnalyzed ? (transactions.length / overview.transactionsAnalyzed) * 100 : 0)} note={`${transactions.length} events sampled`} /><EvalBar label="Fraud rate in window" value={scoreValue(overview?.fraudRate)} note={`${formatCompact(overview?.fraudDetected)} confirmed detections`} /><EvalBar label="Risk concentration" value={transactions.length ? (highRisk / transactions.length) * 100 : 0} note={`${highRisk} high-risk events`} /></div></section><section className="relative overflow-hidden border border-[var(--rust)] bg-[var(--rust)] p-5 text-[var(--canvas)]"><div className="flex items-center justify-between"><p className="font-mono-app text-[10px] font-bold uppercase tracking-[.18em]">Business impact</p><Coins className="h-4 w-4 text-[var(--brass)]" /></div><p className="mt-7 font-display text-5xl tracking-[-.1em]">{formatMoney(overview?.preventedLoss)}</p><p className="mt-2 text-sm font-bold uppercase tracking-wide text-[var(--canvas)]/75">Prevented loss attributed to defensive action</p><div className="mt-8 grid grid-cols-2 gap-3 border-t border-[var(--canvas)]/20 pt-4"><div><p className="font-mono-app text-xl font-bold">{formatCompact(overview?.fraudDetected)}</p><p className="mt-1 font-mono-app text-[10px] uppercase tracking-wider text-[var(--canvas)]/55">Fraud detected</p></div><div><p className="font-mono-app text-xl font-bold">{formatCompact(overview?.activeInvestigations)}</p><p className="mt-1 font-mono-app text-[10px] uppercase tracking-wider text-[var(--canvas)]/55">Open reviews</p></div></div></section></div><section className="border border-[var(--brass)]/70 bg-[var(--brass)]/10 p-5"><div className="flex gap-3"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brass)]" /><div><p className="text-xs font-bold text-[var(--brass)]">Evaluation context</p><p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--ink)]/75">The evaluation route is using the live scored set because no dedicated held-out evaluation endpoint is exposed in the current API contract. Treat these metrics as an operational snapshot, not a benchmark claim.</p></div></div></section></div>}
  </Shell>;
}
function EvalBar({ label, value, note }: { label: string; value: number; note: string }) {
  return <div><div className="mb-2 flex items-end justify-between gap-3"><div><p className="text-xs font-bold">{label}</p><p className="mt-1 text-[11px] text-[var(--muted-ink)]">{note}</p></div><span className="font-mono-app text-sm font-bold">{value.toFixed(1)}%</span></div><div className="h-2 bg-[var(--panel-2)]"><div className="h-full bg-[var(--rust)]" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div></div>;
}

function Router() {
  return <RoutedErrorBoundary><Switch><Route path="/" component={OverviewPage} /><Route path="/investigations" component={InvestigationsPage} /><Route path="/investigations/:id" component={InvestigationsPage} /><Route path="/network" component={NetworkPage} /><Route path="/chargebacks" component={() => <SupportingView mode="chargebacks" />} /><Route path="/returns" component={() => <SupportingView mode="returns" />} /><Route path="/audit" component={AuditPage} /><Route path="/evaluation" component={EvaluationPage} /><Route component={NotFound} /></Switch></RoutedErrorBoundary>;
}
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}
export default App;