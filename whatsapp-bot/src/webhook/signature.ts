import { createHmac, timingSafeEqual } from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { getEnv } from '../config';

export function verifySignature(req: Request, res: Response, next: NextFunction): void {
  const signature = req.get('X-Hub-Signature-256');
  if (!Buffer.isBuffer(req.body) || !signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) {
    res.sendStatus(401);
    return;
  }
  const expected = createHmac('sha256', getEnv().WHATSAPP_APP_SECRET).update(req.body).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'))) {
    res.sendStatus(401);
    return;
  }
  try {
    req.body = JSON.parse(req.body.toString('utf8'));
  } catch {
    res.sendStatus(400);
    return;
  }
  next();
}
