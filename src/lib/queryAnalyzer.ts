export interface QueryIssue {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  suggestion: string;
}

export interface AnalysisResult {
  issues: QueryIssue[];
  optimizedQuery: string;
  originalEstimate: CostEstimate;
  optimizedEstimate: CostEstimate;
}

export interface CostEstimate {
  dataScannedGB: number;
  costUSD: number;
  estimatedTimeSeconds: number;
}

const ATHENA_COST_PER_TB = 5.0;

const SQL_KEYWORDS = ['SELECT', 'FROM', 'WHERE', 'JOIN', 'ON', 'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'AND', 'OR', 'NOT', 'IN', 'BETWEEN', 'LIKE', 'IS', 'NULL', 'AS', 'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'UNION', 'ALL', 'EXISTS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'WITH', 'PARTITION', 'OVER', 'ROW_NUMBER', 'RANK', 'INNER', 'LEFT', 'RIGHT', 'OUTER', 'FULL', 'CROSS', 'INTO', 'VALUES', 'SET', 'TABLE', 'INDEX', 'VIEW', 'ASC', 'DESC', 'OFFSET', 'FETCH', 'NEXT', 'ROWS', 'ONLY'];

function hasSelectStar(query: string): boolean {
  return /SELECT\s+\*/i.test(query);
}

function hasWhereClause(query: string): boolean {
  return /WHERE\s+/i.test(query);
}

function hasPartitionFilter(query: string, partitionKeys?: string[]): boolean {
  const keys = partitionKeys?.length ? partitionKeys : ['year', 'month', 'date', 'dt', 'partition', 'day'];
  const upper = query.toUpperCase();
  return keys.some(key => upper.includes(key.toUpperCase()));
}

function hasLimit(query: string): boolean {
  return /LIMIT\s+\d+/i.test(query);
}

function hasOrderByWithoutLimit(query: string): boolean {
  return /ORDER\s+BY/i.test(query) && !hasLimit(query);
}

function hasJoinWithoutCondition(query: string): boolean {
  const joinCount = (query.match(/JOIN/gi) || []).length;
  const onCount = (query.match(/\bON\b/gi) || []).length;
  return joinCount > onCount;
}

function extractTableName(query: string): string {
  const match = query.match(/FROM\s+(\S+)/i);
  return match ? match[1] : 'unknown_table';
}

export function estimateCostFromBytes(bytes: number): CostEstimate {
  const gb = bytes / (1024 ** 3);
  const costUSD = (gb / 1024) * ATHENA_COST_PER_TB;
  return {
    dataScannedGB: Math.round(gb * 1000) / 1000,
    costUSD: Math.round(costUSD * 10000) / 10000,
    estimatedTimeSeconds: 0,
  };
}

/** Analyze query using real column metadata when available */
export function analyzeQuery(
  query: string,
  realColumns?: string[],
  partitionKeys?: string[]
): AnalysisResult {
  const issues: QueryIssue[] = [];

  if (!query.trim()) {
    return {
      issues: [],
      optimizedQuery: '',
      originalEstimate: { dataScannedGB: 0, costUSD: 0, estimatedTimeSeconds: 0 },
      optimizedEstimate: { dataScannedGB: 0, costUSD: 0, estimatedTimeSeconds: 0 },
    };
  }

  if (hasSelectStar(query)) {
    const colList = realColumns?.length ? realColumns.slice(0, 6).join(', ') : 'specific columns';
    issues.push({
      id: 'select-star',
      severity: 'critical',
      title: 'SELECT * Detected',
      description: 'Using SELECT * scans all columns, significantly increasing data scanned and cost.',
      suggestion: `Replace SELECT * with only the columns you need, e.g.: ${colList}`,
    });
  }

  if (!hasWhereClause(query)) {
    issues.push({
      id: 'no-where',
      severity: 'critical',
      title: 'Missing WHERE Clause',
      description: 'Without filtering, Athena scans the entire dataset.',
      suggestion: 'Add a WHERE clause to filter rows and reduce data scanned.',
    });
  }

  if (!hasPartitionFilter(query, partitionKeys)) {
    const keyHint = partitionKeys?.length ? partitionKeys.join(', ') : 'year, month, date';
    issues.push({
      id: 'no-partition',
      severity: 'warning',
      title: 'No Partition Filter',
      description: `Queries without partition filters (${keyHint}) scan all partitions.`,
      suggestion: `Add partition key filters (e.g., ${partitionKeys?.[0] || 'year'} = 2024) to minimize data scanned.`,
    });
  }

  if (!hasLimit(query) && /SELECT/i.test(query)) {
    issues.push({
      id: 'no-limit',
      severity: 'info',
      title: 'No LIMIT Clause',
      description: 'Without LIMIT, all matching rows are returned which may be unnecessary.',
      suggestion: 'Add LIMIT to restrict result set size during exploration.',
    });
  }

  if (hasOrderByWithoutLimit(query)) {
    issues.push({
      id: 'order-no-limit',
      severity: 'warning',
      title: 'ORDER BY Without LIMIT',
      description: 'Sorting entire result sets is expensive. Combine with LIMIT for top-N queries.',
      suggestion: 'Add LIMIT after ORDER BY to reduce sorting overhead.',
    });
  }

  if (hasJoinWithoutCondition(query)) {
    issues.push({
      id: 'join-no-condition',
      severity: 'critical',
      title: 'JOIN Without ON Condition',
      description: 'Missing JOIN conditions cause cartesian products, exponentially increasing data.',
      suggestion: 'Ensure every JOIN has a proper ON condition.',
    });
  }

  if (/\.csv/i.test(query) || /FORMAT\s+.*CSV/i.test(query)) {
    issues.push({
      id: 'csv-format',
      severity: 'info',
      title: 'Consider Columnar Format',
      description: 'CSV files require full row scans. Columnar formats skip unused columns.',
      suggestion: 'Convert data to Parquet or ORC format for up to 90% cost savings.',
    });
  }

  // Generate optimized query using real columns
  const optimizedQuery = generateOptimizedQuery(query, issues, realColumns, partitionKeys);

  return {
    issues,
    optimizedQuery,
    // These will be replaced by real Athena data when available
    originalEstimate: { dataScannedGB: 0, costUSD: 0, estimatedTimeSeconds: 0 },
    optimizedEstimate: { dataScannedGB: 0, costUSD: 0, estimatedTimeSeconds: 0 },
  };
}

function generateOptimizedQuery(
  query: string,
  issues: QueryIssue[],
  realColumns?: string[],
  partitionKeys?: string[]
): string {
  let optimized = query.trim();
  const table = extractTableName(query);

  if (issues.some(i => i.id === 'select-star') && realColumns?.length) {
    const cols = realColumns.slice(0, 6).join(', ');
    optimized = optimized.replace(/SELECT\s+\*/i, `SELECT ${cols}`);
  }

  if (issues.some(i => i.id === 'no-partition')) {
    const partKey = partitionKeys?.[0] || 'year';
    if (hasWhereClause(optimized)) {
      optimized = optimized.replace(/WHERE\s+/i, `WHERE ${partKey} = 2024 AND `);
    } else {
      optimized = optimized.replace(
        new RegExp(`(FROM\\s+${table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'i'),
        `$1 WHERE ${partKey} = 2024`
      );
    }
  }

  if (issues.some(i => i.id === 'no-limit') && !hasLimit(optimized)) {
    optimized = optimized.replace(/;?\s*$/, ' LIMIT 1000;');
  }

  if (!optimized.endsWith(';')) optimized += ';';
  return optimized;
}

export function highlightSQL(sql: string): string {
  let highlighted = sql.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  highlighted = highlighted.replace(/'([^']*)'/g, '<span class="sql-string">\'$1\'</span>');
  highlighted = highlighted.replace(/\b(\d+)\b/g, '<span class="sql-number">$1</span>');
  SQL_KEYWORDS.forEach(kw => {
    const regex = new RegExp(`\\b(${kw})\\b`, 'gi');
    highlighted = highlighted.replace(regex, '<span class="sql-keyword">$1</span>');
  });
  return highlighted;
}

export const SAMPLE_QUERIES = [
  { label: 'Full table scan', query: "SELECT * FROM sales;" },
  { label: 'Missing partition', query: "SELECT * FROM sales WHERE product = 'phone';" },
  { label: 'ORDER BY no LIMIT', query: "SELECT name, total FROM orders ORDER BY total DESC;" },
  { label: 'Reasonably optimized', query: "SELECT product, price, quantity FROM sales WHERE year = 2024 AND region = 'US' LIMIT 100;" },
];
