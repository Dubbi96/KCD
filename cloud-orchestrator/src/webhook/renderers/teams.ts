/**
 * Microsoft Teams Renderer — Adaptive Card v1.4
 * Katab_Stack과 동일한 한국어 포맷
 * Power Automate 호환 (Table 미사용, contentUrl 미사용)
 */
import { buildTitle, truncate, formatDuration, statusPrefix, shortLabel } from './types';

export function renderTeams(
  eventType: string,
  payload: any,
  dashboardUrl: string,
): any {
  const title = buildTitle(eventType, payload);

  const bodyItems: any[] = [
    {
      type: 'TextBlock',
      text: title,
      weight: 'Bolder',
      size: 'Medium',
    },
  ];

  // ─── Run 이벤트 ─────────────────────────────────────
  if (payload.run && !payload.scenario) {
    const r = payload.run;
    const facts: { title: string; value: string }[] = [
      { title: '모드', value: r.mode || '-' },
      { title: '플랫폼', value: r.platform || '-' },
      { title: '결과', value: `${r.passedCount ?? 0} passed / ${r.failedCount ?? 0} failed (${r.scenarioCount ?? 0})` },
      { title: '소요', value: formatDuration(r.durationMs) },
    ];
    if (r.error) {
      facts.push({ title: '오류', value: truncate(r.error, 300) });
    }
    bodyItems.push({ type: 'FactSet', facts });

    // 시나리오별 결과
    if (payload.scenarios && Array.isArray(payload.scenarios) && payload.scenarios.length > 0) {
      bodyItems.push({
        type: 'TextBlock',
        text: '시나리오별 결과',
        weight: 'Bolder',
        size: 'Small',
        spacing: 'Medium',
      });

      const scenarioFacts = payload.scenarios.map((s: any) => {
        const prefix = statusPrefix(s.status);
        const label = shortLabel(s);
        const dur = formatDuration(s.durationMs);
        const url = s.reportUrl || (s.reportPath ? `${dashboardUrl}/reports/${s.reportPath}` : '');
        const link = url ? ` · [리포트](${url})` : '';
        return { title: prefix, value: `${label} · ${dur}${link}` };
      });
      bodyItems.push({ type: 'FactSet', facts: scenarioFacts });

      // 실패 상세
      const failedScenarios = payload.scenarios.filter((s: any) => s.status !== 'passed' && s.error);
      if (failedScenarios.length > 0) {
        bodyItems.push({
          type: 'TextBlock',
          text: '실패 상세',
          weight: 'Bolder',
          size: 'Small',
          spacing: 'Medium',
        });
        for (const s of failedScenarios.slice(0, 5)) {
          bodyItems.push({
            type: 'TextBlock',
            text: `**${shortLabel(s)}**: ${truncate(s.error, 200)}`,
            wrap: true,
            size: 'Small',
          });
        }
      }
    }
  }

  // ─── 시나리오 이벤트 ────────────────────────────────
  if (payload.scenarioId || payload.scenario) {
    const s = payload.scenario || payload;
    const facts: { title: string; value: string }[] = [
      { title: '시나리오', value: s.scenarioName || s.scenarioId || '-' },
      { title: '상태', value: s.status || '-' },
    ];
    if (s.durationMs != null) {
      facts.push({ title: '소요 시간', value: formatDuration(s.durationMs) });
    }
    if (s.error) {
      facts.push({ title: '오류', value: truncate(s.error, 300) });
    }
    bodyItems.push({ type: 'FactSet', facts });
  }

  // 링크
  const links: string[] = [];
  if (payload.reportUrl) {
    links.push(`[리포트 보기](${payload.reportUrl})`);
  }
  const runUrl = payload.run?.id ? `${dashboardUrl}/runs/${payload.run.id}` : dashboardUrl;
  links.push(`[대시보드 열기](${runUrl})`);
  bodyItems.push({
    type: 'TextBlock',
    text: links.join(' · '),
    spacing: 'Medium',
  });

  // 타임스탬프
  bodyItems.push({
    type: 'TextBlock',
    text: `Katab Cloud | ${payload.timestamp || new Date().toISOString()}`,
    size: 'Small',
    isSubtle: true,
    spacing: 'Small',
  });

  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: bodyItems,
        },
      },
    ],
  };
}
