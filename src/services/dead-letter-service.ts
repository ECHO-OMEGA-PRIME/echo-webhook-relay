import { DeadLetter } from '../models/dead-letter';
import { DeadLetterRepository } from '../repositories/dead-letter-repository';
import { D1Client } from 'cloudflare-d1';

export class DeadLetterService {
  private deadLetterRepository: DeadLetterRepository;
  private d1Client: D1Client;

  constructor(deadLetterRepository: DeadLetterRepository, d1Client: D1Client) {
    this.deadLetterRepository = deadLetterRepository;
    this.d1Client = d1Client;
  }

  async retryDeadLetter(id: string) {
    const deadLetter = await this.deadLetterRepository.getDeadLetter(id);
    await this.d1Client.post(deadLetter.deliveryId, deadLetter.payload);
  }

  async discardDeadLetter(id: string) {
    await this.deadLetterRepository.deleteDeadLetter(id);
  }
}