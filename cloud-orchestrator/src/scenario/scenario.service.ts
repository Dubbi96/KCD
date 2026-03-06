import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuid } from 'uuid';
import { Scenario } from './scenario.entity';
import { CreateScenarioDto, UpdateScenarioDto } from './dto/create-scenario.dto';

@Injectable()
export class ScenarioService {
  constructor(
    @InjectRepository(Scenario) private scenarioRepo: Repository<Scenario>,
  ) {}

  async create(tenantId: string, dto: CreateScenarioDto) {
    const scenario = this.scenarioRepo.create({
      tenantId,
      name: dto.name,
      description: dto.description,
      platform: dto.platform || 'web',
      scenarioData: dto.scenarioData,
      tags: dto.tags || [],
      folderId: dto.folderId,
    });
    return this.scenarioRepo.save(scenario);
  }

  async findAll(tenantId: string, platform?: string, folderId?: string) {
    const where: any = { tenantId };
    if (platform) where.platform = platform;
    if (folderId) where.folderId = folderId;
    const scenarios = await this.scenarioRepo.find({
      where,
      order: { updatedAt: 'DESC' },
    });
    // Return with step count but without full scenarioData blob
    return scenarios.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      platform: s.platform,
      version: s.version,
      tags: s.tags,
      tcId: s.tcId,
      folderId: s.folderId,
      stepCount: s.scenarioData?.events?.length || 0,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  }

  async findOne(tenantId: string, scenarioId: string) {
    const scenario = await this.scenarioRepo.findOne({
      where: { id: scenarioId, tenantId },
    });
    if (!scenario) throw new NotFoundException('Scenario not found');
    return scenario;
  }

  async update(tenantId: string, scenarioId: string, dto: UpdateScenarioDto) {
    const scenario = await this.findOne(tenantId, scenarioId);
    if (dto.scenarioData) scenario.version += 1;
    Object.assign(scenario, dto);
    return this.scenarioRepo.save(scenario);
  }

  async remove(tenantId: string, scenarioId: string) {
    const scenario = await this.findOne(tenantId, scenarioId);
    await this.scenarioRepo.remove(scenario);
  }

  async findByIds(tenantId: string, ids: string[]) {
    return this.scenarioRepo
      .createQueryBuilder('s')
      .where('s.tenant_id = :tenantId', { tenantId })
      .andWhere('s.id IN (:...ids)', { ids })
      .getMany();
  }

  // ─── Includes (Scenario Composition) ───────────────────

  async resolveIncludes(tenantId: string, scenarioId: string): Promise<any[]> {
    const visited = new Set<string>();
    return this._resolveIncludesRecursive(tenantId, scenarioId, visited);
  }

  private async _resolveIncludesRecursive(
    tenantId: string,
    scenarioId: string,
    visited: Set<string>,
  ): Promise<any[]> {
    if (visited.has(scenarioId)) return []; // circular guard
    visited.add(scenarioId);

    const scenario = await this.scenarioRepo.findOne({
      where: { id: scenarioId, tenantId },
    });
    if (!scenario) return [];

    const data = scenario.scenarioData || {};
    const includes: { scenarioId: string; aliasId?: string }[] =
      data.includes || [];
    const ownEvents: any[] = data.events || [];

    // Resolve included scenarios first
    let resolved: any[] = [];
    for (const inc of includes) {
      const includedEvents = await this._resolveIncludesRecursive(
        tenantId,
        inc.scenarioId,
        visited,
      );
      resolved = [...resolved, ...includedEvents];
    }

    // Then append own events
    return [...resolved, ...ownEvents];
  }

  async addInclude(
    tenantId: string,
    scenarioId: string,
    include: { scenarioId: string; aliasId?: string },
  ) {
    const scenario = await this.findOne(tenantId, scenarioId);

    // Verify target scenario exists and belongs to same tenant
    const target = await this.scenarioRepo.findOne({
      where: { id: include.scenarioId, tenantId },
    });
    if (!target)
      throw new NotFoundException('Included scenario not found');

    // Prevent self-include
    if (include.scenarioId === scenarioId)
      throw new BadRequestException('A scenario cannot include itself');

    const sd = scenario.scenarioData || {};
    if (!sd.includes) sd.includes = [];
    sd.includes.push(include);
    scenario.scenarioData = sd;
    scenario.version += 1;
    return this.scenarioRepo.save(scenario);
  }

