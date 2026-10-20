import { BaseScraper } from './base.js';
import { JobListing, SearchConfig } from '../types/index.js';

export class NaukriScraper extends BaseScraper {
  platformName = 'naukri';

  constructor(config: SearchConfig) {
    super(config);
  }

  async searchJobs(query: string, location: string): Promise<JobListing[]> {
    const jobs: JobListing[] = [];
    const limit = this.config.scraping.maxJobsPerPlatform || 20;

    console.log(`[Naukri] Searching for "${query}" in "${location}" (0-2 yrs)...`);

    try {
      const { page } = await this.initBrowser();

      // Naukri experience filter (0 to 2 years)
      const formattedQuery = encodeURIComponent(query.toLowerCase().replace(/\s+/g, '-'));
      const formattedLocation = encodeURIComponent(location.toLowerCase().replace(/\s+/g, '-'));
      const url = `https://www.naukri.com/${formattedQuery}-jobs-in-${formattedLocation}?k=${encodeURIComponent(
        query
      )}&experience=1`;

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3500);

      // Handle any banner/overlays if present
      await page.click('.crossIcon, .close, .banner-close', { timeout: 2000 }).catch(() => {});

      // Wait for job cards
      await page.waitForSelector('.srp-jobtuple-wrapper, .cust-job-tuple, .jobTuple', { timeout: 8000 }).catch(() => {});

      const cards = await page.$$('.srp-jobtuple-wrapper, .cust-job-tuple, .jobTuple');

      for (let i = 0; i < cards.length && jobs.length < limit; i++) {
        const card = cards[i];

        const title = (
          await card.$eval('a.title, .title', (el: any) => el.innerText || el.textContent).catch(() => '')
        ).trim();

        const company = (
          await card.$eval('a.comp-name, .comp-name', (el: any) => el.innerText || el.textContent).catch(() => '')
        ).trim();

        const exp = (
          await card.$eval('.expwdth, .exp-wrap, .experience', (el: any) => el.innerText || el.textContent).catch(() => '0-2 Yrs')
        ).trim();

        const loc = (
          await card.$eval('.locWdth, .loc-wrap, .location', (el: any) => el.innerText || el.textContent).catch(() => location)
        ).trim();

        const link = (
          await card.$eval('a.title, .title a, a', (el: any) => el.href).catch(() => '')
        ).trim();

        const snippet = (
          await card.$eval('.job-desc, .desc, .tags-gt', (el: any) => el.innerText || el.textContent).catch(() => '')
        ).trim();

        if (title && company) {
          const jobId = `naukri_${title}_${company}`.toLowerCase().replace(/[^a-z0-9]/g, '_');
          jobs.push({
            id: jobId,
            platform: 'naukri',
            title,
            company,
            location: loc || location,
            experienceRequired: exp || '0-2 Yrs',
            description: snippet,
            url: link || `https://www.naukri.com`,
            status: 'NEW',
            workMode: loc.toLowerCase().includes('remote') ? 'Remote' : 'Unspecified'
          });
        }
      }
    } catch (err: any) {
      console.warn(`[Naukri] Scraper error: ${err.message}`);
    } finally {
      await this.close();
    }

    return jobs;
  }
}

