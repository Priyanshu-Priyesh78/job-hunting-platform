import fs from 'fs';
import path from 'path';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { JobListing, SearchConfig } from '../types/index.js';

const COOKIES_DIR = path.resolve(process.cwd(), 'session_cookies');

export abstract class BaseScraper {
  abstract platformName: string;
  protected config: SearchConfig;
  protected browser?: Browser;
  protected context?: BrowserContext;

  constructor(config: SearchConfig) {
    this.config = config;
    if (!fs.existsSync(COOKIES_DIR)) {
      fs.mkdirSync(COOKIES_DIR, { recursive: true });
    }
  }

  protected getCookiesPath(): string {
    return path.join(COOKIES_DIR, `${this.platformName}_cookies.json`);
  }

  async initBrowser(interactive = false): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
    const headless = interactive ? false : this.config.scraping.headless;

    const browser = await chromium.launch({
      executablePath: this.config.chromeExecutablePath,
      headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-infobars',
        '--window-size=1280,800'
      ]
    });

    const contextOptions: any = {
      viewport: { width: 1280, height: 800 },
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
    };

    const cookiesPath = this.getCookiesPath();
    if (fs.existsSync(cookiesPath)) {
      try {
        const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
        contextOptions.storageState = { cookies, origins: [] };
      } catch (e) {
        // Ignore corrupt cookies
      }
    }

    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();

    // Prevent detection
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    this.browser = browser;
    this.context = context;

    return { browser, context, page };
  }

  async saveSession(context: BrowserContext): Promise<void> {
    const cookies = await context.cookies();
    fs.writeFileSync(this.getCookiesPath(), JSON.stringify(cookies, null, 2), 'utf8');
    console.log(`Saved session cookies for ${this.platformName} to ${this.getCookiesPath()}`);
  }

  async delay(ms?: number): Promise<void> {
    const wait = ms || this.config.scraping.delayBetweenRequestsMs + Math.floor(Math.random() * 1000);
    return new Promise((resolve) => setTimeout(resolve, wait));
  }

  async close(): Promise<void> {
    if (this.context) await this.context.close().catch(() => {});
    if (this.browser) await this.browser.close().catch(() => {});
  }

  abstract searchJobs(query: string, location: string, timeFilter?: string): Promise<JobListing[]>;
}