  async removeInclude(
    tenantId: string,
    scenarioId: string,
    index: number,
  ) {
    const scenario = await this.findOne(tenantId, scenarioId);
    const sd = scenario.scenarioData || {};
    const includes: any[] = sd.includes || [];
    if (index < 0 || index >= includes.length)
      throw new BadRequestException('Invalid include index');
    includes.splice(index, 1);
    sd.includes = includes;
    scenario.scenarioData = sd;
    scenario.version += 1;
    return this.scenarioRepo.save(scenario);
  }

  // ─── Clone ──────────────────────────────────────────────

  async clone(tenantId: string, scenarioId: string, newName?: string) {
    const original = await this.findOne(tenantId, scenarioId);
    const cloned = this.scenarioRepo.create({
      tenantId,
      name: newName || `${original.name} (copy)`,
      description: original.description,
      platform: original.platform,
      scenarioData: JSON.parse(JSON.stringify(original.scenarioData)),
      tags: [...(original.tags || [])],
      folderId: original.folderId,
    });
    return this.scenarioRepo.save(cloned);
  }

  // ─── Step Operations ────────────────────────────────────

  private getEvents(scenario: Scenario): any[] {
    return scenario.scenarioData?.events || [];
  }

  private reindex(events: any[]) {
    events.forEach((e: any, i: number) => { e.stepNo = i + 1; });
  }

  async insertStep(tenantId: string, scenarioId: string, afterIndex: number, event: any) {
    const scenario = await this.findOne(tenantId, scenarioId);
    const events = this.getEvents(scenario);
    events.splice(afterIndex + 1, 0, { ...event, timestamp: Date.now() });
    this.reindex(events);
    scenario.scenarioData = { ...scenario.scenarioData, events };
    scenario.version += 1;
    return this.scenarioRepo.save(scenario);
  }

  async updateStep(tenantId: string, scenarioId: string, index: number, updates: any) {
    const scenario = await this.findOne(tenantId, scenarioId);
    const events = this.getEvents(scenario);
    if (index < 0 || index >= events.length) throw new BadRequestException('Invalid step index');
    Object.assign(events[index], updates);
    scenario.scenarioData = { ...scenario.scenarioData, events };
    scenario.version += 1;
    return this.scenarioRepo.save(scenario);
  }

  async deleteStep(tenantId: string, scenarioId: string, index: number) {
    const scenario = await this.findOne(tenantId, scenarioId);
    const events = this.getEvents(scenario);
    if (index < 0 || index >= events.length) throw new BadRequestException('Invalid step index');
    events.splice(index, 1);
    this.reindex(events);
    scenario.scenarioData = { ...scenario.scenarioData, events };
    scenario.version += 1;
    return this.scenarioRepo.save(scenario);
  }

  async moveStep(tenantId: string, scenarioId: string, fromIndex: number, toIndex: number) {
    const scenario = await this.findOne(tenantId, scenarioId);
    const events = this.getEvents(scenario);
    if (fromIndex < 0 || fromIndex >= events.length || toIndex < 0 || toIndex >= events.length) {
      throw new BadRequestException('Invalid step index');
    }
    const [item] = events.splice(fromIndex, 1);
    events.splice(toIndex, 0, item);
    this.reindex(events);
    scenario.scenarioData = { ...scenario.scenarioData, events };
    scenario.version += 1;
    return this.scenarioRepo.save(scenario);
  }

  async duplicateStep(tenantId: string, scenarioId: string, index: number) {
    const scenario = await this.findOne(tenantId, scenarioId);
    const events = this.getEvents(scenario);
    if (index < 0 || index >= events.length) throw new BadRequestException('Invalid step index');
    const copy = JSON.parse(JSON.stringify(events[index]));
    copy.timestamp = Date.now();
    events.splice(index + 1, 0, copy);
    this.reindex(events);
    scenario.scenarioData = { ...scenario.scenarioData, events };
    scenario.version += 1;
    return this.scenarioRepo.save(scenario);
  }

