/**
 * Slack Renderer — Block Kit 형식
 * Katab_Stack과 동일한 한국어 포맷
 */
import { buildTitle, statusKey, STATUS_COLORS, truncate, formatDuration, statusPrefix, shortLabel } from './types';

export function renderSlack(
  eventType: string,
  payload: any,
  dashboardUrl: string,
): any {
  const color = STATUS_COLORS[statusKey(eventType)];
  const title = buildTitle(eventType, payload);

  const blocks: any[] = [];

  // 헤더
  blocks.push({
    type: 'header',
    text: { type: 'plain_text', text: title, emoji: false },
  });

  // ─── Run 이벤트 ─────────────────────────────────────
  if (payload.run && !payload.scenario) {
    const r = payload.run;
    const fields: any[] = [
      { type: 'mrkdwn', text: `*모드:* ${r.mode || '-'}` },
      { type: 'mrkdwn', text: `*플랫폼:* ${r.platform || '-'}` },
      { type: 'mrkdwn', text: `*성공/실패:* ${r.passedCount ?? 0}/${r.failedCount ?? 0} (${r.scenarioCount ?? 0}개)` },
      { type: 'mrkdwn', text: `*소요:* ${formatDuration(r.durationMs)}` },
    ];
    blocks.push({ type: 'section', fields });

    if (r.error) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*오류:*\n\`\`\`${truncate(r.error, 2000)}\`\`\`` },
      });
    }

    // 시나리오별 결과
    if (payload.scenarios && Array.isArray(payload.scenarios) && payload.scenarios.length > 0) {
      blocks.push({ type: 'divider' });

      const lines: string[] = payload.scenarios.map((s: any) => {
        const prefix = statusPrefix(s.status);
        const label = shortLabel(s);
        const dur = formatDuration(s.durationMs);
        const url = s.reportUrl || (s.reportPath ? `${dashboardUrl}/reports/${s.reportPath}` : '');
        const link = url ? ` <${url}|리포트>` : '';
        return `${prefix} *${label}* · ${dur}${link}`;
      });

      // 3000자 제한에 맞춰 블록 분할
      let current = '*시나리오별 결과:*\n';
      for (const line of lines) {
        if (current.length + line.length + 1 > 2900) {
          blocks.push({ type: 'section', text: { type: 'mrkdwn', text: current } });
          current = '';
        }
        current += line + '\n';
      }
      if (current.trim()) {
        blocks.push({ type: 'section', text: { type: 'mrkdwn', text: current } });
      }

      // 실패 상세
      const failedScenarios = payload.scenarios.filter((s: any) => s.status !== 'passed' && s.error);
      if (failedScenarios.length > 0) {
        const errorLines = failedScenarios.slice(0, 5).map((s: any) =>
          `*${shortLabel(s)}:* ${truncate(s.error, 200)}`,
        );
        blocks.push({
          type: 'section',
          text: { type: 'mrkdwn', text: `*실패 상세:*\n${truncate(errorLines.join('\n'), 2900)}` },
        });
      }
    }
  }

  // ─── 시나리오 이벤트 ────────────────────────────────
  if (payload.scenarioId || payload.scenario) {
    const s = payload.scenario || payload;
    const fields: any[] = [
      { type: 'mrkdwn', text: `*시나리오:* ${s.scenarioName || s.scenarioId || '-'}` },
      { type: 'mrkdwn', text: `*상태:* ${s.status || '-'}` },
    ];
    if (s.durationMs != null) {
      fields.push({ type: 'mrkdwn', text: `*소요 시간:* ${formatDuration(s.durationMs)}` });
    }
    blocks.push({ type: 'section', fields });
    if (s.error) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*오류:*\n\`\`\`${truncate(s.error, 2000)}\`\`\`` },
      });
    }
  }

  blocks.push({ type: 'divider' });

  // 액션 버튼
  const actionElements: any[] = [];
  if (payload.reportUrl) {
    actionElements.push({
      type: 'button',
      text: { type: 'plain_text', text: '리포트 보기', emoji: false },
      url: payload.reportUrl,
      style: 'primary',
    });
  }
  actionElements.push({
    type: 'button',
    text: { type: 'plain_text', text: '대시보드 열기', emoji: false },
    url: payload.run?.id ? `${dashboardUrl}/runs/${payload.run.id}` : dashboardUrl,
  });
  blocks.push({ type: 'actions', elements: actionElements });

  // 타임스탬프
  blocks.push({
    type: 'context',
    elements: [
      { type: 'mrkdwn', text: `Katab Cloud | ${payload.timestamp || new Date().toISOString()}` },
    ],
  });

  return {
    blocks,
    attachments: [{ color }],
  };
}
