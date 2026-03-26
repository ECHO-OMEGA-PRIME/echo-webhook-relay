import { DeadLetter } from '../models/dead-letter';
import { DeadLetterRepository } from '../repositories/dead-letter-repository';
import { DeadLetterService } from '../services/dead-letter-service';

export class DeadLetterController {
  private deadLetterRepository: DeadLetterRepository;
  private deadLetterService: DeadLetterService;

  constructor(deadLetterRepository: DeadLetterRepository, deadLetterService: DeadLetterService) {
    this.deadLetterRepository = deadLetterRepository;
    this.deadLetterService = deadLetterService;
  }

  async listDeadLetters() {
    const deadLetters = await this.deadLetterRepository.listDeadLetters();
    return deadLetters;
  }

  async retryDeadLetter(id: string) {
    await this.deadLetterService.retryDeadLetter(id);
    return { message: 'Dead letter retried' };
  }

  async discardDeadLetter(id: string) {
    await this.deadLetterService.discardDeadLetter(id);
    return { message: 'Dead letter discarded' };
  }
}