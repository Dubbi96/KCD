/**
 * Device WebSocket Gateway
 *
 * Relays real-time device screen frames between:
 *   Dashboard Browser ↔ Cloud Orchestrator ↔ Local Runner
 *
 * Protocol (NestJS WsAdapter format):
 *   Client → Cloud:  { event: 'join', data: { sessionId: '...' } }
 *   Client → Cloud:  { event: 'action', data: { type: 'tap', x, y } }
 *   Client → Cloud:  { event: 'record_start', data: {} }
 *   Client → Cloud:  { event: 'record_stop', data: {} }
 *   Cloud → Client:  { type: 'frame', data: '<base64 JPEG>' }
 *   Cloud → Client:  { type: 'status', data: 'active' }
 *   Cloud → Client:  { type: 'recorded_events', data: [...] }
 *   Cloud → Client:  { type: 'error', data: '...' }
 */

import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server } from 'ws';
import * as WebSocket from 'ws';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeviceSession } from './device-session.entity';
import { Runner } from '../account/runner.entity';

interface RunnerConnection {
  ws: WebSocket;
  sessionId: string;
  runnerSessionId: string;
  tenantId: string;
}

@WebSocketGateway({ path: '/ws/device' })
export class DeviceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger('DeviceGateway');
  /** Map: dashboardClientId → RunnerConnection */
  private runnerLinks = new Map<any, RunnerConnection>();

  constructor(
    @InjectRepository(DeviceSession) private sessionRepo: Repository<DeviceSession>,
    @InjectRepository(Runner) private runnerRepo: Repository<Runner>,
    private jwtService: JwtService,
  ) {}

  /** Send a message to the dashboard client in { type, data } format. */
  private sendToClient(client: any, type: string, data: any) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type, data }));
    }
  }

  handleConnection(client: any) {
    this.logger.log(`Client connected: ${client._socket?.remoteAddress}`);
  }

  handleDisconnect(client: any) {
    this.logger.log('Client disconnected');
    const link = this.runnerLinks.get(client);
    if (link) {
      link.ws.close();
      this.runnerLinks.delete(client);
    }
  }

  /** Verify JWT token and extract payload */
  private verifyToken(token: string): { sub: string; tenantId: string } | null {
    try {
      const payload = this.jwtService.verify<{ sub: string; tenantId: string }>(token);
      return payload;
    } catch {
      return null;
    }
  }

  @SubscribeMessage('join')
  async handleJoin(
    @ConnectedSocket() client: any,
    @MessageBody() data: { sessionId: string; token?: string },
  ) {
    try {
      // Validate JWT token
      if (!data?.token) {
        this.sendToClient(client, 'error', 'Authentication required: token is missing');
        return;
      }

      const payload = this.verifyToken(data.token);
      if (!payload || !payload.tenantId) {
        this.sendToClient(client, 'error', 'Invalid or expired token');
        return;
      }

      const sessionId = data?.sessionId;
      if (!sessionId) {
        this.sendToClient(client, 'error', 'sessionId is required');
        return;
      }

      this.logger.log(`Join request for session: ${sessionId} (tenant: ${payload.tenantId})`);

      // Find session with tenant isolation
      const session = await this.sessionRepo.findOne({
        where: { id: sessionId, tenantId: payload.tenantId },
      });
      if (!session) {
        this.sendToClient(client, 'error', 'Session not found');
        return;
      }

      // Find runner to get connection info (scoped to tenant)
      const runner = await this.runnerRepo.findOne({
        where: { id: session.runnerId, tenantId: payload.tenantId },
      });
      if (!runner) {
        this.sendToClient(client, 'error', 'Runner not found');
        return;
      }

      const runnerHost = (runner.metadata as any)?.localApiHost || 'localhost';
      const runnerPort = (runner.metadata as any)?.localApiPort || 5001;
      const runnerSessionId = session.runnerSessionId;

      if (!runnerSessionId) {
        this.sendToClient(client, 'error', 'Session not yet initialized on runner');
        return;
      }

      // Connect to runner's WebSocket stream
      const wsUrl = `ws://${runnerHost}:${runnerPort}/sessions/${runnerSessionId}/stream`;
      this.logger.log(`Connecting to runner WS: ${wsUrl}`);

      const runnerWs = new WebSocket(wsUrl);

      runnerWs.on('open', () => {
        this.logger.log(`Connected to runner WS: ${wsUrl}`);
        this.sendToClient(client, 'status', 'connected');
      });

      runnerWs.on('message', (raw: Buffer) => {
        // Relay frames from runner to dashboard client (pass-through)
        if (client.readyState === WebSocket.OPEN) {
          client.send(raw.toString());
        }
      });

      runnerWs.on('error', (err) => {
        this.logger.error(`Runner WS error (${wsUrl}): ${err.message}`);
        this.sendToClient(client, 'error', `Runner connection error: ${err.message}`);
      });

      runnerWs.on('close', () => {
        this.logger.log('Runner WS closed');
        this.sendToClient(client, 'status', 'runner_disconnected');
        this.runnerLinks.delete(client);
      });

      this.runnerLinks.set(client, {
        ws: runnerWs,
        sessionId,
        runnerSessionId,
        tenantId: payload.tenantId,
      });
    } catch (err: any) {
      this.logger.error(`Join handler error: ${err.message}`);
      this.sendToClient(client, 'error', err.message);
    }
  }

  @SubscribeMessage('action')
  async handleAction(
    @ConnectedSocket() client: any,
    @MessageBody() data: any,
  ) {
    const link = this.runnerLinks.get(client);
    if (!link || link.ws.readyState !== WebSocket.OPEN) {
      this.sendToClient(client, 'error', 'Not connected to runner');
      return;
    }
    // Forward action to runner (runner expects { type: 'action', data: {...} })
    link.ws.send(JSON.stringify({ type: 'action', data }));
  }

  @SubscribeMessage('record_start')
  async handleRecordStart(@ConnectedSocket() client: any) {
    const link = this.runnerLinks.get(client);
    if (!link || link.ws.readyState !== WebSocket.OPEN) return;
    link.ws.send(JSON.stringify({ type: 'record_start' }));
  }

  @SubscribeMessage('record_stop')
  async handleRecordStop(@ConnectedSocket() client: any) {
    const link = this.runnerLinks.get(client);
    if (!link || link.ws.readyState !== WebSocket.OPEN) return;
    link.ws.send(JSON.stringify({ type: 'record_stop' }));
  }

  @SubscribeMessage('switch_page')
  async handleSwitchPage(
    @ConnectedSocket() client: any,
    @MessageBody() data: { pageId: string },
  ) {
    const link = this.runnerLinks.get(client);
    if (!link || link.ws.readyState !== WebSocket.OPEN) return;
    link.ws.send(JSON.stringify({ type: 'switch_page', data }));
  }
}
