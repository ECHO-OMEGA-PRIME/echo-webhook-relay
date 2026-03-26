export class DeadLetter {
  id: string;
  deliveryId: string;
  reason: string;
  createdAt: Date;

  constructor(data: any) {
    this.id = data.id;
    this.deliveryId = data.deliveryId;
    this.reason = data.reason;
    this.createdAt = data.createdAt;
  }
}