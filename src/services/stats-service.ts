import { Stats } from '../models/stats';
import { StatsRepository } from '../repositories/stats-repository';
import { D1Client } from 'cloudflare-d1';

export class StatsService {
  private statsRepository: StatsRepository;
  private d1Client: D1Client;

  constructor(statsRepository: StatsRepository, d1Client: D1Client) {
    this.statsRepository = statsRepository;
    this.d1Client = d1Client;
  }

  async getStats() {
    const stats = await this.statsRepository.getStats();
    return stats;
  }
}