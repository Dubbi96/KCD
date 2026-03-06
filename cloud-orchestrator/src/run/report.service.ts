import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Run } from './run.entity';
import { ScenarioRun } from './scenario-run.entity';

interface AssertionSummary {
  total: number;
  passed: number;
  failed: number;
}

interface ScenarioResult {
  scenarioId: string;
  scenarioRunId: string;
  sequenceNo: number;
  status: string;
  durationMs: number | null;
  attempt: number;
  error: string | null;
  stepResults: any[];
  capturedVariables: Record<string, any>;
  assertionSummary: AssertionSummary;
}

export interface JsonReport {
  runId: string;
  status: string;
  mode: string;
  platform: string;
  startedAt: Date | null;
  completedAt: Date | null;
  totalDuration: number;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  scenarioResults: ScenarioResult[];
}

@Injectable()
export class ReportService {
  constructor(
    @InjectRepository(Run) private runRepo: Repository<Run>,
    @InjectRepository(ScenarioRun) private scenarioRunRepo: Repository<ScenarioRun>,
  ) {}

  async generateJsonReport(tenantId: string, runId: string): Promise<JsonReport> {
    const run = await this.runRepo.findOne({
      where: { id: runId, tenantId },
      relations: ['scenarioRuns'],
    });
    if (!run) throw new NotFoundException('Run not found');

    const scenarioRuns = (run.scenarioRuns || []).sort(
      (a, b) => a.sequenceNo - b.sequenceNo,
    );

    const scenarioResults: ScenarioResult[] = scenarioRuns.map((sr) => {
      const resultJson = sr.resultJson || {};
      const stepResults: any[] = resultJson.stepResults || [];
      const capturedVariables: Record<string, any> =
        resultJson.variables || resultJson.capturedVariables || {};

      let assertionTotal = 0;
      let assertionPassed = 0;
      let assertionFailed = 0;
      for (const step of stepResults) {
        const assertions: any[] = step.assertions || [];
        assertionTotal += assertions.length;
        assertionPassed += assertions.filter(
          (a: any) => a.status === 'passed' || a.passed === true,
        ).length;
        assertionFailed += assertions.filter(
          (a: any) => a.status === 'failed' || a.passed === false,
        ).length;
      }

      return {
        scenarioId: sr.scenarioId,
        scenarioRunId: sr.id,
        sequenceNo: sr.sequenceNo,
        status: sr.status,
        durationMs: sr.durationMs,
        attempt: sr.attempt,
        error: sr.error || null,
        stepResults,
        capturedVariables,
        assertionSummary: {
          total: assertionTotal,
          passed: assertionPassed,
          failed: assertionFailed,
        },
      };
    });

    const passed = scenarioRuns.filter((sr) => sr.status === 'passed').length;
    const failed = scenarioRuns.filter((sr) =>
      ['failed', 'infra_failed'].includes(sr.status),
    ).length;
    const skipped = scenarioRuns.filter((sr) =>
      ['skipped', 'cancelled'].includes(sr.status),
    ).length;

    let totalDuration = 0;
    if (run.startedAt && run.completedAt) {
      totalDuration =
        new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime();
    } else {
      totalDuration = scenarioRuns.reduce(
        (sum, sr) => sum + (sr.durationMs || 0),
        0,
      );
    }

    return {
      runId: run.id,
      status: run.status,
      mode: run.mode,
      platform: run.targetPlatform,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      totalDuration,
      summary: {
        total: scenarioRuns.length,
        passed,
        failed,
        skipped,
      },
      scenarioResults,
    };
  }

  async generateHtmlReport(tenantId: string, runId: string): Promise<string> {
    const report = await this.generateJsonReport(tenantId, runId);
    return this.renderHtml(report);
  }

