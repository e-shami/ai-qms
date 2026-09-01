import express, { Request, Response, NextFunction } from 'express';
import { verifyWebhook } from './webhook/verify';
import { handleWebhook } from './webhook/handler';
import { validateEnv, getEnv } from './config';
import { cleanupExpiredSessions } from './whatsapp/session';
import { getWhatsAppClient, resetWhatsAppClient } from './whatsapp/client';

validateEnv();
const env = getEnv();

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'whatsapp-bot',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.get('/webhook', verifyWebhook);
app.post('/webhook', handleWebhook);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(env.PORT, '0.0.0.0', () => {
  console.log(`🚀 WhatsApp Bot listening on port ${env.PORT}`);
  console.log(`📱 Webhook endpoint: https://<your-domain>/webhook`);
  console.log(`🔍 Health check: http://localhost:${env.PORT}/health`);
});

const cleanupInterval = setInterval(async () => {
  try {
    const cleaned = await cleanupExpiredSessions();
    if (cleaned > 0) {
      console.log(`🧹 Cleaned ${cleaned} expired sessions`);
    }
  } catch (error) {
    console.error('Session cleanup failed:', error);
  }
}, env.SESSION_CLEANUP_INTERVAL_MS);

function shutdown(signal: string) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  clearInterval(cleanupInterval);
  server.close(() => {
    console.log('HTTP server closed');
    resetWhatsAppClient();
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Force shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { app };