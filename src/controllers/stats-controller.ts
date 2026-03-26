import { Stats } from '../models/stats';
import { StatsRepository } from '../repositories/stats-repository';
import { StatsService } from '../services/stats-service';

export class StatsController {
  private statsRepository: StatsRepository;
  private statsService: StatsService;

  constructor(statsRepository: StatsRepository, statsService: StatsService) {
    this.statsRepository = statsRepository;
    this.statsService = statsService;
  }

  async getStats() {
    const stats = await this.statsService.getStats();
    return stats;
  }
}