/**
 * Runner Tunnel Gateway
 *
 * Provides a reverse WebSocket tunnel for KRC runners that are behind NAT.
 * KRC connects TO this gateway (outbound from KRC's perspective),
 * enabling KCD to send commands and receive frames without direct access to KRC.
 *
 * Protocol:
 *   KRC → KCD:  { event: 'auth', data: { token: 'ktr_...' } }
 *   KRC → KCD:  { event: 'response', data: { requestId, data?, error? } }
 *   KRC → KCD:  { event: 'frame', data: { sessionId, data: '<base64>' } }
 *   KRC → KCD:  { event: 'session-event', data: { sessionId, eventType, data } }
 *
 *   KCD → KRC:  { type: 'create-session', requestId, data: { platform, url, ... } }
 *   KCD → KRC:  { type: 'close-session', requestId, data: { sessionId } }
 *   KCD → KRC:  { type: 'action', data: { sessionId, action: {...} } }
 *   KCD → KRC:  { type: 'record-start', data: { sessionId } }
 *   KCD → KRC:  { type: 'record-stop', data: { sessionId } }
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
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Server } from 'ws';
import * as WebSocket from 'ws';
import { v4 as uuid } from 'uuid';
import { EventEmitter } from 'events';
import { Runner } from '../account/runner.entity';
import { DeviceSession } from './device-session.entity';

interface ClientState {
  runnerId: string;
  authenticated: boolean;
  authTimer: NodeJS.Timeout;
  frameCount: number;
}

@WebSocketGateway({ path: '/ws/runner-tunnel' })
export class RunnerTunnelGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger('RunnerTunnel');
  private clientState = new Map<any, ClientState>();
  /** runnerId → WebSocket client */
  private tunnels = new Map<string, any>();
  /** requestId → pending promise */
  private pending = new Map<string, { resolve: Function; reject: Function; timer: NodeJS.Timeout }>();
  /** Event emitter for frame/session-event distribution */
  public readonly events = new EventEmitter();

  constructor(
    @InjectRepository(Runner) private runnerRepo: Repository<Runner>,
    @InjectRepository(DeviceSession) private sessionRepo: Repository<DeviceSession>,
  ) {
    this.events.setMaxListeners(200);
  }

  handleConnection(client: any) {
    const authTimer = setTimeout(() => {
      const state = this.clientState.get(client);
      if (!state?.authenticated) {
        this.logger.warn('Runner tunnel auth timeout — disconnecting');
        client.close();
        this.clientState.delete(client);
      }
    }, 15_000);

    this.clientState.set(client, { runnerId: '', authenticated: false, authTimer, frameCount: 0 });
    this.logger.log('Runner tunnel connection attempt');
  }

  handleDisconnect(client: any) {
    const state = this.clientState.get(client);
    if (state) {
      clearTimeout(state.authTimer);
      if (state.runnerId) {
        this.tunnels.delete(state.runnerId);
        this.events.emit(`disconnected:${state.runnerId}`);
        this.logger.log(`Runner tunnel disconnected: ${state.runnerId}`);
      }
    }
    this.clientState.delete(client);
  }

  private sendToClient(client: any, type: string, data: any) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type, data }));
    }
  }

  // ─── Incoming messages from KRC ───────────────────────

  @SubscribeMessage('auth')
  async handleAuth(
    @ConnectedSocket() client: any,
    @MessageBody() data: { token: string },
  ) {
    if (!data?.token) {
      this.sendToClient(client, 'auth_error', 'Token required');
      client.close();
      return;
    }

    const runner = await this.runnerRepo.findOne({ where: { apiToken: data.token } });
    if (!runner) {
      this.sendToClient(client, 'auth_error', 'Invalid runner token');
      client.close();
      return;
    }

    const state = this.clientState.get(client);
    if (state) {
      clearTimeout(state.authTimer);
      state.runnerId = runner.id;
      state.authenticated = true;
    }

    // Replace existing tunnel for this runner
    const existing = this.tunnels.get(runner.id);
    if (existing && existing !== client && existing.readyState === WebSocket.OPEN) {
      existing.close();
    }

    this.tunnels.set(runner.id, client);
    this.events.emit(`connected:${runner.id}`);
    this.logger.log(`Runner tunnel authenticated: ${runner.name} (${runner.id})`);
    this.sendToClient(client, 'auth_ok', { runnerId: runner.id });
  }

  @SubscribeMessage('response')
  handleResponse(
    @ConnectedSocket() client: any,
    @MessageBody() data: { requestId: string; data?: any; error?: string },
  ) {
    const state = this.clientState.get(client);
    if (!state?.authenticated) return;

    const pending = this.pending.get(data.requestId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pending.delete(data.requestId);
      if (data.error) {
        pending.reject(new Error(data.error));
      } else {
        pending.resolve(data.data);
      }
    }
  }

  @SubscribeMessage('frame')
  handleFrame(
    @ConnectedSocket() client: any,
    @MessageBody() data: { sessionId: string; data: string },
  ) {
    const state = this.clientState.get(client);
    if (!state?.authenticated) return;
    state.frameCount++;
    if (state.frameCount === 1) {
      this.logger.log(`First frame received from runner ${state.runnerId} (session: ${data.sessionId}, ${data.data?.length || 0} bytes)`);
    } else if (state.frameCount === 10) {
      this.logger.log(`10 frames received from runner ${state.runnerId} — tunnel frame delivery confirmed`);
    }
    this.events.emit(`frame:${state.runnerId}`, data.sessionId, data.data);
  }

  @SubscribeMessage('session-event')
  async handleSessionEvent(
    @ConnectedSocket() client: any,
    @MessageBody() data: { sessionId: string; eventType: string; data: any },
  ) {
    const state = this.clientState.get(client);
    if (!state?.authenticated) return;
    this.events.emit(
      `session-event:${state.runnerId}`,
      data.sessionId,
      data.eventType,
      data.data,
    );

    // When KRC reports session closed, update the DeviceSession record in DB
    if (data.eventType === 'status' && data.data === 'closed') {
      try {
        const result = await this.sessionRepo
          .createQueryBuilder()
          .update()
          .set({ status: 'closed', closedAt: new Date() })
          .where('runner_session_id = :sid AND runner_id = :rid AND status != :closed', {
            sid: data.sessionId,
            rid: state.runnerId,
            closed: 'closed',
          })
          .execute();
        if (result.affected && result.affected > 0) {
          this.logger.log(`Session ${data.sessionId} marked closed in DB (runner: ${state.runnerId})`);
        }
      } catch (err: any) {
        this.logger.warn(`Failed to mark session closed: ${err.message}`);
      }
    }
  }

  // ─── Public API (called by DeviceService / DeviceGateway) ──

  isConnected(runnerId: string): boolean {
    const ws = this.tunnels.get(runnerId);
    return !!ws && ws.readyState === WebSocket.OPEN;
  }

  /**
   * Send a command to KRC and wait for response.
   * Returns the response data or throws on error/timeout.
   */
  async sendCommand(
    runnerId: string,
    command: string,
    data: any,
    timeoutMs = 130_000,
  ): Promise<any> {
    const ws = this.tunnels.get(runnerId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error('Runner tunnel not connected');
    }

    const requestId = uuid();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Tunnel command '${command}' timed out`));
      }, timeoutMs);

      this.pending.set(requestId, { resolve, reject, timer });
      ws.send(JSON.stringify({ type: command, requestId, data }));
    });
  }

  /**
   * Send a fire-and-forget event to KRC (no response expected).
   */
  sendEvent(runnerId: string, type: string, data: any) {
    const ws = this.tunnels.get(runnerId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, data }));
    }
  }

  /**
   * Subscribe to frames from a specific session on a runner.
   * Returns an unsubscribe function.
   */
  subscribeFrames(
    runnerId: string,
    sessionId: string,
    callback: (frame: string) => void,
  ): () => void {
    const handler = (sid: string, frame: string) => {
      if (sid === sessionId) callback(frame);
    };
    this.events.on(`frame:${runnerId}`, handler);
    return () => this.events.off(`frame:${runnerId}`, handler);
  }

  /**
   * Subscribe to session events from a specific session on a runner.
   * Returns an unsubscribe function.
   */
  subscribeSessionEvents(
    runnerId: string,
    sessionId: string,
    callback: (eventType: string, data: any) => void,
  ): () => void {
    const handler = (sid: string, eventType: string, eventData: any) => {
      if (sid === sessionId) callback(eventType, eventData);
    };
    this.events.on(`session-event:${runnerId}`, handler);
    return () => this.events.off(`session-event:${runnerId}`, handler);
  }
}
