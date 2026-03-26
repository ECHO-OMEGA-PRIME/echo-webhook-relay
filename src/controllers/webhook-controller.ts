import { Webhook } from '../models/webhook';
import { WebhookRepository } from '../repositories/webhook-repository';
import { WebhookService } from '../services/webhook-service';

export class WebhookController {
  private webhookRepository: WebhookRepository;
  private webhookService: WebhookService;

  constructor(webhookRepository: WebhookRepository, webhookService: WebhookService) {
    this.webhookRepository = webhookRepository;
    this.webhookService = webhookService;
  }

  async createWebhook(req: any) {
    const webhook = new Webhook(req.body);
    await this.webhookRepository.createWebhook(webhook);
    return { id: webhook.id };
  }

  async listWebhooks() {
    const webhooks = await this.webhookRepository.listWebhooks();
    return webhooks;
  }

  async getWebhook(id: string) {
    const webhook = await this.webhookRepository.getWebhook(id);
    return webhook;
  }

  async updateWebhook(id: string, req: any) {
    const webhook = await this.webhookRepository.getWebhook(id);
    webhook.update(req.body);
    await this.webhookRepository.updateWebhook(webhook);
    return webhook;
  }

  async deleteWebhook(id: string) {
    await this.webhookRepository.deleteWebhook(id);
    return { message: 'Webhook deleted' };
  }

  async testWebhook(id: string) {
    const webhook = await this.webhookRepository.getWebhook(id);
    await this.webhookService.testWebhook(webhook);
    return { message: 'Webhook tested' };
  }
}