export function renderTeams(
  eventType: string,
  payload: any,
  dashboardUrl: string,
): any {
  const title = eventType.replace('.', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const facts: { title: string; value: string }[] = [];

  if (payload.runId) {
    facts.push({ title: 'Run', value: payload.runId });
  }
  if (payload.scenarioId) {
    facts.push({ title: 'Scenario', value: payload.scenarioName ?? payload.scenarioId });
  }
  if (payload.status) {
    facts.push({ title: 'Status', value: payload.status });
  }
  if (payload.duration !== undefined) {
    facts.push({ title: 'Duration', value: `${payload.duration}ms` });
  }

  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            {
              type: 'TextBlock',
              text: `Katab: ${title}`,
              weight: 'Bolder',
              size: 'Medium',
            },
            {
              type: 'FactSet',
              facts,
            },
          ],
          actions: [
            {
              type: 'Action.OpenUrl',
              title: 'Open Dashboard',
              url: dashboardUrl,
            },
          ],
        },
      },
    ],
  };
}