  async toggleStep(tenantId: string, scenarioId: string, index: number) {
    const scenario = await this.findOne(tenantId, scenarioId);
    const events = this.getEvents(scenario);
    if (index < 0 || index >= events.length) throw new BadRequestException('Invalid step index');
    events[index].disabled = !events[index].disabled;
    scenario.scenarioData = { ...scenario.scenarioData, events };
    return this.scenarioRepo.save(scenario);
  }

  async convertStepType(tenantId: string, scenarioId: string, index: number, newType: string) {
    const scenario = await this.findOne(tenantId, scenarioId);
    const events = this.getEvents(scenario);
    if (index < 0 || index >= events.length) throw new BadRequestException('Invalid step index');
    const event = events[index];
    const preserved: any = {};
    for (const f of ['selector', 'description', 'within', 'meta', 'notes', 'tags', 'takeScreenshot', 'disabled']) {
      if (event[f] !== undefined) preserved[f] = event[f];
    }
    if (event.value !== undefined && ['fill', 'select', 'type'].includes(newType)) preserved.value = event.value;
    if (event.url !== undefined && newType === 'navigate') preserved.url = event.url;
    events[index] = { type: newType, timestamp: event.timestamp, stepNo: event.stepNo, ...preserved };
    scenario.scenarioData = { ...scenario.scenarioData, events };
    scenario.version += 1;
    return this.scenarioRepo.save(scenario);
  }

  // ─── Assertion Operations ───────────────────────────────

  async addAssertion(tenantId: string, scenarioId: string, stepIndex: number, assertion: any) {
    const scenario = await this.findOne(tenantId, scenarioId);
    const events = this.getEvents(scenario);
    if (stepIndex < 0 || stepIndex >= events.length) throw new BadRequestException('Invalid step index');
    if (!events[stepIndex].assertions) events[stepIndex].assertions = [];
    events[stepIndex].assertions.push(assertion);
    scenario.scenarioData = { ...scenario.scenarioData, events };
    return this.scenarioRepo.save(scenario);
  }

  async removeAssertion(tenantId: string, scenarioId: string, stepIndex: number, assertionIndex: number) {
    const scenario = await this.findOne(tenantId, scenarioId);
    const events = this.getEvents(scenario);
    if (stepIndex < 0 || stepIndex >= events.length) throw new BadRequestException('Invalid step index');
    const assertions = events[stepIndex].assertions || [];
    if (assertionIndex < 0 || assertionIndex >= assertions.length) throw new BadRequestException('Invalid assertion index');
    assertions.splice(assertionIndex, 1);
    scenario.scenarioData = { ...scenario.scenarioData, events };
    return this.scenarioRepo.save(scenario);
  }

  // ─── Variables & Metadata ───────────────────────────────

  async setVariables(tenantId: string, scenarioId: string, variables: Record<string, string>) {
    const scenario = await this.findOne(tenantId, scenarioId);
    const sd = scenario.scenarioData || {};
    sd.variables = { ...(sd.variables || {}), ...variables };
    scenario.scenarioData = sd;
    return this.scenarioRepo.save(scenario);
  }

  async setTcId(tenantId: string, scenarioId: string, tcId: string) {
    const scenario = await this.findOne(tenantId, scenarioId);
    const sd = scenario.scenarioData || {};
    sd.tcId = tcId;
    scenario.scenarioData = sd;
    return this.scenarioRepo.save(scenario);
  }

  // ─── Block Operations ───────────────────────────────────

  async wrapBlock(tenantId: string, scenarioId: string, startIdx: number, endIdx: number, blockName: string) {
    const scenario = await this.findOne(tenantId, scenarioId);
    const events = this.getEvents(scenario);
    if (startIdx < 0 || endIdx >= events.length || startIdx > endIdx) {
      throw new BadRequestException('Invalid block range');
    }
    const blockId = `block-${Date.now()}`;
    const blockStart = { type: 'block_start', timestamp: Date.now(), blockConfig: { blockId, name: blockName } };
    const blockEnd = { type: 'block_end', timestamp: Date.now(), blockConfig: { blockId, name: blockName } };
    events.splice(endIdx + 1, 0, blockEnd);
    events.splice(startIdx, 0, blockStart);
    this.reindex(events);
    scenario.scenarioData = { ...scenario.scenarioData, events };
    scenario.version += 1;
    return this.scenarioRepo.save(scenario);
  }

