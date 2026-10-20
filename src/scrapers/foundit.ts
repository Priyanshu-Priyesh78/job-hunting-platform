import { BaseScraper } from './base.js';
import { JobListing, SearchConfig } from '../types/index.js';

export class FounditScraper extends BaseScraper {
  platformName = 'foundit';

  constructor(config: SearchConfig) {
    super(config);
  }

  async searchJobs(query: string, location: string): Promise<JobListing[]> {
    const jobs: JobListing[] = [];
    const limit = this.config.scraping.maxJobsPerPlatform || 15;

    console.log(`[Foundit] Searching for "${query}" in "${location}"...`);

    try {
      const { page } = await this.initBrowser();

      const url = `https://www.foundit.in/srp/results?query=${encodeURIComponent(
        query
      )}&locations=${encodeURIComponent(location)}&experienceRanges=0~2`;

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);

      const cards = await page.$$('.srpResultCard, .card-body, .job-card');

      for (let i = 0; i < cards.length && jobs.length < limit; i++) {
        const card = cards[i];

        const title = (
          await card.$eval('.cardTitle, .job-title, h3', (el: any) => el.innerText).catch(() => '')
        ).trim();

        const company = (
          await card.$eval('.companyName, .company-name', (el: any) => el.innerText).catch(() => '')
        ).trim();

        const loc = (
          await card.$eval('.location, .job-location', (el: any) => el.innerText).catch(() => location)
        ).trim();

        const linkEl = await card.$('a.cardTitle, a');
        let link = linkEl ? await linkEl.getAttribute('href') : '';
        if (link && !link.startsWith('http')) {
          link = `https://www.foundit.in${link}`;
        }

        if (title && company) {
          jobs.push({
            id: `foundit_${title}_${company}`.toLowerCase().replace(/[^a-z0-9]/g, '_'),
            platform: 'foundit',
            title,
            company,
            location: loc || location,
            experienceRequired: '0-2 years',
            url: link || 'https://www.foundit.in',
            status: 'NEW',
            workMode: loc.toLowerCase().includes('remote') ? 'Remote' : 'Unspecified'
          });
        }
      }
    } catch (err: any) {
      console.warn(`[Foundit] Notice: ${err.message}`);
    } finally {
      await this.close();
    }

    return jobs;
  }
}

