import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseScraper } from './base.js';
import { JobListing, SearchConfig } from '../types/index.js';

export class LinkedInScraper extends BaseScraper {
  platformName = 'linkedin';

  constructor(config: SearchConfig) {
    super(config);
  }

  async searchJobs(query: string, location: string, timeFilter = 'week'): Promise<JobListing[]> {
    const jobs: JobListing[] = [];
    const limit = this.config.scraping.maxJobsPerPlatform || 20;

    // Time filter mapping:
    // 6 hours: r21600, 24 hours: r86400, week: r604800
    let tpr = 'r604800';
    if (timeFilter === '6h' || timeFilter === 'past_6_hours') tpr = 'r21600';
    else if (timeFilter === '24h' || timeFilter === 'past_24_hours') tpr = 'r86400';

    console.log(`[LinkedIn] Searching for "${query}" in "${location}" (Time: ${timeFilter}, Levels: Internship/Entry/Associate)...`);

    for (let start = 0; start < limit && jobs.length < limit; ) {
      // f_E=1,2,3 includes Internship, Entry level, and Associate (covering 0-3 years)
      const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(
        query
      )}&location=${encodeURIComponent(location)}&f_E=1,2,3&f_TPR=${tpr}&start=${start}`;

      try {
        const response = await axios.get(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          },
          timeout: 10000
        });

        const $ = cheerio.load(response.data);
        const jobCards = $('li');
        const cardCount = jobCards.length;

        if (cardCount === 0) {
          break;
        }

        for (let i = 0; i < cardCount && jobs.length < limit; i++) {
          const card = $(jobCards[i]);
          const title = card.find('.base-search-card__title').text().trim();
          const company = card.find('.base-search-card__subtitle').text().trim();
          const jobLocation = card.find('.job-search-card__location').text().trim();
          let link = card.find('.base-card__full-link').attr('href') || card.find('a').attr('href') || '';

          if (link) {
            // Strip tracking query parameters
            link = link.split('?')[0];
          }

          const postedDate = card.find('time').text().trim();

          const jobIdMatch = link.match(/\/view\/(\d+)/) || link.match(/(\d{8,12})/);
          const jobId = jobIdMatch ? `li_${jobIdMatch[1]}` : `li_${title}_${company}`.toLowerCase().replace(/\s+/g, '_');

          if (title && company && link) {
            jobs.push({
              id: jobId,
              platform: 'linkedin',
              title,
              company,
              location: jobLocation || location,
              experienceRequired: '0-3 years (Junior / Associate)',
              postedDate,
              url: link,
              status: 'NEW',
              workMode: title.toLowerCase().includes('remote') || jobLocation.toLowerCase().includes('remote') ? 'Remote' : 'Unspecified'
            });
          }
        }

        // Advance start by the actual cards returned (typically 10)
        start += cardCount;

        if (cardCount < 10) {
          break; // Last page reached
        }

        await this.delay(1200);
      } catch (err: any) {
        console.warn(`[LinkedIn] Guest search notice: ${err.message}. Switching to browser search...`);
        return this.searchJobsViaBrowser(query, location);
      }
    }

    // Concurrently fetch job descriptions in small batches (chunks of 4)
    const jobsNeedingDesc = jobs.filter(j => !j.description && j.url).slice(0, 20);
    const chunkSize = 4;
    for (let i = 0; i < jobsNeedingDesc.length; i += chunkSize) {
      const chunk = jobsNeedingDesc.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(async (job) => {
          try {
            const desc = await this.fetchJobDescription(job.url);
            if (desc) {
              job.description = desc;
              // Extract experience hints from description text
              const expMatch = desc.match(/(\d+)\s*(?:-|to|\+)\s*(\d+)?\s*(?:years?|yrs?)/i);
              if (expMatch) {
                job.detectedYearsRequired = expMatch[0];
              }
            }
          } catch {
            // ignore
          }
        })
      );
      await this.delay(600);
    }

    return jobs;
  }

  async fetchJobDescription(jobUrl: string): Promise<string> {
    try {
      const resp = await axios.get(jobUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
        },
        timeout: 8000
      });
      const $ = cheerio.load(resp.data);
      const desc = $('.show-more-less-html__markup').text().trim() || $('.description__text').text().trim();
      return desc.slice(0, 3000);
    } catch {
      return '';
    }
  }

  async searchJobsViaBrowser(query: string, location: string): Promise<JobListing[]> {
    const jobs: JobListing[] = [];
    let page: any = null;

    try {
      const session = await this.initBrowser();
      page = session.page;

      const url = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(
        query
      )}&location=${encodeURIComponent(location)}&f_E=2&f_TPR=r604800`;

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(3000);

      const items = await page.$$('.jobs-search__results-list li');
      for (const item of items.slice(0, 15)) {
        const title = (await item.$eval('.base-search-card__title', (el: any) => el.innerText).catch(() => '')).trim();
        const company = (await item.$eval('.base-search-card__subtitle', (el: any) => el.innerText).catch(() => '')).trim();
        const loc = (await item.$eval('.job-search-card__location', (el: any) => el.innerText).catch(() => '')).trim();
        const link = await item.$eval('a', (el: any) => el.href).catch(() => '');

        if (title && company) {
          jobs.push({
            id: `li_${title}_${company}`.toLowerCase().replace(/[^a-z0-9]/g, '_'),
            platform: 'linkedin',
            title,
            company,
            location: loc || location,
            experienceRequired: '0-2 years',
            url: link.split('?')[0],
            status: 'NEW'
          });
        }
      }
    } catch (err: any) {
      console.warn(`[LinkedIn] Browser search error: ${err.message}`);
    } finally {
      await this.close();
    }

    return jobs;
  }
}