  async unwrapBlock(tenantId: string, scenarioId: string, blockId: string) {
    const scenario = await this.findOne(tenantId, scenarioId);
    const events = this.getEvents(scenario);
    const startIdx = events.findIndex((e: any) => e.blockConfig?.blockId === blockId && e.type === 'block_start');
    const endIdx = events.findIndex((e: any) => e.blockConfig?.blockId === blockId && e.type === 'block_end');
    if (startIdx === -1 || endIdx === -1) throw new BadRequestException('Block not found');
    events.splice(endIdx, 1);
    events.splice(startIdx, 1);
    this.reindex(events);
    scenario.scenarioData = { ...scenario.scenarioData, events };
    scenario.version += 1;
    return this.scenarioRepo.save(scenario);
  }

  // ─── Bulk Operations ────────────────────────────────────

  async bulkToggle(tenantId: string, scenarioId: string, indices: number[], disabled: boolean) {
    const scenario = await this.findOne(tenantId, scenarioId);
    const events = this.getEvents(scenario);
    for (const i of indices) {
      if (i >= 0 && i < events.length) events[i].disabled = disabled;
    }
    scenario.scenarioData = { ...scenario.scenarioData, events };
    return this.scenarioRepo.save(scenario);
  }

  async bulkDelete(tenantId: string, scenarioId: string, indices: number[]) {
    const scenario = await this.findOne(tenantId, scenarioId);
    const events = this.getEvents(scenario);
    const sorted = [...indices].sort((a, b) => b - a);
    for (const i of sorted) {
      if (i >= 0 && i < events.length) events.splice(i, 1);
    }
    this.reindex(events);
    scenario.scenarioData = { ...scenario.scenarioData, events };
    scenario.version += 1;
    return this.scenarioRepo.save(scenario);
  }

  // ─── Partial Re-record ─────────────────────────────────

