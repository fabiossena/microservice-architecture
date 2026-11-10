import { randomUUID } from 'node:crypto';
import amqp from 'amqplib';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Small AMQP client with automatic reconnection.
 * Every service publishes to and consumes from the durable topic exchange "orders".
 */
export class Broker {
  constructor({ url, exchange, serviceName, logger = console }) {
    this.url = url;
    this.exchange = exchange;
    this.serviceName = serviceName;
    this.logger = logger;
    this.connection = null;
    this.channel = null;
    this.connected = false;
    this.connecting = false;
    this.closing = false;
    this.subscriptions = [];
  }

  async start() {
    this.closing = false;
    await this.connect();
  }

  async connect() {
    if (this.connecting || this.closing) return;
    this.connecting = true;

    try {
      while (!this.closing) {
        try {
          this.connection = await amqp.connect(this.url);
          this.connection.on('error', (err) => {
            this.logger.error(`[broker] connection error: ${err.message}`);
          });
          this.connection.on('close', () => {
            this.connected = false;
            this.logger.warn('[broker] connection closed');
            if (!this.closing) setTimeout(() => this.connect(), 3000).unref();
          });

          this.channel = await this.connection.createChannel();
          this.channel.on('error', (err) => {
            this.logger.error(`[broker] channel error: ${err.message}`);
          });

          await this.channel.assertExchange(this.exchange, 'topic', { durable: true });

          for (const subscription of this.subscriptions) {
            await this.setupSubscription(subscription);
          }

          this.connected = true;
          this.logger.info(`[broker] connected to ${this.url.replace(/:[^:@/]+@/, ':***@')}`);
          return;
        } catch (err) {
          this.connected = false;
          this.logger.error(`[broker] connection attempt failed: ${err.message}`);
          await sleep(3000);
        }
      }
    } finally {
      this.connecting = false;
    }
  }

  async setupSubscription({ queue, patterns, handler }) {
    await this.channel.assertQueue(queue, { durable: true });
    for (const pattern of patterns) {
      await this.channel.bindQueue(queue, this.exchange, pattern);
    }
    await this.channel.prefetch(10);
    await this.channel.consume(queue, async (message) => {
      if (!message) return;
      try {
        const event = JSON.parse(message.content.toString('utf8'));
        await handler(event);
        this.channel.ack(message);
      } catch (err) {
        this.logger.error(`[${queue}] message processing failed: ${err.stack || err.message}`);
        this.channel.nack(message, false, false);
      }
    });
  }

  subscribe(queue, patterns, handler) {
    const subscription = { queue, patterns: [...new Set(patterns)], handler };
    this.subscriptions.push(subscription);
    if (this.channel) {
      this.setupSubscription(subscription).catch((err) => {
        this.logger.error(`[broker] failed to subscribe ${queue}: ${err.message}`);
      });
    }
    return subscription;
  }

  async publish(type, { user = null, message = '', payload = {}, correlationId = null } = {}) {
    if (!this.channel || !this.connected) {
      throw new Error('Broker is not available to publish');
    }

    const event = {
      id: randomUUID(),
      type,
      source: this.serviceName,
      occurredAt: new Date().toISOString(),
      correlationId: correlationId || randomUUID(),
      user,
      message,
      payload
    };

    this.channel.publish(this.exchange, type, Buffer.from(JSON.stringify(event)), {
      persistent: true,
      contentType: 'application/json',
      messageId: event.id,
      type
    });

    return event;
  }

  async stop() {
    this.closing = true;
    try {
      await this.channel?.close();
      await this.connection?.close();
    } catch {
      // best-effort shutdown
    }
    this.connected = false;
  }
}
