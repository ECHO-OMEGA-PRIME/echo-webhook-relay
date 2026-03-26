import { Webhook } from '../models/webhook';
import { D1Client } from 'cloudflare-d1';

export class WebhookRepository {
  private d1Client: D1Client;

  constructor(d1Client: D1Client) {
    this.d1Client = d1Client;
  }

  async createWebhook(webhook: Webhook) {
    await this.d1Client.put('webhooks', webhook.id, webhook);
  }

  async listWebhooks() {
    const webhooks = await this.d1Client.get('webhooks');
    return webhooks;
  }

  async getWebhook(id: string) {
    const webhook = await this.d1Client.get('webhooks', id);
    return webhook;
  }

  async updateWebhook(webhook: Webhook) {
    await this.d1Client.put('webhooks', webhook.id, webhook);
  }

  async deleteWebhook(id: string) {
    await this.d1Client.delete('webhooks', id);
  }
}