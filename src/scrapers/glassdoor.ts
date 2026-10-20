import { BaseScraper } from './base.js';
import { JobListing, SearchConfig } from '../types/index.js';

export class GlassdoorScraper extends BaseScraper {
  platformName = 'glassdoor';

  constructor(config: SearchConfig) {
    super(config);
  }

  async searchJobs(query: string, location: string): Promise<JobListing[]> {
    const jobs: JobListing[] = [];
    const limit = this.config.scraping.maxJobsPerPlatform || 15;

    console.log(`[Glassdoor] Searching for "${query}" in "${location}"...`);

    try {
      const { page } = await this.initBrowser();

      const url = `https://www.glassdoor.co.in/Job/india-${encodeURIComponent(
        query.toLowerCase().replace(/\s+/g, '-')
      )}-jobs-SRCH_IL.0,5_IN115_KO6,${6 + query.length}.htm`;

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);

      // Close modal
      await page.click('button.CloseButton, [aria-label="Close"]', { timeout: 2000 }).catch(() => {});

      const cards = await page.$$('.JobsList_jobListItem__WFtarget, li[data-test="jobListing"], .jobCard');

      for (let i = 0; i < cards.length && jobs.length < limit; i++) {
        const card = cards[i];

        const title = (
          await card.$eval('[data-test="job-title"], a.JobCard_jobTitle___P9L7', (el: any) => el.innerText).catch(() => '')
        ).trim();

        const company = (
          await card.$eval('[data-test="employer-name"], .EmployerProfile_compactEmployerName__LE242', (el: any) => el.innerText).catch(() => '')
        ).trim();

        const loc = (
          await card.$eval('[data-test="emp-location"], .JobCard_location__rCz3x', (el: any) => el.innerText).catch(() => location)
        ).trim();

        const linkEl = await card.$('a[data-test="job-title"], a');
        let link = linkEl ? await linkEl.getAttribute('href') : '';
        if (link && !link.startsWith('http')) {
          link = `https://www.glassdoor.co.in${link}`;
        }

        if (title && company) {
          jobs.push({
            id: `gd_${title}_${company}`.toLowerCase().replace(/[^a-z0-9]/g, '_'),
            platform: 'glassdoor',
            title,
            company,
            location: loc || location,
            experienceRequired: '0-2 years',
            url: link || 'https://www.glassdoor.co.in',
            status: 'NEW',
            workMode: loc.toLowerCase().includes('remote') ? 'Remote' : 'Unspecified'
          });
        }
      }
    } catch (err: any) {
      console.warn(`[Glassdoor] Notice: ${err.message}`);
    } finally {
      await this.close();
    }

    return jobs;
  }
}

