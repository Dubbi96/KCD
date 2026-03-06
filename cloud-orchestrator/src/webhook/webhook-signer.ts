import { createHmac } from 'crypto';

export function signPayload(secret: string, payload: any): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const body = `${timestamp}.${JSON.stringify(payload)}`;
  const signature = createHmac('sha256', secret).update(body).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

export function buildSignatureHeaders(
  secret: string | null | undefined,
  payload: any,
): Record<string, string> {
  if (!secret) return {};
  return { 'X-Katab-Signature': signPayload(secret, payload) };
}
