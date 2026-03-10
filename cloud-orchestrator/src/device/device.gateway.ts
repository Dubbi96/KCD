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
 *
 * WebRTC signaling (no frame relay — frames go direct P2P):
 *   Client → Cloud:  { event: 'webrtc_request', data: {} }
 *   Cloud → Client:  { type: 'sdp_offer', data: { sdp, type } }
 *   Client → Cloud:  { event: 'sdp_answer', data: { sdp, type } }
 *   Cloud ↔ Client:  { type: 'ice_candidate', data: { candidate, sdpMid, sdpMLineIndex } }
 *   Cloud → Client:  { type: 'webrtc_available', data: { available, iceServers } }
 *   Cloud → Client:  { type: 'webrtc_active', data: true/false }
 *   Cloud → Client:  { type: 'webrtc_state', data: '...' }
 *   Cloud → Client:  { type: 'webrtc_error', data: '...' }
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
import { RunnerTunnelGateway } from './runner-tunnel.gateway';

interface RunnerConnection {
  ws: WebSocket;
  sessionId: string;
  runnerSessionId: string;
  tenantId: string;
}

interface TunnelLink {
  runnerId: string;
  runnerSessionId: string;
  sessionId: string;
  tenantId: string;
  unsubFrame: () => void;
  unsubEvent: () => void;
}

