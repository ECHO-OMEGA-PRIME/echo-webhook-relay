import { Event } from '../models/event';
import { D1Client } from 'cloudflare-d1';

export class EventRepository {
  private d1Client: D1Client;

  constructor(d1Client: D1Client) {
    this.d1Client = d1Client;
  }

  async createEvent(event: Event) {
    await this.d1Client.put('events', event.id, event);
  }

  async listEvents() {
    const events = await this.d1Client.get('events');
    return events;
  }
}