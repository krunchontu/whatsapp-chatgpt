/**
 * WhatsApp Client Manager
 *
 * Provides global access to the WhatsApp client instance.
 * Used by workers and handlers that need to send messages.
 */

import { Client } from 'whatsapp-web.js';
import { logger } from './logger';

let whatsappClient: Client | null = null;

/**
 * Set the WhatsApp client instance
 * Called once during application initialization
 */
export function setWhatsAppClient(client: Client): void {
  if (whatsappClient) {
    logger.warn({ module: 'whatsapp-client' }, 'WhatsApp client already set, overwriting');
  }

  whatsappClient = client;
  logger.info({ module: 'whatsapp-client' }, 'WhatsApp client initialized');
}

/**
 * Get the WhatsApp client instance
 * Throws error if client not initialized
 */
export function getWhatsAppClient(): Client {
  if (!whatsappClient) {
    throw new Error('WhatsApp client not initialized. Call setWhatsAppClient first.');
  }

  return whatsappClient;
}

/**
 * Check if WhatsApp client is initialized
 */
export function isWhatsAppClientInitialized(): boolean {
  return whatsappClient !== null;
}
