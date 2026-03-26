import { WebhookService } from '../../src/services/WebhookService';
import { WebhookRepository } from '../../src/repositories/WebhookRepository';
import { Webhook } from '../../src/models/Webhook';

describe('WebhookService', () => {
  let webhookService: WebhookService;
  let webhookRepository: WebhookRepository;

  beforeEach(() => {
    webhookRepository = new WebhookRepository();
    webhookService = new WebhookService(webhookRepository);
  });

  it('should create a webhook', async () => {
    const webhook = new Webhook('id', 'url', 'method', {}, 'body');
    const createdWebhook = await webhookService.createWebhook(webhook);
    expect(createdWebhook).toEqual(webhook);
  });

  it('should get a webhook', async () => {
    const webhook = new Webhook('id', 'url', 'method', {}, 'body');
    await webhookRepository.createWebhook(webhook);
    const retrievedWebhook = await webhookService.getWebhook('id');
    expect(retrievedWebhook).toEqual(webhook);
  });

  it('should update a webhook', async () => {
    const webhook = new Webhook('id', 'url', 'method', {}, 'body');
    await webhookRepository.createWebhook(webhook);
    const updatedWebhook = new Webhook('id', 'new-url', 'new-method', {}, 'new-body');
    const updated = await webhookService.updateWebhook('id', updatedWebhook);
    expect(updated).toEqual(updatedWebhook);
  });

  it('should delete a webhook', async () => {
    const webhook = new Webhook('id', 'url', 'method', {}, 'body');
    await webhookRepository.createWebhook(webhook);
    await webhookService.deleteWebhook('id');
    const retrievedWebhook = await webhookService.getWebhook('id');
    expect(retrievedWebhook).toBeNull();
  });
});