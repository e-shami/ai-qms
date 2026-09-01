import { Request, Response } from 'express';
import { getEnv } from '../config';

export function verifyWebhook(req: Request, res: Response): void {
  const env = getEnv();
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.WEBHOOK_VERIFY_TOKEN) {
    console.log('✅ Webhook verified successfully');
    res.status(200).send(challenge);
  } else {
    console.warn('❌ Webhook verification failed:', { mode, token: token ? '***' : 'missing' });
    res.sendStatus(403);
  }
}