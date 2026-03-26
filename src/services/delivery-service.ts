import { Delivery } from '../models/delivery';
import { DeliveryRepository } from '../repositories/delivery-repository';
import { D1Client } from 'cloudflare-d1';

export class DeliveryService {
  private deliveryRepository: DeliveryRepository;
  private d1Client: D1Client;

  constructor(deliveryRepository: DeliveryRepository, d1Client: D1Client) {
    this.deliveryRepository = deliveryRepository;
    this.d1Client = d1Client;
  }

  async retryDelivery(delivery: Delivery) {
    await this.d1Client.post(delivery.webhookId, delivery.payload);
  }
}