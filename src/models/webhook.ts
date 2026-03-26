export class Webhook {
  id: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  description: string;
  createdAt: Date;
  updatedAt: Date;

  constructor(data: any) {
    this.id = data.id;
    this.url = data.url;
    this.events = data.events;
    this.secret = data.secret;
    this.active = data.active;
    this.description = data.description;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }

  update(data: any) {
    this.url = data.url;
    this.events = data.events;
    this.secret = data.secret;
    this.active = data.active;
    this.description = data.description;
    this.updatedAt = new Date();
  }
}