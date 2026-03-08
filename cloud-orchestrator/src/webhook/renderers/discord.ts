/**
 * Discord Renderer — Embed 형식
 * Katab_Stack과 동일한 한국어 포맷
 */
import { buildTitle, statusKey, STATUS_COLORS, truncate, formatDuration, statusPrefix, shortLabel } from './types';

function hexToInt(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

export function renderDiscord(
  eventType: string,
  payload: any,
  dashboardUrl: string,
): any {
  const color = hexToInt(STATUS_COLORS[statusKey(eventType)]);
  const title = buildTitle(eventType, payload);

  const embed: Record<string, any> = {
    title,
    color,
    timestamp: payload.timestamp || new Date().toISOString(),
    footer: { text: 'Katab Cloud' },
  };

  if (payload.reportUrl) {
    embed.url = payload.reportUrl;
  }

  // ─── Run 이벤트 ─────────────────────────────────────
  if (payload.run && !payload.scenario) {
    const r = payload.run;
    embed.fields = [
      { name: '모드', value: r.mode || '-', inline: true },
      { name: '플랫폼', value: r.platform || '-', inline: true },
      { name: '결과', value: `${r.passedCount ?? 0} passed / ${r.failedCount ?? 0} failed (${r.scenarioCount ?? 0})`, inline: true },
      { name: '소요', value: formatDuration(r.durationMs), inline: true },
    ];
    if (r.error) {
      embed.fields.push({ name: '오류', value: truncate(r.error, 1024), inline: false });
    }
    embed.description = `Run \`${r.id?.slice(0, 8) || '-'}\``;

    // 시나리오별 결과
    if (payload.scenarios && Array.isArray(payload.scenarios) && payload.scenarios.length > 0) {
      const lines: string[] = payload.scenarios.map((s: any) => {
        const prefix = statusPrefix(s.status);
        const label = shortLabel(s);
        const dur = formatDuration(s.durationMs);
        const url = s.reportUrl || (s.reportPath ? `${dashboardUrl}/reports/${s.reportPath}` : '');
        const link = url ? ` [리포트](${url})` : '';
        return `${prefix} **${label}** · ${dur}${link}`;
      });

      // Discord embed field value 1024자 제한 → 분할
      let fieldIdx = 0;
      let current = '';
      for (const line of lines) {
        if (current.length + line.length + 1 > 1020) {
          embed.fields.push({
            name: fieldIdx === 0 ? '시나리오별 결과' : '(계속)',
            value: current,
            inline: false,
          });
          current = '';
          fieldIdx++;
        }
        current += line + '\n';
      }
      if (current.trim()) {
        embed.fields.push({
          name: fieldIdx === 0 ? '시나리오별 결과' : '(계속)',
          value: current,
          inline: false,
        });
      }

      // 실패 상세
      const failedScenarios = payload.scenarios.filter((s: any) => s.status !== 'passed' && s.error);
      if (failedScenarios.length > 0) {
        const errorLines = failedScenarios.slice(0, 5).map((s: any) =>
          `**${shortLabel(s)}**: ${truncate(s.error, 150)}`,
        );
        embed.fields.push({
          name: '실패 상세',
          value: truncate(errorLines.join('\n'), 1024),
          inline: false,
        });
      }
    }
  }

  // ─── 시나리오 이벤트 ────────────────────────────────
  if (payload.scenarioId || payload.scenario) {
    const s = payload.scenario || payload;
    embed.fields = [
      { name: '시나리오', value: s.scenarioName || s.scenarioId || '-', inline: true },
      { name: '상태', value: s.status || '-', inline: true },
    ];
    if (s.durationMs != null) {
      embed.fields.push({ name: '소요 시간', value: formatDuration(s.durationMs), inline: true });
    }
    if (s.error) {
      embed.fields.push({ name: '오류', value: truncate(s.error, 1024), inline: false });
    }
  }

  return { embeds: [embed] };
}
