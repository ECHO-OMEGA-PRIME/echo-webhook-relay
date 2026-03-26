import { DeadLetter } from '../models/dead-letter';
import { D1Client } from 'cloudflare-d1';

export class DeadLetterRepository {
  private d1Client: D1Client;

  constructor(d1Client: D1Client) {
    this.d1Client = d1Client;
  }

  async createDeadLetter(deadLetter: DeadLetter) {
    await this.d1Client.put('dead-letters', deadLetter.id, deadLetter);
  }

  async listDeadLetters() {
    const deadLetters = await this.d1Client.get('dead-letters');
    return deadLetters;
  }
}