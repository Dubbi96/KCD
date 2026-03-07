const API_BASE = '/api/v1';

const PUBLIC_PATHS = ['/auth/sign-in', '/auth/sign-up'];

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token');
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(!isPublic && token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (res.status === 401 && !isPublic) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('tenant');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || res.statusText);
  }
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text);
}

export const api = {
  // Auth
  signUp: (data: { email: string; password: string; name: string; tenantName: string }) =>
    request<any>('/auth/sign-up', { method: 'POST', body: JSON.stringify(data) }),
  signIn: (data: { email: string; password: string }) =>
    request<any>('/auth/sign-in', { method: 'POST', body: JSON.stringify(data) }),

  // Account
  getTenant: () => request<any>('/account/tenant'),
  getMembers: () => request<any[]>('/account/members'),
  getRunners: () => request<any[]>('/account/runners'),
  createRunner: (data: { name: string; platform: 'web' | 'ios' | 'android' }) =>
    request<any>('/account/runners', { method: 'POST', body: JSON.stringify(data) }),
  deleteRunner: (id: string) =>
    request<any>(`/account/runners/${id}`, { method: 'DELETE' }),
  startRunner: (id: string) =>
    request<any>(`/account/runners/${id}/start`, { method: 'POST' }),
  stopRunner: (id: string) =>
    request<any>(`/account/runners/${id}/stop`, { method: 'POST' }),
  restartRunner: (id: string) =>
    request<any>(`/account/runners/${id}/restart`, { method: 'POST' }),
  getRunnerProcesses: () =>
    request<any[]>('/account/runners/processes'),

  // Scenarios — CRUD
  getScenarios: (platform?: string, folderId?: string) => {
    const params = new URLSearchParams();
    if (platform) params.set('platform', platform);
    if (folderId) params.set('folderId', folderId);
    const qs = params.toString();
    return request<any[]>(`/scenarios${qs ? `?${qs}` : ''}`);
  },
  getScenario: (id: string) => request<any>(`/scenarios/${id}`),
  createScenario: (data: any) =>
    request<any>('/scenarios', { method: 'POST', body: JSON.stringify(data) }),
  updateScenario: (id: string, data: any) =>
    request<any>(`/scenarios/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteScenario: (id: string) =>
    request<void>(`/scenarios/${id}`, { method: 'DELETE' }),
  cloneScenario: (id: string, name?: string) =>
    request<any>(`/scenarios/${id}/clone`, { method: 'POST', body: JSON.stringify({ name }) }),

  // Scenarios — Step Editing
  insertStep: (id: string, afterIndex: number, event: any) =>
    request<any>(`/scenarios/${id}/step`, { method: 'POST', body: JSON.stringify({ afterIndex, event }) }),
  updateStep: (id: string, idx: number, updates: any) =>
    request<any>(`/scenarios/${id}/step/${idx}`, { method: 'PUT', body: JSON.stringify(updates) }),
  deleteStep: (id: string, idx: number) =>
    request<any>(`/scenarios/${id}/step/${idx}`, { method: 'DELETE' }),
  moveStep: (id: string, idx: number, toIndex: number) =>
    request<any>(`/scenarios/${id}/step/${idx}/move`, { method: 'POST', body: JSON.stringify({ toIndex }) }),
  duplicateStep: (id: string, idx: number) =>
    request<any>(`/scenarios/${id}/step/${idx}/duplicate`, { method: 'POST' }),
  toggleStep: (id: string, idx: number) =>
    request<any>(`/scenarios/${id}/step/${idx}/toggle`, { method: 'POST' }),
  convertStepType: (id: string, idx: number, newType: string) =>
    request<any>(`/scenarios/${id}/step/${idx}/convert`, { method: 'POST', body: JSON.stringify({ newType }) }),

  // Scenarios — Assertions
  addAssertion: (id: string, idx: number, assertion: any) =>
    request<any>(`/scenarios/${id}/step/${idx}/assertion`, { method: 'POST', body: JSON.stringify(assertion) }),
  removeAssertion: (id: string, stepIdx: number, assertionIdx: number) =>
    request<any>(`/scenarios/${id}/step/${stepIdx}/assertion/${assertionIdx}`, { method: 'DELETE' }),

  // Scenarios — Variables & Metadata
  setVariables: (id: string, variables: Record<string, string>) =>
    request<any>(`/scenarios/${id}/variables`, { method: 'POST', body: JSON.stringify(variables) }),
  setTcId: (id: string, tcId: string) =>
    request<any>(`/scenarios/${id}/tcid`, { method: 'POST', body: JSON.stringify({ tcId }) }),

  // Scenarios — Block Operations
  wrapBlock: (id: string, startIdx: number, endIdx: number, name: string) =>
    request<any>(`/scenarios/${id}/block/wrap`, { method: 'POST', body: JSON.stringify({ startIdx, endIdx, name }) }),
  unwrapBlock: (id: string, blockId: string) =>
    request<any>(`/scenarios/${id}/block/unwrap`, { method: 'POST', body: JSON.stringify({ blockId }) }),

  // Scenarios — Bulk Operations
  bulkToggle: (id: string, indices: number[], disabled: boolean) =>
    request<any>(`/scenarios/${id}/bulk/toggle`, { method: 'POST', body: JSON.stringify({ indices, disabled }) }),
  bulkDelete: (id: string, indices: number[]) =>
    request<any>(`/scenarios/${id}/bulk/delete`, { method: 'POST', body: JSON.stringify({ indices }) }),

  // Scenarios — Validate & Optimize & Flow Graph
  validateScenario: (id: string) =>
    request<any>(`/scenarios/${id}/validate`, { method: 'POST' }),
  optimizeScenario: (id: string) =>
    request<any>(`/scenarios/${id}/optimize`, { method: 'POST' }),
  getFlowGraph: (id: string) =>
    request<any>(`/scenarios/${id}/flow-graph`),

  // Schedules
  getSchedules: () => request<any[]>('/schedules'),
  getSchedule: (id: string) => request<any>(`/schedules/${id}`),
  createSchedule: (data: any) =>
    request<any>('/schedules', { method: 'POST', body: JSON.stringify(data) }),
  updateSchedule: (id: string, data: any) =>
    request<any>(`/schedules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSchedule: (id: string) =>
    request<void>(`/schedules/${id}`, { method: 'DELETE' }),
  getPlannedRuns: (scheduleId: string) =>
    request<any[]>(`/schedules/${scheduleId}/planned-runs`),
  cronPreview: (data: { cronExpr: string; count?: number; timezone?: string }) =>
    request<any>('/schedules/cron-preview', { method: 'POST', body: JSON.stringify(data) }),
  runScheduleNow: (id: string) =>
    request<any>(`/schedules/${id}/run-now`, { method: 'POST' }),

  // Runs
  getRuns: (limit = 20, offset = 0) =>
    request<{ runs: any[]; total: number }>(`/runs?limit=${limit}&offset=${offset}`),
  getRun: (id: string) => request<any>(`/runs/${id}`),
  createRun: (data: any) =>
    request<any>('/runs', { method: 'POST', body: JSON.stringify(data) }),
  cancelRun: (id: string) =>
    request<any>(`/runs/${id}/cancel`, { method: 'POST' }),
  getQueueStats: () => request<any[]>('/runs/queue-stats'),
  getQueueJobs: (platform: string, status = 'waiting', start = 0, end = 19) =>
    request<any[]>(`/runs/queue/${platform}/jobs?status=${status}&start=${start}&end=${end}`),
  retryJob: (platform: string, jobId: string) =>
    request<any>(`/runs/queue/${platform}/jobs/${jobId}/retry`, { method: 'POST' }),
  removeJob: (platform: string, jobId: string) =>
    request<any>(`/runs/queue/${platform}/jobs/${jobId}`, { method: 'DELETE' }),

  // Devices
  getDevices: () => request<any[]>('/devices'),
  getDeviceSessions: () => request<any[]>('/devices/sessions'),
  createDeviceSession: (data: any) =>
    request<any>('/devices/sessions', { method: 'POST', body: JSON.stringify(data) }),
  createWebSession: (data: { url: string; fps?: number; deviceType?: string; recordingConfig?: any }) =>
    request<any>('/devices/web-session', { method: 'POST', body: JSON.stringify(data) }),
  getDeviceSession: (id: string) => request<any>(`/devices/sessions/${id}`),
  closeDeviceSession: (id: string) =>
    request<any>(`/devices/sessions/${id}`, { method: 'DELETE' }),
  saveRecording: (sessionId: string, data: { events: any[]; name?: string; tags?: string[] }) =>
    request<any>(`/devices/sessions/${sessionId}/save-recording`, { method: 'POST', body: JSON.stringify(data) }),

  // Auth Profiles
  getAuthProfiles: () => request<any[]>('/auth-profiles'),
  getAuthProfile: (id: string) => request<any>(`/auth-profiles/${id}`),
  createAuthProfile: (data: any) =>
    request<any>('/auth-profiles', { method: 'POST', body: JSON.stringify(data) }),
  updateAuthProfile: (id: string, data: any) =>
    request<any>(`/auth-profiles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAuthProfile: (id: string) =>
    request<void>(`/auth-profiles/${id}`, { method: 'DELETE' }),

  // Folders
  getFolders: () => request<any[]>('/folders'),
  createFolder: (data: { name: string; parentId?: string }) =>
    request<any>('/folders', { method: 'POST', body: JSON.stringify(data) }),
  updateFolder: (id: string, data: any) =>
    request<any>(`/folders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteFolder: (id: string) =>
    request<void>(`/folders/${id}`, { method: 'DELETE' }),

  // Groups
  getGroups: () => request<any[]>('/groups'),
  getGroup: (id: string) => request<any>(`/groups/${id}`),
  createGroup: (data: any) =>
    request<any>('/groups', { method: 'POST', body: JSON.stringify(data) }),
  updateGroup: (id: string, data: any) =>
    request<any>(`/groups/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteGroup: (id: string) =>
    request<void>(`/groups/${id}`, { method: 'DELETE' }),
  runGroup: (id: string, data?: { platform?: string; runnerId?: string }) =>
    request<any>(`/groups/${id}/run`, { method: 'POST', body: JSON.stringify(data || {}) }),

  // Streams
  getStreams: () => request<any[]>('/streams'),
  getStream: (id: string) => request<any>(`/streams/${id}`),
  createStream: (data: any) =>
    request<any>('/streams', { method: 'POST', body: JSON.stringify(data) }),
  updateStream: (id: string, data: any) =>
    request<any>(`/streams/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteStream: (id: string) =>
    request<void>(`/streams/${id}`, { method: 'DELETE' }),
  runStream: (id: string, data?: { platform?: string; runnerId?: string }) =>
    request<any>(`/streams/${id}/run`, { method: 'POST', body: JSON.stringify(data || {}) }),

  // Webhooks
  getWebhooks: () => request<any[]>('/webhooks'),
  createWebhook: (data: any) =>
    request<any>('/webhooks', { method: 'POST', body: JSON.stringify(data) }),
  updateWebhook: (id: string, data: any) =>
    request<any>(`/webhooks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteWebhook: (id: string) =>
    request<void>(`/webhooks/${id}`, { method: 'DELETE' }),
  testWebhook: (id: string) =>
    request<any>(`/webhooks/${id}/test`, { method: 'POST' }),
  getWebhookEvents: (id: string, limit = 20, offset = 0) =>
    request<any>(`/webhooks/${id}/events?limit=${limit}&offset=${offset}`),

  // Run Control
  pauseRun: (id: string) =>
    request<any>(`/runs/${id}/pause`, { method: 'POST' }),
  resumeRun: (id: string) =>
    request<any>(`/runs/${id}/resume`, { method: 'POST' }),

  // Test Data Profiles
  getTestDataProfiles: () => request<any[]>('/test-data'),
  getTestDataProfile: (id: string) => request<any>(`/test-data/${id}`),
  createTestDataProfile: (data: any) =>
    request<any>('/test-data', { method: 'POST', body: JSON.stringify(data) }),
  updateTestDataProfile: (id: string, data: any) =>
    request<any>(`/test-data/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTestDataProfile: (id: string) =>
    request<void>(`/test-data/${id}`, { method: 'DELETE' }),

  // Scenario Export & Includes
  exportScenario: (id: string) => request<any>(`/scenarios/${id}`),
  getResolvedEvents: (id: string) => request<any>(`/scenarios/${id}/resolved`),
  addInclude: (id: string, data: { scenarioId: string; aliasId?: string }) =>
    request<any>(`/scenarios/${id}/includes`, { method: 'POST', body: JSON.stringify(data) }),
  removeInclude: (id: string, idx: number) =>
    request<any>(`/scenarios/${id}/includes/${idx}`, { method: 'DELETE' }),

  // Run Reports
  getRunReportJson: (id: string) => request<any>(`/runs/${id}/report/json`),
  getRunReportHtml: (id: string) =>
    fetch(`/api/v1/runs/${id}/report/html`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    }).then((r) => r.text()),

  // Partial Re-record
  createPartialRerecord: (id: string, data: { fromStep: number; toStep: number; runnerId?: string; platform?: string }) =>
    request<any>(`/scenarios/${id}/partial-rerecord`, { method: 'POST', body: JSON.stringify(data) }),
  applyPartialRerecord: (id: string, requestId: string, data: { fromStep: number; toStep: number; events: any[] }) =>
    request<any>(`/scenarios/${id}/partial-rerecord/${requestId}/apply`, { method: 'POST', body: JSON.stringify(data) }),
};
