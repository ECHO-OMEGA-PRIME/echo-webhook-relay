import { Delivery } from '../models/delivery';
import { DeliveryRepository } from '../repositories/delivery-repository';
import { DeliveryService } from '../services/delivery-service';

export class DeliveryController {
  private deliveryRepository: DeliveryRepository;
  private deliveryService: DeliveryService;

  constructor(deliveryRepository: DeliveryRepository, deliveryService: DeliveryService) {
    this.deliveryRepository = deliveryRepository;
    this.deliveryService = deliveryService;
  }

  async listDeliveries() {
    const deliveries = await this.deliveryRepository.listDeliveries();
    return deliveries;
  }

  async getDelivery(id: string) {
    const delivery = await this.deliveryRepository.getDelivery(id);
    return delivery;
  }
}