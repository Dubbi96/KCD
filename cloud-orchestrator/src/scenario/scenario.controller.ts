import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ScenarioService } from './scenario.service';
import { CreateScenarioDto, UpdateScenarioDto } from './dto/create-scenario.dto';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';

@ApiTags('Scenarios')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('scenarios')
export class ScenarioController {
  constructor(private scenarioService: ScenarioService) {}

  // ─── CRUD ───────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Create a scenario' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateScenarioDto) {
    return this.scenarioService.create(user.tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List scenarios' })
  @ApiQuery({ name: 'platform', required: false })
  @ApiQuery({ name: 'folderId', required: false })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('platform') platform?: string,
    @Query('folderId') folderId?: string,
  ) {
    return this.scenarioService.findAll(user.tenantId, platform, folderId);
  }

  // ─── Includes (Scenario Composition) ───────────────────
  // NOTE: These sub-path GET routes must be registered BEFORE the
  // parameterized @Get(':id') so NestJS does not swallow them.

  @Get(':id/resolved')
  @ApiOperation({ summary: 'Get resolved events with includes flattened' })
  async resolved(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const events = await this.scenarioService.resolveIncludes(user.tenantId, id);
    return { scenarioId: id, events };
  }

  @Post(':id/includes')
  @ApiOperation({ summary: 'Add an include to a scenario' })
  addInclude(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { scenarioId: string; aliasId?: string },
  ) {
    return this.scenarioService.addInclude(user.tenantId, id, body);
  }

  @Delete(':id/includes/:idx')
  @ApiOperation({ summary: 'Remove an include by index' })
  removeInclude(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('idx') idx: string,
  ) {
    return this.scenarioService.removeInclude(user.tenantId, id, parseInt(idx));
  }

  // ─── Flow Graph ─────────────────────────────────────────

  @Get(':id/flow-graph')
  @ApiOperation({ summary: 'Generate flow graph for visualization' })
  async flowGraph(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const scenario = await this.scenarioService.findOne(user.tenantId, id);
    return this.scenarioService.generateFlowGraph(scenario.scenarioData);
  }

  // ─── Single Scenario ──────────────────────────────────