@WebSocketGateway({ path: '/ws/device' })
export class DeviceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger('DeviceGateway');
  /** Map: dashboardClientId → RunnerConnection (direct WS to KRC) */
  private runnerLinks = new Map<any, RunnerConnection>();
  /** Map: dashboardClientId → TunnelLink (via runner tunnel) */
  private tunnelLinks = new Map<any, TunnelLink>();

  constructor(
    @InjectRepository(DeviceSession) private sessionRepo: Repository<DeviceSession>,
    @InjectRepository(Runner) private runnerRepo: Repository<Runner>,
    private jwtService: JwtService,
    private runnerTunnel: RunnerTunnelGateway,
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
    const tunnelLink = this.tunnelLinks.get(client);
    if (tunnelLink) {
      tunnelLink.unsubFrame();
      tunnelLink.unsubEvent();
      this.tunnelLinks.delete(client);
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

      const runnerSessionId = session.runnerSessionId;

      if (!runnerSessionId) {
        this.sendToClient(client, 'error', 'Session not yet initialized on runner');
        return;
      }

      // Prefer tunnel (cloud mode — KRC behind NAT)
      if (this.runnerTunnel.isConnected(runner.id)) {
        this.logger.log(`Joining session ${sessionId} via tunnel (runner: ${runner.name}, runnerSessionId: ${runnerSessionId})`);

        let clientFrameCount = 0;
        const unsubFrame = this.runnerTunnel.subscribeFrames(
          runner.id,
          runnerSessionId,
          (frame: string) => {
            clientFrameCount++;
            if (clientFrameCount === 1) {
              this.logger.log(`First frame received via tunnel for session ${sessionId} (${frame.length} bytes) — forwarding to browser`);
            }
            this.sendToClient(client, 'frame', frame);
          },
        );

        const unsubEvent = this.runnerTunnel.subscribeSessionEvents(
          runner.id,
          runnerSessionId,
          (eventType: string, data: any) => {
            this.sendToClient(client, eventType, data);
          },
        );

        this.tunnelLinks.set(client, {
          runnerId: runner.id,
          runnerSessionId,
          sessionId,
          tenantId: payload.tenantId,
          unsubFrame,
          unsubEvent,
        });

        this.sendToClient(client, 'status', 'connected');
      } else {
        // Fallback: direct WebSocket to runner (local dev)
        const runnerHost = (runner.metadata as any)?.localApiHost || 'localhost';
        const runnerPort = (runner.metadata as any)?.localApiPort || 5001;
        const wsUrl = `ws://${runnerHost}:${runnerPort}/sessions/${runnerSessionId}/stream`;
        this.logger.log(`Connecting to runner WS: ${wsUrl}`);

        const runnerWs = new WebSocket(wsUrl);

        runnerWs.on('open', () => {
          this.logger.log(`Connected to runner WS: ${wsUrl}`);
          this.sendToClient(client, 'status', 'connected');
        });

        runnerWs.on('message', (raw: Buffer) => {
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
      }
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
    // Tunnel path
    const tl = this.tunnelLinks.get(client);
    if (tl) {
      this.runnerTunnel.sendEvent(tl.runnerId, 'action', {
        sessionId: tl.runnerSessionId,
        action: data,
      });
      return;
    }
    // Direct WS path
    const link = this.runnerLinks.get(client);
    if (!link || link.ws.readyState !== WebSocket.OPEN) {
      this.sendToClient(client, 'error', 'Not connected to runner');
      return;
    }
    link.ws.send(JSON.stringify({ type: 'action', data }));
  }

  @SubscribeMessage('record_start')
  async handleRecordStart(@ConnectedSocket() client: any) {
    const tl = this.tunnelLinks.get(client);
    if (tl) {
      this.runnerTunnel.sendEvent(tl.runnerId, 'record-start', { sessionId: tl.runnerSessionId });
      return;
    }
    const link = this.runnerLinks.get(client);
    if (!link || link.ws.readyState !== WebSocket.OPEN) return;
    link.ws.send(JSON.stringify({ type: 'record_start' }));
  }

  @SubscribeMessage('record_stop')
  async handleRecordStop(@ConnectedSocket() client: any) {
    const tl = this.tunnelLinks.get(client);
    if (tl) {
      this.runnerTunnel.sendEvent(tl.runnerId, 'record-stop', { sessionId: tl.runnerSessionId });
      return;
    }
    const link = this.runnerLinks.get(client);
    if (!link || link.ws.readyState !== WebSocket.OPEN) return;
    link.ws.send(JSON.stringify({ type: 'record_stop' }));
  }

  @SubscribeMessage('switch_page')
  async handleSwitchPage(
    @ConnectedSocket() client: any,
    @MessageBody() data: { pageId: string },
  ) {
    const tl = this.tunnelLinks.get(client);
    if (tl) {
      this.runnerTunnel.sendEvent(tl.runnerId, 'switch-page', {
        sessionId: tl.runnerSessionId,
        pageId: data.pageId,
      });
      return;
    }
    const link = this.runnerLinks.get(client);
    if (!link || link.ws.readyState !== WebSocket.OPEN) return;
    link.ws.send(JSON.stringify({ type: 'switch_page', data }));
  }

  // ── WebRTC Signaling Relay ──────────────────────────

  /**
   * Client requests WebRTC upgrade.
   * Forward to the runner, which will create an SDP offer and send it back.
   */
  @SubscribeMessage('webrtc_request')
  async handleWebRTCRequest(@ConnectedSocket() client: any) {
    // WebRTC not supported over tunnel (requires direct P2P)
    const tl = this.tunnelLinks.get(client);
    if (tl) {
      this.sendToClient(client, 'webrtc_available', { available: false, reason: 'tunnel_mode' });
      return;
    }
    const link = this.runnerLinks.get(client);
    if (!link || link.ws.readyState !== WebSocket.OPEN) {
      this.sendToClient(client, 'webrtc_error', 'Not connected to runner');
      return;
    }
    this.logger.log(`WebRTC request from client for session ${link.sessionId}`);
    link.ws.send(JSON.stringify({ type: 'webrtc_request' }));
  }

  @SubscribeMessage('sdp_answer')
  async handleSDPAnswer(
    @ConnectedSocket() client: any,
    @MessageBody() data: { sdp: string; type: string },
  ) {
    const link = this.runnerLinks.get(client);
    if (!link || link.ws.readyState !== WebSocket.OPEN) {
      this.sendToClient(client, 'webrtc_error', 'Not connected to runner');
      return;
    }
    this.logger.log(`SDP answer relay for session ${link.sessionId}`);
    link.ws.send(JSON.stringify({ type: 'sdp_answer', data }));
  }

  @SubscribeMessage('ice_candidate')
  async handleICECandidate(
    @ConnectedSocket() client: any,
    @MessageBody() data: { candidate: string; sdpMid?: string; sdpMLineIndex?: number },
  ) {
    const link = this.runnerLinks.get(client);
    if (!link || link.ws.readyState !== WebSocket.OPEN) return;
    link.ws.send(JSON.stringify({ type: 'ice_candidate', data }));
  }
}
