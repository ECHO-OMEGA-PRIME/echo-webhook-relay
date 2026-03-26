import { Webhook } from '../models/webhook';
import { WebhookRepository } from '../repositories/webhook-repository';
import { D1Client } from 'cloudflare-d1';

export class WebhookService {
  private webhookRepository: WebhookRepository;
  private d1Client: D1Client;

  constructor(webhookRepository: WebhookRepository, d1Client: D1Client) {
    this.webhookRepository = webhookRepository;
    this.d1Client = d1Client;
  }

  async testWebhook(webhook: Webhook) {
    const payload = { event: 'test' };
    const signature = this.generateSignature(payload, webhook.secret);
    const timestamp = Math.floor(Date.now() / 1000);
    const headers = {
      'X-Echo-Signature': signature,
      'X-Echo-Timestamp': timestamp.toString(),
    };
    await this.d1Client.post(webhook.url, payload, headers);
  }

  private generateSignature(payload: any, secret: string) {
    const hmac = require('crypto').createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return hmac.digest('hex');
  }
}