  async createPartialRerecord(
    tenantId: string,
    scenarioId: string,
    fromStep: number,
    toStep: number,
  ) {
    const scenario = await this.findOne(tenantId, scenarioId);
    const events = this.getEvents(scenario);

    if (fromStep < 0 || toStep < 0) {
      throw new BadRequestException('Step indices must be non-negative');
    }
    if (fromStep > toStep) {
      throw new BadRequestException('fromStep must be <= toStep');
    }
    if (toStep >= events.length) {
      throw new BadRequestException(
        `toStep (${toStep}) exceeds events length (${events.length})`,
      );
    }

    const requestId = uuid();
    return {
      requestId,
      scenarioId,
      fromStep,
      toStep,
      originalStepCount: toStep - fromStep + 1,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
  }

  async applyPartialRerecord(
    tenantId: string,
    scenarioId: string,
    fromStep: number,
    toStep: number,
    newEvents: any[],
  ) {
    const scenario = await this.findOne(tenantId, scenarioId);
    const events = this.getEvents(scenario);

    if (fromStep < 0 || toStep < 0) {
      throw new BadRequestException('Step indices must be non-negative');
    }
    if (fromStep > toStep) {
      throw new BadRequestException('fromStep must be <= toStep');
    }
    if (toStep >= events.length) {
      throw new BadRequestException(
        `toStep (${toStep}) exceeds events length (${events.length})`,
      );
    }

    // Replace events[fromStep..toStep] with newEvents
    const deleteCount = toStep - fromStep + 1;
    events.splice(fromStep, deleteCount, ...newEvents);
    this.reindex(events);

    scenario.scenarioData = { ...scenario.scenarioData, events };
    scenario.version += 1;
    return this.scenarioRepo.save(scenario);
  }

  // ─── Validate ───────────────────────────────────────────

  validate(scenarioData: Record<string, any>) {
    const events: any[] = scenarioData?.events || [];
    const issues: any[] = [];

    events.forEach((ev: any, i: number) => {
      if (ev.disabled) return;

      // Check required fields per type
      if (['click', 'fill', 'select', 'hover'].includes(ev.type)) {
        if (!ev.selector && !ev.meta?.element) {
          issues.push({ level: 'error', stepIndex: i, field: 'selector', message: `Step #${i + 1} (${ev.type}): no selector defined`, code: 'MISSING_SELECTOR' });
        }
        if (ev.type === 'fill' && !ev.value && ev.value !== '') {
          issues.push({ level: 'warning', stepIndex: i, field: 'value', message: `Step #${i + 1} (fill): empty value`, code: 'MISSING_VALUE' });
        }
      }
      if (ev.type === 'navigate' && !ev.url) {
        issues.push({ level: 'error', stepIndex: i, field: 'url', message: `Step #${i + 1} (navigate): no URL`, code: 'MISSING_URL' });
      }
      if (ev.type === 'api_request' && !ev.apiRequest?.url) {
        issues.push({ level: 'error', stepIndex: i, field: 'apiRequest.url', message: `Step #${i + 1} (api_request): no URL`, code: 'MISSING_API_URL' });
      }
    });

    // Check marker balance (for_each, if, block)
    for (const pair of [['for_each_start', 'for_each_end'], ['if_start', 'if_end'], ['block_start', 'block_end']]) {
      const starts = events.filter((e: any) => e.type === pair[0]).length;
      const ends = events.filter((e: any) => e.type === pair[1]).length;
      if (starts !== ends) {
        issues.push({ level: 'error', field: pair[0], message: `Unbalanced ${pair[0]}/${pair[1]}: ${starts} starts, ${ends} ends`, code: 'MARKER_IMBALANCE' });
      }
    }

    // Check variable references
    const definedVars = new Set<string>(Object.keys(scenarioData?.variables || {}));
    events.forEach((ev: any) => {
      if (ev.type === 'set_variable' && ev.variableName) definedVars.add(ev.variableName);
      if (ev.type === 'extract_data' && ev.extractData?.captureAs) definedVars.add(ev.extractData.captureAs);
    });
    events.forEach((ev: any, i: number) => {
      const refs = this.findVariableRefs(ev);
      for (const ref of refs) {
        if (!definedVars.has(ref)) {
          issues.push({ level: 'warning', stepIndex: i, message: `Step #${i + 1}: references undefined variable {{${ref}}}`, code: 'UNDEFINED_VARIABLE' });
        }
      }
    });

    const summary = {
      errors: issues.filter((i: any) => i.level === 'error').length,
      warnings: issues.filter((i: any) => i.level === 'warning').length,
      info: issues.filter((i: any) => i.level === 'info').length,
    };

    return { issues, summary };
  }

  private findVariableRefs(event: any): string[] {
    const refs: string[] = [];
    const text = JSON.stringify(event);
    const matches = text.matchAll(/\{\{(\w+)\}\}/g);
    for (const m of matches) refs.push(m[1]);
    return [...new Set(refs)];
  }

  // ─── Optimize ───────────────────────────────────────────

  optimize(scenarioData: Record<string, any>) {
    const events: any[] = (scenarioData?.events || []).map((e: any) => ({ ...e }));
    const optimized = this.applyOptimizations(events);
    return { ...scenarioData, events: optimized };
  }

  private applyOptimizations(events: any[]): any[] {
    let result = events;
    result = this.stabilizeSelectors(result);
    result = this.normalizeNavigations(result);
    result = this.generateDescriptions(result);
    result = this.insertAutoWaits(result);
    this.reindex(result);
    return result;
  }

  private stabilizeSelectors(events: any[]): any[] {
    return events.map(e => {
      if (!e.meta?.preferredLocators?.length) return e;
      const locators = e.meta.preferredLocators;
      const best = locators.find((l: any) => l.kind === 'testid')
        || locators.find((l: any) => l.kind === 'role')
        || locators.find((l: any) => l.kind === 'label')
        || locators.find((l: any) => l.kind === 'placeholder')
        || locators.find((l: any) => l.kind === 'text')
        || locators[0];
      if (best) {
        const sel = this.locatorToSelector(best);
        if (sel !== e.selector) return { ...e, selector: sel };
      }
      return e;
    });
  }

  private locatorToSelector(locator: any): string {
    switch (locator.kind) {
      case 'testid': return `[data-testid="${locator.value}"]`;
      case 'role': return locator.name ? `role=${locator.value}[name="${locator.name}"]` : `role=${locator.value}`;
      case 'label': return `label=${locator.value}`;
      case 'placeholder': return `placeholder=${locator.value}`;
      case 'title': return `title=${locator.value}`;
      case 'text': return `text=${locator.value}`;
      case 'css': return locator.value;
      default: return locator.value;
    }
  }

  private generateDescriptions(events: any[]): any[] {
    return events.map(e => {
      if (e.description) return e;
      let desc = '';
      switch (e.type) {
        case 'click': case 'tap': desc = `Click ${e.selector || 'element'}`; break;
        case 'fill': case 'type': desc = `Type "${(e.value || '').slice(0, 30)}" into ${e.selector || 'field'}`; break;
        case 'navigate': desc = `Navigate to ${e.url || 'page'}`; break;
        case 'select': desc = `Select "${e.value}" in ${e.selector || 'dropdown'}`; break;
        case 'wait': desc = `Wait ${e.duration || 1000}ms`; break;
        case 'scroll': desc = `Scroll ${e.value || 'down'}`; break;
        case 'swipe': desc = 'Swipe gesture'; break;
        case 'back': desc = 'Press Back'; break;
        case 'home': desc = 'Press Home'; break;
        case 'assert': desc = `Assert ${e.assertion?.type || 'condition'}`; break;
        case 'api_request': desc = `API ${e.apiRequest?.method || 'GET'} ${e.apiRequest?.url || ''}`; break;
        case 'wait_for_user': desc = e.waitForUser?.message || 'Wait for user action'; break;
        case 'set_variable': desc = `Set {{${e.variableName}}} = ${e.variableValue || e.variableExpression || ''}`; break;
        case 'extract_data': desc = `Extract ${e.extractData?.captureAs || 'data'} from ${e.selector || 'element'}`; break;
        default: desc = e.type;
      }
      return { ...e, description: desc };
    });
  }

  private insertAutoWaits(events: any[]): any[] {
    const result: any[] = [];
    for (let i = 0; i < events.length; i++) {
      result.push(events[i]);
      // After navigate, insert auto-wait if next step isn't a wait
      if (events[i].type === 'navigate' && events[i + 1]?.type !== 'wait' && events[i + 1]?.type !== 'wait_for') {
        result.push({
          type: 'wait_for',
          timestamp: events[i].timestamp + 1,
          waitForConfig: { condition: 'network_idle', timeout: 10000 },
          description: 'Wait for page load',
        });
      }
    }
    return result;
  }

  private normalizeNavigations(events: any[]): any[] {
    const result: any[] = [];
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const next = events[i + 1];
      // Detect click/keyboard immediately followed by navigate
      if (
        next &&
        next.type === 'navigate' &&
        ['click', 'tap', 'keypress', 'keyboard'].includes(ev.type)
      ) {
        result.push(ev);
        // Replace the navigate with wait_for(url_change) + assert(url_contains)
        result.push({
          type: 'wait_for',
          timestamp: next.timestamp,
          waitForConfig: { condition: 'url_change', timeout: 10000 },
          description: 'Wait for URL change',
        });
        if (next.url) {
          result.push({
            type: 'assert',
            timestamp: next.timestamp + 1,
            assertion: { type: 'url_contains', value: next.url },
            description: `Assert URL contains ${next.url}`,
          });
        }
        i++; // skip the navigate event
      } else {
        result.push(ev);
      }
    }
    return result;
  }

