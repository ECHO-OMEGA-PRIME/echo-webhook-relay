import { Stats } from '../models/stats';
import { D1Client } from 'cloudflare-d1';

export class StatsRepository {
  private d1Client: D1Client;

  constructor(d1Client: D1Client) {
    this.d1Client = d1Client;
  }

  async getStats() {
    const stats = await this.d1Client.get('stats');
    return stats;
  }
}