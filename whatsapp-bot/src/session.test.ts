import { describe, it, expect, vi } from 'vitest';

// Use vi.hoisted to set env vars before any imports
const envSetup = vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.WHATSAPP_TOKEN = 'test-token';
  process.env.PHONE_NUMBER_ID = '123456789';
  process.env.WEBHOOK_VERIFY_TOKEN = 'test-verify-token-min-32-chars-long';
  process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  process.env.INTERNAL_API_KEY = 'test-internal-key';
  process.env.BACKEND_API_URL = 'http://localhost:8000/api/v1';
});

vi.mock('../config', () => ({
  getEnv: () => ({
    NODE_ENV: 'test' as const,
    PORT: 3000,
    WHATSAPP_TOKEN: 'test-token',
    PHONE_NUMBER_ID: '123456789',
    WEBHOOK_VERIFY_TOKEN: 'test-verify-token-min-32-chars-long',
    WHATSAPP_API_VERSION: 'v20.0',
    UPSTASH_REDIS_REST_URL: 'https://test.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'test-token',
    BACKEND_API_URL: 'http://localhost:8000/api/v1',
    INTERNAL_API_KEY: 'test-internal-key',
    SESSION_TTL_HOURS: 24,
    SESSION_CLEANUP_INTERVAL_MS: 3_600_000,
    LOG_LEVEL: 'info' as const,
  }),
  validateEnv: vi.fn(),
}));

import { extractPhoneFromMessage, getTextBody, isInteractiveListReply, isInteractiveButtonReply } from './whatsapp/session';
import { WhatsAppMessage } from './whatsapp/types';

describe('WhatsApp Session Helpers', () => {
  describe('extractPhoneFromMessage', () => {
    it('extracts phone number from message', () => {
      const message = { from: '+1234567890' } as WhatsAppMessage;
      expect(extractPhoneFromMessage(message)).toBe('1234567890');
    });

    it('handles phone with spaces and dashes', () => {
      const message = { from: '+1 234 567 890' } as WhatsAppMessage;
      expect(extractPhoneFromMessage(message)).toBe('1234567890');
    });
  });

  describe('getTextBody', () => {
    it('returns text body for text message', () => {
      const message = { type: 'text', text: { body: 'Hello' } } as WhatsAppMessage;
      expect(getTextBody(message)).toBe('Hello');
    });

    it('returns list reply id for interactive list', () => {
      const message = {
        type: 'interactive',
        interactive: { type: 'list_reply', list_reply: { id: 'opt_1', title: 'Option 1' } },
      } as WhatsAppMessage;
      expect(getTextBody(message)).toBe('opt_1');
    });

    it('returns button reply id for interactive button', () => {
      const message = {
        type: 'interactive',
        interactive: { type: 'button_reply', button_reply: { id: 'btn_yes', title: 'Yes' } },
      } as WhatsAppMessage;
      expect(getTextBody(message)).toBe('btn_yes');
    });

    it('returns null for unsupported message types', () => {
      const message = { type: 'image', image: { id: '123', mime_type: 'image/jpeg', sha256: 'abc' } } as WhatsAppMessage;
      expect(getTextBody(message)).toBeNull();
    });
  });

  describe('isInteractiveListReply', () => {
    it('returns true for list reply', () => {
      const message = {
        type: 'interactive',
        interactive: { type: 'list_reply', list_reply: { id: 'opt_1', title: 'Option 1' } },
      } as WhatsAppMessage;
      expect(isInteractiveListReply(message)).toBe(true);
    });

    it('returns false for button reply', () => {
      const message = {
        type: 'interactive',
        interactive: { type: 'button_reply', button_reply: { id: 'btn_1', title: 'Button 1' } },
      } as WhatsAppMessage;
      expect(isInteractiveListReply(message)).toBe(false);
    });

    it('returns false for text message', () => {
      const message = { type: 'text', text: { body: 'Hello' } } as WhatsAppMessage;
      expect(isInteractiveListReply(message)).toBe(false);
    });
  });

  describe('isInteractiveButtonReply', () => {
    it('returns true for button reply', () => {
      const message = {
        type: 'interactive',
        interactive: { type: 'button_reply', button_reply: { id: 'btn_1', title: 'Button 1' } },
      } as WhatsAppMessage;
      expect(isInteractiveButtonReply(message)).toBe(true);
    });

    it('returns false for list reply', () => {
      const message = {
        type: 'interactive',
        interactive: { type: 'list_reply', list_reply: { id: 'opt_1', title: 'Option 1' } },
      } as WhatsAppMessage;
      expect(isInteractiveButtonReply(message)).toBe(false);
    });

    it('returns false for text message', () => {
      const message = { type: 'text', text: { body: 'Hello' } } as WhatsAppMessage;
      expect(isInteractiveButtonReply(message)).toBe(false);
    });
  });
});