  // ─── Flow Graph ─────────────────────────────────────────

  generateFlowGraph(scenarioData: Record<string, any>) {
    const events: any[] = scenarioData?.events || [];
    const nodes: any[] = [];
    const edges: any[] = [];

    // Start node
    nodes.push({ id: 'start', stepIndex: -1, type: 'start', label: 'Start' });

    const ifStack: string[] = [];
    const forEachStack: string[] = [];
    const blockStack: string[] = [];

    events.forEach((ev: any, i: number) => {
      const nodeId = `step-${i}`;
      const nodeType = this.eventToNodeType(ev.type);
      const label = ev.description || this.generateLabel(ev, i);

      nodes.push({
        id: nodeId,
        stepIndex: i,
        type: nodeType,
        label,
        eventType: ev.type,
        metadata: {
          selector: ev.selector,
          value: ev.value,
          url: ev.url,
          disabled: ev.disabled,
          blockId: ev.blockConfig?.blockId,
          blockName: ev.blockConfig?.name,
          onFail: ev.onFail,
        },
      });

      // Connect to previous
      const prevId = i === 0 ? 'start' : `step-${i - 1}`;
      if (ev.type === 'if_end' && ifStack.length > 0) {
        // if_end merges from true/false paths
      } else if (ev.type === 'for_each_end' && forEachStack.length > 0) {
        const loopStart = forEachStack.pop()!;
        edges.push({ id: `e-${nodeId}-loop`, source: nodeId, target: loopStart, type: 'loop_back', label: 'next item' });
      } else {
        edges.push({ id: `e-${prevId}-${nodeId}`, source: prevId, target: nodeId, type: 'next' });
      }

      if (ev.type === 'if_start') {
        ifStack.push(nodeId);
      } else if (ev.type === 'if_end' && ifStack.length > 0) {
        const ifStart = ifStack.pop()!;
        edges.push({ id: `e-${ifStart}-true-${nodeId}`, source: ifStart, target: `step-${i}`, type: 'if_true', label: 'true' });
        edges.push({ id: `e-${ifStart}-false-${nodeId}`, source: ifStart, target: `step-${i}`, type: 'if_false', label: 'false' });
      } else if (ev.type === 'for_each_start') {
        forEachStack.push(nodeId);
      } else if (ev.type === 'block_start') {
        blockStack.push(nodeId);
      } else if (ev.type === 'block_end') {
        blockStack.pop();
      }

      // OnFail edges
      if (ev.onFail) {
        if (ev.onFail.action === 'jump' && ev.onFail.jumpToStep !== undefined) {
          edges.push({ id: `e-${nodeId}-fail`, source: nodeId, target: `step-${ev.onFail.jumpToStep}`, type: 'on_fail', label: 'on fail' });
        }
        if (ev.onFail.action === 'retry') {
          edges.push({ id: `e-${nodeId}-retry`, source: nodeId, target: nodeId, type: 'on_fail_retry', label: `retry (${ev.onFail.maxRetries || 1}x)` });
        }
      }
    });

    // End node
    const lastId = events.length > 0 ? `step-${events.length - 1}` : 'start';
    nodes.push({ id: 'end', stepIndex: -1, type: 'end', label: 'End' });
    edges.push({ id: `e-${lastId}-end`, source: lastId, target: 'end', type: 'next' });

    return {
      scenarioId: scenarioData.id,
      scenarioName: scenarioData.name,
      nodes,
      edges,
      metadata: {
        totalSteps: events.length,
        hasConditions: events.some((e: any) => e.type === 'if_start'),
        hasLoops: events.some((e: any) => e.type === 'for_each_start'),
        hasBlocks: events.some((e: any) => e.type === 'block_start'),
        hasOnFailPolicies: events.some((e: any) => e.onFail),
      },
    };
  }

