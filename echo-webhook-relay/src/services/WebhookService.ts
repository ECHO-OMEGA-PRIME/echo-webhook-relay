import { Webhook } from '../models/Webhook';
import { WebhookRepository } from '../repositories/WebhookRepository';

export class WebhookService {
  private webhookRepository: WebhookRepository;

  constructor(webhookRepository: WebhookRepository) {
    this.webhookRepository = webhookRepository;
  }

  async createWebhook(webhook: Webhook): Promise<Webhook> {
    return this.webhookRepository.createWebhook(webhook);
  }

  async getWebhook(id: string): Promise<Webhook | null> {
    return this.webhookRepository.getWebhook(id);
  }

  async updateWebhook(id: string, webhook: Webhook): Promise<Webhook | null> {
    return this.webhookRepository.updateWebhook(id, webhook);
  }

  async deleteWebhook(id: string): Promise<void> {
    await this.webhookRepository.deleteWebhook(id);
  }
}