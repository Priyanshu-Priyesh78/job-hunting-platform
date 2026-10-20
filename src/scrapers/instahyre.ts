import { BaseScraper } from './base.js';
import { JobListing, SearchConfig } from '../types/index.js';

export class InstahyreScraper extends BaseScraper {
  platformName = 'instahyre';

  constructor(config: SearchConfig) {
    super(config);
  }

  async searchJobs(query: string, location: string): Promise<JobListing[]> {
    const jobs: JobListing[] = [];
    const limit = this.config.scraping.maxJobsPerPlatform || 15;

    console.log(`[Instahyre] Searching for "${query}" in "${location}"...`);

    try {
      const { page } = await this.initBrowser();

      const url = `https://www.instahyre.com/search-jobs/?job_type=0&search=true&skills=${encodeURIComponent(
        query
      )}&years=1`;

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);

      const cards = await page.$$('.employer-row, .opportunity-container, .job-item');

      for (let i = 0; i < cards.length && jobs.length < limit; i++) {
        const card = cards[i];

        const title = (
          await card.$eval('.employer-job-title, .job-title', (el: any) => el.innerText).catch(() => '')
        ).trim();

        const company = (
          await card.$eval('.employer-name, .company-name', (el: any) => el.innerText).catch(() => '')
        ).trim();

        const loc = (
          await card.$eval('.employer-locations, .job-locations', (el: any) => el.innerText).catch(() => location)
        ).trim();

        const linkEl = await card.$('a[href*="/job-"], a.view-job-btn, a');
        let link = linkEl ? await linkEl.getAttribute('href') : '';
        if (link && !link.startsWith('http')) {
          link = `https://www.instahyre.com${link}`;
        }

        if (title && company) {
          jobs.push({
            id: `instahyre_${title}_${company}`.toLowerCase().replace(/[^a-z0-9]/g, '_'),
            platform: 'instahyre',
            title,
            company,
            location: loc || location,
            experienceRequired: '0-2 years',
            url: link || 'https://www.instahyre.com',
            status: 'NEW',
            workMode: loc.toLowerCase().includes('remote') ? 'Remote' : 'Unspecified'
          });
        }
      }
    } catch (err: any) {
      console.warn(`[Instahyre] Notice: ${err.message}`);
    } finally {
      await this.close();
    }

    return jobs;
  }
}

