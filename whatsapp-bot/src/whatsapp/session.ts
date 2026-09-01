import { Redis } from '@upstash/redis';
import { getEnv } from '../config';
import { WhatsAppMessage } from './types';

export type SessionState =
  | 'idle'
  | 'awaiting_institution'
  | 'awaiting_counter'
  | 'awaiting_name'
  | 'awaiting_confirmation'
  | 'in_queue'
  | 'checking_status'
  | 'support_escalated';

export interface SessionData {
  institutionId?: string;
  institutionName?: string;
  institutionCode?: string;
  counterId?: string;
  counterName?: string;
  counterPrefix?: string;
  customerName?: string;
  tokenNumber?: string;
  tokenId?: string;
  lastMessageId?: string;
  flow?: 'join_queue' | 'check_status' | 'cancel_token' | 'support';
  step?: number;
  awaitingHuman?: boolean;
}

export interface UserSession {
  phone: string;
  state: SessionState;
  data: SessionData;
  updatedAt: number;
  createdAt: number;
}

const SESSION_PREFIX = 'wa:session:';
const SESSION_TTL_SECONDS = getEnv().SESSION_TTL_HOURS * 3600;

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    const env = getEnv();
    redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return redis;
}

export async function getSession(phone: string): Promise<UserSession> {
  const redis = getRedis();
  const key = `${SESSION_PREFIX}${phone}`;
  const existing = await redis.get<UserSession>(key);

  if (existing) {
    return existing;
  }

  const fresh: UserSession = {
    phone,
    state: 'idle',
    data: {},
    updatedAt: Date.now(),
    createdAt: Date.now(),
  };
  await redis.set(key, fresh, { ex: SESSION_TTL_SECONDS });
  return fresh;
}

export async function updateSession(
  phone: string,
  updates: Partial<Pick<UserSession, 'state' | 'data'>> & { lastMessageId?: string }
): Promise<UserSession> {
  const redis = getRedis();
  const key = `${SESSION_PREFIX}${phone}`;
  const session = await getSession(phone);

  const updated: UserSession = {
    ...session,
    ...updates,
    data: { ...session.data, ...updates.data },
    updatedAt: Date.now(),
  };

  if (updates.lastMessageId) {
    updated.data = { ...updated.data, lastMessageId: updates.lastMessageId };
  }

  await redis.set(key, updated, { ex: SESSION_TTL_SECONDS });
  return updated;
}

export async function clearSession(phone: string): Promise<void> {
  const redis = getRedis();
  const key = `${SESSION_PREFIX}${phone}`;
  await redis.del(key);
}

export async function resetSession(phone: string): Promise<UserSession> {
  const redis = getRedis();
  const key = `${SESSION_PREFIX}${phone}`;

  const fresh: UserSession = {
    phone,
    state: 'idle',
    data: {},
    updatedAt: Date.now(),
    createdAt: Date.now(),
  };
  await redis.set(key, fresh, { ex: SESSION_TTL_SECONDS });
  return fresh;
}

export async function cleanupExpiredSessions(): Promise<number> {
  const redis = getRedis();
  const pattern = `${SESSION_PREFIX}*`;
  let cleaned = 0;

  let cursor = 0;
  do {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await redis.scan(cursor, { match: pattern, count: 100 });
    cursor = result.cursor;
    for (const key of result.keys) {
      const session = await redis.get<UserSession>(key);
      if (session && Date.now() - session.updatedAt > SESSION_TTL_SECONDS * 1000) {
        await redis.del(key);
        cleaned++;
      }
    }
  } while (cursor !== 0);

  return cleaned;
}

export function extractPhoneFromMessage(message: WhatsAppMessage): string {
  return message.from.replace(/\D/g, '');
}

export function isInteractiveListReply(message: WhatsAppMessage): message is WhatsAppMessage & { interactive: { type: 'list_reply'; list_reply: { id: string; title: string } } } {
  return message.type === 'interactive' && message.interactive?.type === 'list_reply';
}

export function isInteractiveButtonReply(message: WhatsAppMessage): message is WhatsAppMessage & { interactive: { type: 'button_reply'; button_reply: { id: string; title: string } } } {
  return message.type === 'interactive' && message.interactive?.type === 'button_reply';
}

export function getTextBody(message: WhatsAppMessage): string | null {
  if (message.type === 'text') return message.text?.body?.trim() ?? null;
  if (isInteractiveListReply(message)) return message.interactive.list_reply.id;
  if (isInteractiveButtonReply(message)) return message.interactive.button_reply.id;
  return null;
}