  private eventToNodeType(type: string): string {
    const map: Record<string, string> = {
      if_start: 'condition', if_end: 'action',
      for_each_start: 'loop_start', for_each_end: 'loop_end',
      wait: 'wait', wait_for: 'wait', wait_for_user: 'wait',
      api_request: 'api', check_email: 'api',
      run_script: 'script',
      extract_data: 'extract', ocr_extract: 'extract',
      assert: 'assert',
      dialog: 'dialog',
      popup_opened: 'popup', popup_closed: 'popup',
      block_start: 'block', block_end: 'block_end',
    };
    return map[type] || 'action';
  }

  private generateLabel(ev: any, index: number): string {
    const prefix = `#${index + 1}`;
    switch (ev.type) {
      case 'click': case 'tap': return `${prefix} ${ev.type} ${ev.selector || ''}`.trim();
      case 'fill': case 'type': return `${prefix} ${ev.type} "${(ev.value || '').slice(0, 20)}"`;
      case 'navigate': return `${prefix} navigate ${ev.url || ''}`;
      case 'assert': return `${prefix} assert ${ev.assertion?.type || ''}`;
      case 'wait': return `${prefix} wait ${ev.duration || 0}ms`;
      case 'api_request': return `${prefix} API ${ev.apiRequest?.method || 'GET'}`;
      default: return `${prefix} ${ev.type}`;
    }
  }
}
