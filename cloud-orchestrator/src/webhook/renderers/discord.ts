const EVENT_COLORS: Record<string, number> = {
  'run.completed': 0x2ecc71,
  'run.created': 0x3498db,
  'run.failed': 0xe74c3c,
  'scenario.started': 0x3498db,
  'scenario.passed': 0x2ecc71,
  'scenario.failed': 0xe74c3c,
};

export function renderDiscord(
  eventType: string,
  payload: any,
  dashboardUrl: string,
): any {
  const color = EVENT_COLORS[eventType] ?? 0x95a5a6;
  const title = eventType.replace('.', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const fields: { name: string; value: string; inline?: boolean }[] = [];

  if (payload.runId) {
    fields.push({ name: 'Run', value: payload.runId, inline: true });
  }
  if (payload.scenarioId) {
    fields.push({ name: 'Scenario', value: payload.scenarioName ?? payload.scenarioId, inline: true });
  }
  if (payload.status) {
    fields.push({ name: 'Status', value: payload.status, inline: true });
  }
  if (payload.duration !== undefined) {
    fields.push({ name: 'Duration', value: `${payload.duration}ms`, inline: true });
  }

  return {
    embeds: [
      {
        title: `Katab: ${title}`,
        color,
        fields,
        url: dashboardUrl,
        timestamp: new Date().toISOString(),
        footer: { text: 'Katab Cloud' },
      },
    ],
  };
}
