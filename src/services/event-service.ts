import { Event } from '../models/event';
import { EventRepository } from '../repositories/event-repository';
import { D1Client } from 'cloudflare-d1';

export class EventService {
  private eventRepository: EventRepository;
  private d1Client: D1Client;

  constructor(eventRepository: EventRepository, d1Client: D1Client) {
    this.eventRepository = eventRepository;
    this.d1Client = d1Client;
  }

  async dispatchEvent(event: Event) {
    await this.d1Client.post(event.type, event.payload);
  }

  async dispatchBatchEvents(events: Event[]) {
    for (const event of events) {
      await this.dispatchEvent(event);
    }
  }
}