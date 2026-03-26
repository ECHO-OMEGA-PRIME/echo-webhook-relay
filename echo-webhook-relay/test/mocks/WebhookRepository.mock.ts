import { WebhookRepository } from '../../src/repositories/WebhookRepository';
import { Webhook } from '../../src/models/Webhook';

export class WebhookRepositoryMock implements WebhookRepository {
  private webhooks: { [id: string]: Webhook };

  constructor() {
    this.webhooks = {};
  }

  async createWebhook(webhook: Webhook): Promise<Webhook> {
    this.webhooks[webhook.id] = webhook;
    return webhook;
  }

  async getWebhook(id: string): Promise<Webhook | null> {
    return this.webhooks[id] || null;
  }

  async updateWebhook(id: string, webhook: Webhook): Promise<Webhook | null> {
    if (this.webhooks[id]) {
      this.webhooks[id] = webhook;
      return webhook;
    }
    return null;
  }

  async deleteWebhook(id: string): Promise<void> {
    delete this.webhooks[id];
  }
}