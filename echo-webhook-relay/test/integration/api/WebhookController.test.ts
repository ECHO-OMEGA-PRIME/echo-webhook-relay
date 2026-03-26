import { WebhookController } from '../../src/controllers/WebhookController';
import { WebhookService } from '../../src/services/WebhookService';
import { WebhookRepository } from '../../src/repositories/WebhookRepository';
import { Webhook } from '../../src/models/Webhook';
import { express } from 'express';
import { request } from 'supertest';

describe('WebhookController', () => {
  let app: express.Application;
  let webhookService: WebhookService;
  let webhookRepository: WebhookRepository;

  beforeEach(() => {
    webhookRepository = new WebhookRepository();
    webhookService = new WebhookService(webhookRepository);
    const webhookController = new WebhookController(webhookService);
    app = express();
    app.use(express.json());
    app.post('/webhooks', webhookController.createWebhook);
    app.get('/webhooks/:id', webhookController.getWebhook);
    app.put('/webhooks/:id', webhookController.updateWebhook);
    app.delete('/webhooks/:id', webhookController.deleteWebhook);
  });

  it('should create a webhook', async () => {
    const webhook = new Webhook('id', 'url', 'method', {}, 'body');
    const response = await request(app).post('/webhooks').send(webhook);
    expect(response.status).toBe(201);
    expect(response.body).toEqual(webhook);
  });

  it('should get a webhook', async () => {
    const webhook = new Webhook('id', 'url', 'method', {}, 'body');
    await webhookService.createWebhook(webhook);
    const response = await request(app).get('/webhooks/id');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(webhook);
  });

  it('should update a webhook', async () => {
    const webhook = new Webhook('id', 'url', 'method', {}, 'body');
    await webhookService.createWebhook(webhook);
    const updatedWebhook = new Webhook('id', 'new-url', 'new-method', {}, 'new-body');
    const response = await request(app).put('/webhooks/id').send(updatedWebhook);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(updatedWebhook);
  });

  it('should delete a webhook', async () => {
    const webhook = new Webhook('id', 'url', 'method', {}, 'body');
    await webhookService.createWebhook(webhook);
    const response = await request(app).delete('/webhooks/id');
    expect(response.status).toBe(204);
  });
});