  private renderHtml(report: JsonReport): string {
    const statusColor =
      report.status === 'completed'
        ? '#3fb950'
        : report.status === 'failed'
          ? '#f85149'
          : report.status === 'running'
            ? '#d29922'
            : '#8b949e';

    const formatDuration = (ms: number | null): string => {
      if (ms == null) return '-';
      if (ms < 1000) return `${ms}ms`;
      const seconds = (ms / 1000).toFixed(1);
      if (ms < 60000) return `${seconds}s`;
      const minutes = Math.floor(ms / 60000);
      const remainingSeconds = ((ms % 60000) / 1000).toFixed(0);
      return `${minutes}m ${remainingSeconds}s`;
    };

    const formatDate = (d: Date | null): string => {
      if (!d) return '-';
      return new Date(d).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
    };

    const escapeHtml = (str: string): string => {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    };

    const scenarioStatusIcon = (status: string): string => {
      switch (status) {
        case 'passed':
          return '<span style="color:#3fb950;">&#10003;</span>';
        case 'failed':
        case 'infra_failed':
          return '<span style="color:#f85149;">&#10007;</span>';
        case 'running':
          return '<span style="color:#d29922;">&#9679;</span>';
        case 'skipped':
        case 'cancelled':
          return '<span style="color:#8b949e;">&#8212;</span>';
        default:
          return '<span style="color:#8b949e;">&#9679;</span>';
      }
    };

    const stepStatusBadge = (status: string): string => {
      const color =
        status === 'passed'
          ? '#3fb950'
          : status === 'failed'
            ? '#f85149'
            : '#8b949e';
      return `<span style="color:${color};font-weight:600;">${escapeHtml(status)}</span>`;
    };

    const scenarioSections = report.scenarioResults
      .map((sr, idx) => {
        const stepRows = sr.stepResults
          .map((step: any, stepIdx: number) => {
            const assertionRows = (step.assertions || [])
              .map(
                (a: any) =>
                  `<div style="margin-left:24px;padding:2px 0;font-size:12px;color:${
                    a.status === 'passed' || a.passed === true
                      ? '#3fb950'
                      : '#f85149'
                  };">${
                    a.status === 'passed' || a.passed === true ? '&#10003;' : '&#10007;'
                  } ${escapeHtml(a.message || a.description || a.type || 'assertion')}</div>`,
              )
              .join('');

            return `
              <tr style="border-bottom:1px solid #21262d;">
                <td style="padding:8px 12px;color:#8b949e;">${stepIdx + 1}</td>
                <td style="padding:8px 12px;">${escapeHtml(step.type || step.action || '-')}</td>
                <td style="padding:8px 12px;font-family:monospace;font-size:12px;color:#79c0ff;">${escapeHtml(step.selector || step.target || '-')}</td>
                <td style="padding:8px 12px;">${stepStatusBadge(step.status || '-')}</td>
                <td style="padding:8px 12px;color:#8b949e;">${formatDuration(step.durationMs ?? step.duration ?? null)}</td>
              </tr>
              ${assertionRows ? `<tr><td colspan="5" style="padding:0 0 8px 0;">${assertionRows}</td></tr>` : ''}`;
          })
          .join('');

        const errorBlock = sr.error
          ? `<div style="margin-top:12px;padding:12px;background:#2d1215;border:1px solid #f8514933;border-radius:6px;color:#f85149;font-family:monospace;font-size:13px;white-space:pre-wrap;">${escapeHtml(sr.error)}</div>`
          : '';

        const variableEntries = Object.entries(sr.capturedVariables);
        const variablesBlock =
          variableEntries.length > 0
            ? `<div style="margin-top:12px;">
                <div style="font-size:13px;color:#8b949e;margin-bottom:6px;">Captured Variables</div>
                <div style="background:#161b22;border:1px solid #30363d;border-radius:6px;padding:8px 12px;font-family:monospace;font-size:12px;">
                  ${variableEntries
                    .map(
                      ([k, v]) =>
                        `<div><span style="color:#79c0ff;">${escapeHtml(k)}</span><span style="color:#8b949e;"> = </span><span style="color:#a5d6ff;">${escapeHtml(typeof v === 'string' ? v : JSON.stringify(v))}</span></div>`,
                    )
                    .join('')}
                </div>
              </div>`
            : '';

        return `
          <details style="margin-bottom:8px;" ${idx === 0 ? 'open' : ''}>
            <summary style="cursor:pointer;padding:14px 16px;background:#161b22;border:1px solid #30363d;border-radius:6px;display:flex;align-items:center;gap:10px;list-style:none;user-select:none;">
              <span style="font-size:16px;">${scenarioStatusIcon(sr.status)}</span>
              <span style="flex:1;">
                <span style="font-weight:600;color:#e6edf3;">Scenario #${sr.sequenceNo + 1}</span>
                <span style="color:#8b949e;margin-left:8px;font-size:13px;">${escapeHtml(sr.scenarioId)}</span>
              </span>
              <span style="color:#8b949e;font-size:13px;">Attempt ${sr.attempt}</span>
              <span style="color:#8b949e;font-size:13px;margin-left:8px;">${formatDuration(sr.durationMs)}</span>
              <span style="font-size:12px;padding:2px 8px;border-radius:12px;background:${
                sr.assertionSummary.failed > 0 ? '#f8514933' : '#3fb95033'
              };color:${
                sr.assertionSummary.failed > 0 ? '#f85149' : '#3fb950'
              };">${sr.assertionSummary.passed}/${sr.assertionSummary.total} assertions</span>
            </summary>
            <div style="padding:16px;background:#0d1117;border:1px solid #30363d;border-top:none;border-radius:0 0 6px 6px;">
              ${
                sr.stepResults.length > 0
                  ? `<table style="width:100%;border-collapse:collapse;font-size:13px;">
                      <thead>
                        <tr style="border-bottom:2px solid #30363d;text-align:left;">
                          <th style="padding:8px 12px;color:#8b949e;font-weight:500;width:50px;">#</th>
                          <th style="padding:8px 12px;color:#8b949e;font-weight:500;">Type</th>
                          <th style="padding:8px 12px;color:#8b949e;font-weight:500;">Selector</th>
                          <th style="padding:8px 12px;color:#8b949e;font-weight:500;">Status</th>
                          <th style="padding:8px 12px;color:#8b949e;font-weight:500;">Duration</th>
                        </tr>
                      </thead>
                      <tbody>${stepRows}</tbody>
                    </table>`
                  : '<div style="color:#8b949e;font-size:13px;padding:8px;">No step results recorded.</div>'
              }
              ${errorBlock}
              ${variablesBlock}
            </div>
          </details>`;
      })
      .join('');

    const passedPct =
      report.summary.total > 0
        ? Math.round((report.summary.passed / report.summary.total) * 100)
        : 0;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Report - ${escapeHtml(report.runId)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      background: #0d1117;
      color: #e6edf3;
      line-height: 1.5;
      padding: 24px;
      max-width: 1200px;
      margin: 0 auto;
    }
    a { color: #58a6ff; text-decoration: none; }
    details > summary::-webkit-details-marker { display: none; }
    details > summary::marker { display: none; content: ''; }
    details > summary { list-style: none; }
    details[open] > summary {
      border-radius: 6px 6px 0 0;
    }
    @media print {
      body { background: #fff; color: #1f2328; }
      details { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px;flex-wrap:wrap;">
    <h1 style="font-size:24px;font-weight:600;">Test Run Report</h1>
    <span style="font-size:14px;padding:4px 12px;border-radius:16px;background:${statusColor}22;color:${statusColor};font-weight:600;text-transform:uppercase;">${escapeHtml(report.status)}</span>
    <span style="font-size:13px;padding:4px 10px;border-radius:6px;background:#30363d;color:#8b949e;">${escapeHtml(report.mode || '-')}</span>
    <span style="font-size:13px;padding:4px 10px;border-radius:6px;background:#30363d;color:#8b949e;">${escapeHtml(report.platform || '-')}</span>
  </div>

  <div style="font-size:13px;color:#8b949e;margin-bottom:24px;">
    <span>Run ID: <span style="color:#e6edf3;font-family:monospace;">${escapeHtml(report.runId)}</span></span>
    <span style="margin-left:24px;">Started: <span style="color:#e6edf3;">${formatDate(report.startedAt)}</span></span>
    <span style="margin-left:24px;">Completed: <span style="color:#e6edf3;">${formatDate(report.completedAt)}</span></span>
    <span style="margin-left:24px;">Duration: <span style="color:#e6edf3;">${formatDuration(report.totalDuration)}</span></span>
  </div>

  <!-- Summary Bar -->
  <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:32px;">
    <div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px;text-align:center;">
      <div style="font-size:28px;font-weight:700;color:#e6edf3;">${report.summary.total}</div>
      <div style="font-size:12px;color:#8b949e;margin-top:4px;">Total Scenarios</div>
    </div>
    <div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px;text-align:center;">
      <div style="font-size:28px;font-weight:700;color:#3fb950;">${report.summary.passed}</div>
      <div style="font-size:12px;color:#8b949e;margin-top:4px;">Passed</div>
    </div>
    <div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px;text-align:center;">
      <div style="font-size:28px;font-weight:700;color:#f85149;">${report.summary.failed}</div>
      <div style="font-size:12px;color:#8b949e;margin-top:4px;">Failed</div>
    </div>
    <div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px;text-align:center;">
      <div style="font-size:28px;font-weight:700;color:#8b949e;">${report.summary.skipped}</div>
      <div style="font-size:12px;color:#8b949e;margin-top:4px;">Skipped</div>
    </div>
    <div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px;text-align:center;">
      <div style="font-size:28px;font-weight:700;color:#e6edf3;">${passedPct}%</div>
      <div style="font-size:12px;color:#8b949e;margin-top:4px;">Pass Rate</div>
    </div>
  </div>

  <!-- Progress Bar -->
  <div style="height:8px;background:#21262d;border-radius:4px;overflow:hidden;margin-bottom:32px;display:flex;">
    ${report.summary.passed > 0 ? `<div style="width:${(report.summary.passed / report.summary.total) * 100}%;background:#3fb950;"></div>` : ''}
    ${report.summary.failed > 0 ? `<div style="width:${(report.summary.failed / report.summary.total) * 100}%;background:#f85149;"></div>` : ''}
    ${report.summary.skipped > 0 ? `<div style="width:${(report.summary.skipped / report.summary.total) * 100}%;background:#8b949e;"></div>` : ''}
  </div>

  <!-- Scenario Results -->
  <h2 style="font-size:18px;font-weight:600;margin-bottom:16px;">Scenario Results</h2>
  ${scenarioSections || '<div style="color:#8b949e;padding:16px;">No scenario results available.</div>'}

  <!-- Footer -->
  <div style="margin-top:40px;padding-top:16px;border-top:1px solid #21262d;font-size:12px;color:#484f58;text-align:center;">
    Generated by Katab Platform &middot; ${new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')}
  </div>
</body>
</html>`;
  }
}
