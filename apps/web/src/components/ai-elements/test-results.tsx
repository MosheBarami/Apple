// AI Elements `test-results`, re-implemented for this app.
//
// Upstream (vercel/ai-elements, Apache-2.0, see ./NOTICE) summarises a test run — passed / failed /
// skipped counts, the duration, a segmented progress bar — over one row per test with its status
// icon and, for a failure, the error. Export names follow upstream; the code is written here.
// Passed is drawn in the accent, not green: Apple's direction keeps green to status dots.
//
// Where it is used: when a playtest ends, the Playtest card lists what it actually measured —
// errors and warnings in Output, whether the pictures arrived — as checks
// (components/ws/playtest-card.tsx, picks/tech/playtest-checks.ts).
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './lib/utils';
import { FailIcon, PassIcon, SkipIcon } from '../picks/tech/icons';
import './test-results.css';

export type TestStatusValue = 'passed' | 'failed' | 'skipped' | 'running';

export interface TestResultsSummaryData {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  duration?: number;
}

export type TestResultsProps = HTMLAttributes<HTMLDivElement> & { summary?: TestResultsSummaryData };

export const TestResults = ({ summary, className, children, ...props }: TestResultsProps) => (
  <div className={cn('ai-tests', className)} {...props}>
    {children ?? (summary && (
      <TestResultsHeader>
        <TestResultsSummary summary={summary} />
        {summary.duration !== undefined && <TestResultsDuration ms={summary.duration} />}
      </TestResultsHeader>
    ))}
  </div>
);

export const TestResultsHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('ai-tests__header', className)} {...props} />
);

export const TestResultsSummary = ({ summary }: { summary: TestResultsSummaryData }) => (
  <p className="ai-tests__summary">
    {summary.failed === 0
      ? <>All {summary.total} check{summary.total === 1 ? '' : 's'} passed{summary.skipped > 0 ? `, ${summary.skipped} to look at` : ''}</>
      : <>{summary.failed} of {summary.total} check{summary.total === 1 ? '' : 's'} failed</>}
  </p>
);

export const TestResultsDuration = ({ ms }: { ms: number }) => (
  <span className="ai-tests__duration">{ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)}s`}</span>
);

/** The segmented bar: one segment per status, widths from the counts. Decorative — the words say it. */
export const TestResultsProgress = ({ summary }: { summary: TestResultsSummaryData }) => {
  const pct = (n: number) => (summary.total > 0 ? `${(n / summary.total) * 100}%` : '0%');
  return (
    <div className="ai-tests__bar" aria-hidden="true">
      <span className="ai-tests__seg ai-tests__seg--passed" style={{ width: pct(summary.passed) }} />
      <span className="ai-tests__seg ai-tests__seg--skipped" style={{ width: pct(summary.skipped) }} />
      <span className="ai-tests__seg ai-tests__seg--failed" style={{ width: pct(summary.failed) }} />
    </div>
  );
};

export const TestResultsContent = ({ className, ...props }: HTMLAttributes<HTMLUListElement>) => (
  <ul className={cn('ai-tests__list', className)} role="list" {...props} />
);

export type TestProps = HTMLAttributes<HTMLLIElement> & { name: string; status: TestStatusValue; duration?: number };
export const Test = ({ name, status, duration, className, children, ...props }: TestProps) => (
  <li className={cn('ai-test', `ai-test--${status}`, className)} {...props}>
    <span className="ai-test__row">
      <TestStatus status={status} />
      <TestName>{name}</TestName>
      {duration !== undefined && <TestDuration ms={duration} />}
    </span>
    {children}
  </li>
);

const STATUS_WORD: Record<TestStatusValue, string> = { passed: 'Passed', failed: 'Failed', skipped: 'Look at it', running: 'Running' };

export const TestStatus = ({ status }: { status: TestStatusValue }) => (
  <span className={cn('ai-test__status', `ai-test__status--${status}`)} role="img" aria-label={STATUS_WORD[status]}>
    {status === 'passed' ? <PassIcon size={14} /> : status === 'failed' ? <FailIcon size={14} /> : <SkipIcon size={14} />}
  </span>
);

export const TestName = ({ className, ...props }: HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn('ai-test__name', className)} {...props} />
);

export const TestDuration = ({ ms }: { ms: number }) => <span className="ai-test__duration">{ms} ms</span>;

export const TestError = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('ai-test__error', className)} {...props} />
);

export const TestErrorMessage = ({ children }: { children: ReactNode }) => <span className="ai-test__note">{children}</span>;
