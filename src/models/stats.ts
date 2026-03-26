export class Stats {
  totalWebhooks: number;
  activeWebhooks: number;
  deliveriesToday: number;
  successRate: number;
  deadLetterCount: number;

  constructor(data: any) {
    this.totalWebhooks = data.totalWebhooks;
    this.activeWebhooks = data.activeWebhooks;
    this.deliveriesToday = data.deliveriesToday;
    this.successRate = data.successRate;
    this.deadLetterCount = data.deadLetterCount;
  }
}