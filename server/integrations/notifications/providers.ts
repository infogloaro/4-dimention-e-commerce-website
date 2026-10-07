import { env } from "../../core/env";
import { logger } from "../../core/logger";

export interface OutboundMessage {
  to: string;
  subject?: string;
  text: string;
  html?: string;
  template: string;
  data?: Record<string, unknown>;
}

export interface MessageProvider {
  readonly name: string;
  send(msg: OutboundMessage): Promise<{ providerRef?: string }>;
}

/** Messages captured by the console provider — lets tests and local dev read verification links / OTPs. */
export const devOutbox: Array<OutboundMessage & { channel: string; at: Date }> = [];
const MAX_OUTBOX = 500;

class ConsoleProvider implements MessageProvider {
  constructor(
    readonly name: string,
    private channel: string,
  ) {}
  async send(msg: OutboundMessage) {
    if (!env.isProd) {
      devOutbox.push({ ...msg, channel: this.channel, at: new Date() });
      if (devOutbox.length > MAX_OUTBOX) devOutbox.shift();
    }
    // Never print message bodies (they can contain tokens/OTPs) outside dev.
    logger.info(`[${this.channel}] message`, env.isProd ? { to: "[hidden]", template: msg.template } : { to: msg.to, template: msg.template, subject: msg.subject });
    return { providerRef: `console-${Date.now()}` };
  }
}

type Channel = "email" | "sms" | "whatsapp";
const registry = new Map<string, MessageProvider>();

/** Register a real provider (SES, Resend, Twilio, Gupshup ...) under a name matching the *_PROVIDER env var. */
export function registerProvider(channel: Channel, name: string, provider: MessageProvider) {
  registry.set(`${channel}:${name}`, provider);
}

export function getProvider(channel: Channel): MessageProvider {
  const name = { email: env.EMAIL_PROVIDER, sms: env.SMS_PROVIDER, whatsapp: env.WHATSAPP_PROVIDER }[channel];
  const found = registry.get(`${channel}:${name}`);
  if (found) return found;
  if (name !== "console") {
    logger.warn("notification provider not registered — falling back to console", { channel, name });
  }
  const fallback = new ConsoleProvider("console", channel);
  registry.set(`${channel}:console`, fallback);
  return fallback;
}
