import { Delivery } from '../models/delivery';
import { D1Client } from 'cloudflare-d1';

export class DeliveryRepository {
  private d1Client: D1Client;

  constructor(d1Client: D1Client) {
    this.d1Client = d1Client;
  }

  async createDelivery(delivery: Delivery) {
    await this.d1Client.put('deliveries', delivery.id, delivery);
  }

  async listDeliveries() {
    const deliveries = await this.d1Client.get('deliveries');
    return deliveries;
  }

  async getDelivery(id: string) {
    const delivery = await this.d1Client.get('deliveries', id);
    return delivery;
  }
}