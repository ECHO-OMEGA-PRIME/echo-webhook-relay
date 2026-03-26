export class Delivery {
  id: string;
  webhookId: string;
  eventType: string;
  payload: any;
  status: string;
  attempts: number;
  lastAttemptAt: Date;
  responseStatus: number;
  responseBody: string;
  latencyMs: number;
  createdAt: Date;

  constructor(data: any) {
    this.id = data.id;
    this.webhookId = data.webhookId;
    this.eventType = data.eventType;
    this.payload = data.payload;
    this.status = data.status;
    this.attempts = data.attempts;
    this.lastAttemptAt = data.lastAttemptAt;
    this.responseStatus = data.responseStatus;
    this.responseBody = data.responseBody;
    this.latencyMs = data.latencyMs;
    this.createdAt = data.createdAt;
  }
}