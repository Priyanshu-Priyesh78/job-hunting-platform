import { BaseScraper } from './base.js';
import { JobListing, SearchConfig } from '../types/index.js';

export class WellfoundScraper extends BaseScraper {
  platformName = 'wellfound';

  constructor(config: SearchConfig) {
    super(config);
  }

  async searchJobs(query: string, location: string): Promise<JobListing[]> {
    const jobs: JobListing[] = [];
    const limit = this.config.scraping.maxJobsPerPlatform || 15;

    console.log(`[Wellfound] Searching for "${query}" in "${location}"...`);

    try {
      const { page } = await this.initBrowser();

      const url = `https://wellfound.com/jobs?role=${encodeURIComponent(
        query
      )}&location=${encodeURIComponent(location)}`;

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3500);

      const cards = await page.$$('[data-test="JobSearchResult"], .styles_result__');

      for (let i = 0; i < cards.length && jobs.length < limit; i++) {
        const card = cards[i];

        const title = (
          await card.$eval('[data-test="JobTitle"], .styles_title__', (el: any) => el.innerText).catch(() => '')
        ).trim();

        const company = (
          await card.$eval('[data-test="StartupName"], .styles_company__', (el: any) => el.innerText).catch(() => '')
        ).trim();

        const loc = (
          await card.$eval('[data-test="JobLocation"], .styles_location__', (el: any) => el.innerText).catch(() => location)
        ).trim();

        const linkEl = await card.$('a[data-test="JobTitle"], a');
        let link = linkEl ? await linkEl.getAttribute('href') : '';
        if (link && !link.startsWith('http')) {
          link = `https://wellfound.com${link}`;
        }

        if (title && company) {
          jobs.push({
            id: `wf_${title}_${company}`.toLowerCase().replace(/[^a-z0-9]/g, '_'),
            platform: 'wellfound',
            title,
            company,
            location: loc || location,
            experienceRequired: '0-2 years',
            url: link || 'https://wellfound.com',
            status: 'NEW',
            workMode: loc.toLowerCase().includes('remote') ? 'Remote' : 'Unspecified'
          });
        }
      }
    } catch (err: any) {
      console.warn(`[Wellfound] Notice: ${err.message}`);
    } finally {
      await this.close();
    }

    return jobs;
  }
}

