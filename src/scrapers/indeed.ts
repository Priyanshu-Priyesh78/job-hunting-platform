import { BaseScraper } from './base.js';
import { JobListing, SearchConfig } from '../types/index.js';

export class IndeedScraper extends BaseScraper {
  platformName = 'indeed';

  constructor(config: SearchConfig) {
    super(config);
  }

  async searchJobs(query: string, location: string): Promise<JobListing[]> {
    const jobs: JobListing[] = [];
    const limit = this.config.scraping.maxJobsPerPlatform || 20;

    console.log(`[Indeed] Searching for "${query}" in "${location}"...`);

    try {
      const { page } = await this.initBrowser();

      const url = `https://in.indeed.com/jobs?q=${encodeURIComponent(query)}&l=${encodeURIComponent(
        location
      )}&fromage=7`;

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);

      // Dismiss any popups
      await page.click('button.icl-CloseButton, button[aria-label="close"]', { timeout: 2000 }).catch(() => {});

      const cards = await page.$$('.job_seen_beacon, td.resultContent, .jobCard_mainContent');

      for (let i = 0; i < cards.length && jobs.length < limit; i++) {
        const card = cards[i];

        const title = (
          await card.$eval('h2.jobTitle span, h2.jobTitle, a.jcs-JobTitle', (el: any) => el.innerText).catch(() => '')
        ).trim();

        const company = (
          await card.$eval('[data-testid="company-name"], .companyName', (el: any) => el.innerText).catch(() => '')
        ).trim();

        const loc = (
          await card.$eval('[data-testid="text-location"], .companyLocation', (el: any) => el.innerText).catch(() => location)
        ).trim();

        const linkEl = await card.$('a.jcs-JobTitle, h2.jobTitle a, a[data-jk]');
        let link = linkEl ? await linkEl.getAttribute('href') : '';
        let jk = linkEl ? await linkEl.getAttribute('data-jk') : '';

        if (link && !link.startsWith('http')) {
          link = `https://in.indeed.com${link}`;
        }

        const snippet = (
          await card.$eval('.underShelfFooter, .job-snippet', (el: any) => el.innerText).catch(() => '')
        ).trim();

        if (title && company) {
          const jobId = jk ? `indeed_${jk}` : `indeed_${title}_${company}`.toLowerCase().replace(/[^a-z0-9]/g, '_');
          jobs.push({
            id: jobId,
            platform: 'indeed',
            title,
            company,
            location: loc || location,
            experienceRequired: '0-2 years',
            description: snippet,
            url: link || 'https://in.indeed.com',
            status: 'NEW',
            workMode: loc.toLowerCase().includes('remote') || title.toLowerCase().includes('remote') ? 'Remote' : 'Unspecified'
          });
        }
      }
    } catch (err: any) {
      console.warn(`[Indeed] Scraper error: ${err.message}`);
    } finally {
      await this.close();
    }

    return jobs;
  }
}

