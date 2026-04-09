import type { AthenaQueryResult } from '@/lib/athenaClient';
import type { AnalysisResult } from '@/lib/queryAnalyzer';

const ANALYSIS_RESULTS_KEY = 'athena_results';
const LATEST_ANALYSIS_KEY = 'athena_latest';
const LIVE_EXECUTIONS_KEY = 'athena_live_executions';
export const QUERY_ACTIVITY_EVENT = 'athena-query-activity-changed';

export interface StoredAnalysisEntry {
  id: string;
  query: string;
  result: AnalysisResult;
  timestamp: string;
}

export interface StoredLiveExecution {
  id: string;
  query: string;
  database: string;
  timestamp: string;
  executionTimeMs: number;
  dataScannedBytes: number;
  state: string;
}

export interface DashboardStats {
  queriesAnalyzed: number;
  totalSavingsUsd: number;
  avgReductionPercent: number;
  avgTimeSavedSeconds: number;
}

export interface ProfileStats {
  queriesToday: number;
  avgExecutionTimeMs: number;
  avgEfficiencyPercent: number;
}

function canUseStorage() {
  return typeof window !== 'undefined';
}

function readSessionJson<T>(key: string, fallback: T): T {
  if (!canUseStorage()) return fallback;

  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeSessionJson(key: string, value: unknown) {
  if (!canUseStorage()) return;

  window.sessionStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event(QUERY_ACTIVITY_EVENT));
}

function sameLocalDay(isoTimestamp: string, referenceDate = new Date()) {
  const date = new Date(isoTimestamp);
  return date.toDateString() === referenceDate.toDateString();
}

export function getAnalysisEntries(): StoredAnalysisEntry[] {
  return readSessionJson<StoredAnalysisEntry[]>(ANALYSIS_RESULTS_KEY, []);
}

export function getLiveExecutions(): StoredLiveExecution[] {
  return readSessionJson<StoredLiveExecution[]>(LIVE_EXECUTIONS_KEY, []);
}

export function saveAnalysisEntry(entry: StoredAnalysisEntry) {
  const current = getAnalysisEntries().filter((item) => item.id !== entry.id);
  const next = [entry, ...current].slice(0, 50);

  writeSessionJson(ANALYSIS_RESULTS_KEY, next);
  writeSessionJson(LATEST_ANALYSIS_KEY, entry);
}

export function recordLiveExecution(query: string, database: string, result: AthenaQueryResult) {
  const current = getLiveExecutions();
  const entry: StoredLiveExecution = {
    id: crypto.randomUUID(),
    query,
    database,
    timestamp: new Date().toISOString(),
    executionTimeMs: result.executionTimeMs,
    dataScannedBytes: result.dataScannedBytes,
    state: result.state,
  };

  writeSessionJson(LIVE_EXECUTIONS_KEY, [entry, ...current].slice(0, 50));
}

export function getDashboardStats(): DashboardStats {
  const analyses = getAnalysisEntries();

  if (analyses.length === 0) {
    return {
      queriesAnalyzed: 0,
      totalSavingsUsd: 0,
      avgReductionPercent: 0,
      avgTimeSavedSeconds: 0,
    };
  }

  const totals = analyses.reduce(
    (acc, entry) => {
      const original = entry.result.originalEstimate;
      const optimized = entry.result.optimizedEstimate;
      const costSaved = Math.max(original.costUSD - optimized.costUSD, 0);
      const timeSaved = Math.max(original.estimatedTimeSeconds - optimized.estimatedTimeSeconds, 0);
      const reduction = original.dataScannedGB > 0
        ? ((original.dataScannedGB - optimized.dataScannedGB) / original.dataScannedGB) * 100
        : 0;

      acc.totalSavingsUsd += costSaved;
      acc.totalTimeSavedSeconds += timeSaved;
      acc.totalReductionPercent += reduction;
      return acc;
    },
    { totalSavingsUsd: 0, totalTimeSavedSeconds: 0, totalReductionPercent: 0 }
  );

  return {
    queriesAnalyzed: analyses.length,
    totalSavingsUsd: totals.totalSavingsUsd,
    avgReductionPercent: totals.totalReductionPercent / analyses.length,
    avgTimeSavedSeconds: totals.totalTimeSavedSeconds / analyses.length,
  };
}

export function getProfileStats(): ProfileStats {
  const analyses = getAnalysisEntries();
  const liveExecutions = getLiveExecutions();
  const today = new Date();

  const queriesToday = analyses.filter((entry) => sameLocalDay(entry.timestamp, today)).length
    + liveExecutions.filter((entry) => sameLocalDay(entry.timestamp, today)).length;

  const executionTimes = [
    ...analyses
      .map((entry) => entry.result.originalEstimate.estimatedTimeSeconds)
      .filter((seconds) => seconds > 0)
      .map((seconds) => seconds * 1000),
    ...liveExecutions.map((entry) => entry.executionTimeMs).filter((ms) => ms > 0),
  ];

  const reductions = analyses
    .filter((entry) => entry.result.originalEstimate.dataScannedGB > 0)
    .map((entry) => {
      const { originalEstimate, optimizedEstimate } = entry.result;
      return ((originalEstimate.dataScannedGB - optimizedEstimate.dataScannedGB) / originalEstimate.dataScannedGB) * 100;
    });

  return {
    queriesToday,
    avgExecutionTimeMs: executionTimes.length
      ? executionTimes.reduce((sum, value) => sum + value, 0) / executionTimes.length
      : 0,
    avgEfficiencyPercent: reductions.length
      ? reductions.reduce((sum, value) => sum + value, 0) / reductions.length
      : 0,
  };
}