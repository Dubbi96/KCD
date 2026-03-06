const EVENT_EMOJI: Record<string, string> = {
  'run.completed': ':white_check_mark:',
  'run.created': ':rocket:',
  'run.failed': ':x:',
  'scenario.started': ':arrow_forward:',
  'scenario.passed': ':white_check_mark:',
  'scenario.failed': ':x:',
};

export function renderSlack(
  eventType: string,
  payload: any,
  dashboardUrl: string,
): any {
  const emoji = EVENT_EMOJI[eventType] ?? ':bell:';
  const title = eventType.replace('.', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const fields: { type: string; text: string }[] = [];

  if (payload.runId) {
    fields.push({ type: 'mrkdwn', text: `*Run:* ${payload.runId}` });
  }
  if (payload.scenarioId) {
    fields.push({ type: 'mrkdwn', text: `*Scenario:* ${payload.scenarioName ?? payload.scenarioId}` });
  }
  if (payload.status) {
    fields.push({ type: 'mrkdwn', text: `*Status:* ${payload.status}` });
  }
  if (payload.duration !== undefined) {
    fields.push({ type: 'mrkdwn', text: `*Duration:* ${payload.duration}ms` });
  }

  return {
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${emoji} Katab: ${title}` },
      },
      ...(fields.length > 0
        ? [{ type: 'section', fields }]
        : []),
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Open Dashboard' },
            url: dashboardUrl,
          },
        ],
      },
    ],
  };
}
