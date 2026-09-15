import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
vi.mock('../config', () => ({ getEnv: () => ({ WHATSAPP_APP_SECRET: 'test-secret' }) }));
import { verifySignature } from './signature';

describe('webhook signature', () => {
  it.each(['missing', 'malformed', 'forged', 'valid', 'changed body'])('checks %s signature on raw bytes', kind => {
    const body = Buffer.from('{"object":"whatsapp_business_account"}');
    const valid = 'sha256=' + createHmac('sha256', 'test-secret').update(body).digest('hex');
    const signature = kind === 'missing' ? undefined : kind === 'malformed' ? 'sha256=bad' : kind === 'forged' ? 'sha256=' + '0'.repeat(64) : valid;
    const req = { body: kind === 'changed body' ? Buffer.from('{}') : body, get: () => signature } as unknown as Request;
    const res = { sendStatus: vi.fn() };
    const next = vi.fn();
    verifySignature(req, res as unknown as Response, next);
    if (kind === 'valid') {
      expect(next).toHaveBeenCalled();
      expect(req.body.object).toBe('whatsapp_business_account');
    } else {
      expect(res.sendStatus).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    }
  });
});
