/**
 * Generic Renderer — Canonical payload passthrough
 * Katab_Stack 호환 포맷
 */
export function renderGeneric(
  eventType: string,
  payload: any,
  dashboardUrl: string,
): any {
  const links: Record<string, any> = {
    dashboard: dashboardUrl,
  };

  if (payload.run?.id) {
    links.run = `${dashboardUrl}/runs/${payload.run.id}`;
  }
  if (payload.reportUrl) {
    links.report = payload.reportUrl;
  }

  // 시나리오별 리포트 URL
  if (payload.scenarios && Array.isArray(payload.scenarios)) {
    const scenarioReports: Record<string, string> = {};
    for (const s of payload.scenarios) {
      if (s.scenarioId && s.reportUrl) {
        scenarioReports[s.scenarioId] = s.reportUrl;
      }
    }
    if (Object.keys(scenarioReports).length > 0) {
      links.scenarioReports = scenarioReports;
    }
  }

  return {
    event: eventType,
    timestamp: payload.timestamp || new Date().toISOString(),
    data: payload,
    _links: links,
  };
}
