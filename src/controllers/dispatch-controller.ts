import { Event } from '../models/event';
import { EventRepository } from '../repositories/event-repository';
import { EventService } from '../services/event-service';

export class DispatchController {
  private eventRepository: EventRepository;
  private eventService: EventService;

  constructor(eventRepository: EventRepository, eventService: EventService) {
    this.eventRepository = eventRepository;
    this.eventService = eventService;
  }

  async dispatchEvent(req: any) {
    const event = new Event(req.body);
    await this.eventService.dispatchEvent(event);
    return { message: 'Event dispatched' };
  }

  async dispatchBatchEvents(req: any) {
    const events = req.body;
    await this.eventService.dispatchBatchEvents(events);
    return { message: 'Events dispatched' };
  }
}