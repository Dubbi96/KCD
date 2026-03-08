/**
 * Webhook Renderer 공통 타입 및 유틸
 * Katab_Stack과 동일한 포맷
 */

export const STATUS_COLORS: Record<string, string> = {
  passed: '#22c55e',
  completed: '#22c55e',
  created: '#3b82f6',
  started: '#f59e0b',
  running: '#f59e0b',
  failed: '#ef4444',
  cancelled: '#6b7280',
  skipped: '#6b7280',
  scheduled: '#f59e0b',
  exhausted: '#ef4444',
};

/** 이벤트 타입 → 한국어 제목 */
export function eventTitle(eventType: string): string {
  const titles: Record<string, string> = {
    'run.created': '실행 생성',
    'run.started': '실행 시작',
    'run.completed': '실행 완료',
    'run.failed': '실행 실패',
    'run.cancelled': '실행 취소',
    'scenario.started': '시나리오 시작',
    'scenario.passed': '시나리오 성공',
    'scenario.failed': '시나리오 실패',
    'scenario.skipped': '시나리오 건너뜀',
    'test.ping': '테스트 핑',
  };
  return titles[eventType] || eventType;
}

export function buildTitle(eventType: string, payload: any): string {
  const base = eventTitle(eventType);
  const name = payload.run?.name || payload.scenario?.name || payload.scenario?.scenarioId;
  if (!name) return base;
  return `${base} [${name}]`;
}

/** 시나리오 상태 → 한국어 */
export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    passed: '성공',
    failed: '실패',
    infra_failed: '인프라 실패',
    skipped: '건너뜀',
    running: '실행 중',
    queued: '대기 중',
    pending: '대기',
    completed: '완료',
    cancelled: '취소',
  };
  return labels[status] || status;
}

/** 이벤트 타입에서 상태 키 추출 */
export function statusKey(eventType: string): string {
  const suffix = eventType.split('.').pop() || '';
  return suffix in STATUS_COLORS ? suffix : 'created';
}

/** 문자열 truncate */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

/** duration(ms) → 사람이 읽을 수 있는 포맷 */
export function formatDuration(ms?: number | null): string {
  if (ms == null) return '-';
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${min}m ${sec}s`;
}

/** 상태 접두사 */
export function statusPrefix(status: string): string {
  if (status === 'passed') return '[PASS]';
  if (status === 'failed' || status === 'infra_failed') return '[FAIL]';
  if (status === 'skipped') return '[SKIP]';
  return '[-]';
}

/** scenarioId 짧은 라벨 */
export function shortLabel(s: any): string {
  if (s.scenarioName) return s.scenarioName;
  return (s.scenarioId || '-').slice(0, 8);
}
