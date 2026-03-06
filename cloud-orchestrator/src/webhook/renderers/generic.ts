export function renderGeneric(
  eventType: string,
  payload: any,
  dashboardUrl: string,
): any {
  return {
    event: eventType,
    data: payload,
    _links: {
      dashboard: dashboardUrl,
      ...(payload.runId
        ? { run: `${dashboardUrl}/runs/${payload.runId}` }
        : {}),
      ...(payload.scenarioId
        ? { scenario: `${dashboardUrl}/scenarios/${payload.scenarioId}` }
        : {}),
    },
  };
}
