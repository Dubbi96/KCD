import { renderGeneric } from './generic';
import { renderDiscord } from './discord';
import { renderSlack } from './slack';
import { renderTeams } from './teams';

export type RendererFn = (
  eventType: string,
  payload: any,
  dashboardUrl: string,
) => any;

const renderers: Record<string, RendererFn> = {
  generic: renderGeneric,
  discord: renderDiscord,
  slack: renderSlack,
  teams: renderTeams,
};

export function renderBody(
  type: string,
  eventType: string,
  payload: any,
  dashboardUrl: string,
): any {
  const render = renderers[type] ?? renderers.generic;
  return render(eventType, payload, dashboardUrl);
}