  @Get(':id')
  @ApiOperation({ summary: 'Get scenario with full data' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.scenarioService.findOne(user.tenantId, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a scenario' })
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateScenarioDto) {
    return this.scenarioService.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a scenario' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.scenarioService.remove(user.tenantId, id);
  }

  // ─── Clone ──────────────────────────────────────────────

  @Post(':id/clone')
  @ApiOperation({ summary: 'Clone a scenario' })
  clone(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() body: { name?: string }) {
    return this.scenarioService.clone(user.tenantId, id, body.name);
  }

  // ─── Partial Re-record ─────────────────────────────────

  @Post(':id/partial-rerecord')
  @ApiOperation({ summary: 'Create a partial re-record request' })
  createPartialRerecord(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { fromStep: number; toStep: number; runnerId?: string; platform?: string },
  ) {
    return this.scenarioService.createPartialRerecord(user.tenantId, id, body.fromStep, body.toStep);
  }

  @Post(':id/partial-rerecord/:requestId/apply')
  @ApiOperation({ summary: 'Apply partial re-record results' })
  applyPartialRerecord(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('requestId') requestId: string,
    @Body() body: { fromStep: number; toStep: number; events: any[] },
  ) {
    return this.scenarioService.applyPartialRerecord(
      user.tenantId,
      id,
      body.fromStep,
      body.toStep,
      body.events,
    );
  }

  // ─── Step Operations ────────────────────────────────────

  @Post(':id/step')
  @ApiOperation({ summary: 'Insert a step after given index' })
  insertStep(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { afterIndex: number; event: any },
  ) {
    return this.scenarioService.insertStep(user.tenantId, id, body.afterIndex, body.event);
  }

  @Put(':id/step/:idx')
  @ApiOperation({ summary: 'Update a step' })
  updateStep(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('idx') idx: string,
    @Body() updates: any,
  ) {
    return this.scenarioService.updateStep(user.tenantId, id, parseInt(idx), updates);
  }

  @Delete(':id/step/:idx')
  @ApiOperation({ summary: 'Delete a step' })
  deleteStep(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Param('idx') idx: string) {
    return this.scenarioService.deleteStep(user.tenantId, id, parseInt(idx));
  }

  @Post(':id/step/:idx/move')
  @ApiOperation({ summary: 'Move a step to new position' })
  moveStep(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('idx') idx: string,
    @Body() body: { toIndex: number },
  ) {
    return this.scenarioService.moveStep(user.tenantId, id, parseInt(idx), body.toIndex);
  }

  @Post(':id/step/:idx/duplicate')
  @ApiOperation({ summary: 'Duplicate a step' })
  duplicateStep(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Param('idx') idx: string) {
    return this.scenarioService.duplicateStep(user.tenantId, id, parseInt(idx));
  }

  @Post(':id/step/:idx/toggle')
  @ApiOperation({ summary: 'Toggle step enabled/disabled' })
  toggleStep(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Param('idx') idx: string) {
    return this.scenarioService.toggleStep(user.tenantId, id, parseInt(idx));
  }

  @Post(':id/step/:idx/convert')
  @ApiOperation({ summary: 'Convert step type' })
  convertStepType(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('idx') idx: string,
    @Body() body: { newType: string },
  ) {
    return this.scenarioService.convertStepType(user.tenantId, id, parseInt(idx), body.newType);
  }

  // ─── Assertions ─────────────────────────────────────────

  @Post(':id/step/:idx/assertion')
  @ApiOperation({ summary: 'Add assertion to a step' })
  addAssertion(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('idx') idx: string,
    @Body() assertion: any,
  ) {
    return this.scenarioService.addAssertion(user.tenantId, id, parseInt(idx), assertion);
  }

  @Delete(':id/step/:idx/assertion/:aidx')
  @ApiOperation({ summary: 'Remove assertion from a step' })
  removeAssertion(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('idx') idx: string,
    @Param('aidx') aidx: string,
  ) {
    return this.scenarioService.removeAssertion(user.tenantId, id, parseInt(idx), parseInt(aidx));
  }

  // ─── Variables & Metadata ───────────────────────────────

  @Post(':id/variables')
  @ApiOperation({ summary: 'Set scenario variables' })
  setVariables(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() body: Record<string, string>) {
    return this.scenarioService.setVariables(user.tenantId, id, body);
  }

  @Post(':id/tcid')
  @ApiOperation({ summary: 'Set test case ID' })
  setTcId(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() body: { tcId: string }) {
    return this.scenarioService.setTcId(user.tenantId, id, body.tcId);
  }

  // ─── Block Operations ──────────────────────────────────

  @Post(':id/block/wrap')
  @ApiOperation({ summary: 'Wrap steps in a block' })
  wrapBlock(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { startIdx: number; endIdx: number; name: string },
  ) {
    return this.scenarioService.wrapBlock(user.tenantId, id, body.startIdx, body.endIdx, body.name);
  }

  @Post(':id/block/unwrap')
  @ApiOperation({ summary: 'Unwrap a block' })
  unwrapBlock(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() body: { blockId: string }) {
    return this.scenarioService.unwrapBlock(user.tenantId, id, body.blockId);
  }

  // ─── Bulk Operations ───────────────────────────────────

  @Post(':id/bulk/toggle')
  @ApiOperation({ summary: 'Bulk toggle steps' })
  bulkToggle(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { indices: number[]; disabled: boolean },
  ) {
    return this.scenarioService.bulkToggle(user.tenantId, id, body.indices, body.disabled);
  }

  @Post(':id/bulk/delete')
  @ApiOperation({ summary: 'Bulk delete steps' })
  bulkDelete(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() body: { indices: number[] }) {
    return this.scenarioService.bulkDelete(user.tenantId, id, body.indices);
  }

  // ─── Validate & Optimize ────────────────────────────────

  @Post(':id/validate')
  @ApiOperation({ summary: 'Validate scenario structure' })
  async validate(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const scenario = await this.scenarioService.findOne(user.tenantId, id);
    return this.scenarioService.validate(scenario.scenarioData);
  }

  @Post(':id/optimize')
  @ApiOperation({ summary: 'Optimize scenario events' })
  async optimize(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const scenario = await this.scenarioService.findOne(user.tenantId, id);
    return this.scenarioService.optimize(scenario.scenarioData);
  }

}
