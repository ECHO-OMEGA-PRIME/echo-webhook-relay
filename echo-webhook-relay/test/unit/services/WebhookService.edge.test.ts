import { WebhookService } from '../../src/services/WebhookService';
import { WebhookRepository } from '../../src/repositories/WebhookRepository';
import { Webhook } from '../../src/models/Webhook';

describe('WebhookService edge cases', () => {
  let webhookService: WebhookService;
  let webhookRepository: WebhookRepository;

  beforeEach(() => {
    webhookRepository = new WebhookRepository();
    webhookService = new WebhookService(webhookRepository);
  });

  it('should handle null webhook', async () => {
    await expect(webhookService.createWebhook(null)).rejects.toThrow();
  });

  it('should handle empty webhook', async () => {
    await expect(webhookService.createWebhook(new Webhook('', '', '', {}, ''))).rejects.toThrow();
  });

  it('should handle invalid webhook id', async () => {
    await expect(webhookService.getWebhook('invalid-id')).resolves.toBeNull();
  });

  it('should handle invalid webhook update', async () => {
    await expect(webhookService.updateWebhook('id', new Webhook('id', '', '', {}, ''))).rejects.toThrow();
  });
});