import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { ScraperManager } from '../scrapers/index.js';
import { GeminiAI } from '../ai/gemini.js';
import { JobStore } from '../storage/csv_store.js';
import { GoogleSheetsSync } from '../storage/sheets_sync.js';
import { FormAutofiller } from '../autofill/browser_autofill.js';
import { CandidateProfile, SearchConfig } from '../types/index.js';

const program = new Command();

const profilePath = path.resolve(process.cwd(), 'config/profile.json');
const searchConfigPath = path.resolve(process.cwd(), 'config/search_config.json');

const profile: CandidateProfile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
const searchConfig: SearchConfig = JSON.parse(fs.readFileSync(searchConfigPath, 'utf8'));

const ai = new GeminiAI();
const store = new JobStore();
const sheetsSync = new GoogleSheetsSync();
const scraperManager = new ScraperManager(searchConfig, profile, ai);
const autofiller = new FormAutofiller(profile, searchConfig, ai);

program
  .name('job-hunter')
  .description('AI-Powered Job Hunting Platform & Automation for Priyanshu Priyesh (DevOps / SRE)')
  .version('1.0.0');

// 1. SCAN COMMAND
program
  .command('scan')
  .description('Scan job boards, filter by keywords/experience, run Gemini analysis, and save to CSV/Sheet')
  .option('-p, --platforms <platforms...>', 'Platforms to scan (linkedin, naukri, indeed, wellfound, instahyre, glassdoor, foundit)')
  .option('-r, --role <role>', 'Target role/title', searchConfig.targetRoles[0])
  .option('-l, --location <location>', 'Target location', 'India')
  .option('--no-ai', 'Skip Gemini deep analysis for faster scraping')
  .action(async (options) => {
    console.log(chalk.bold.cyan('\n🔍 JOB HUNTER SCANNER'));
    console.log(chalk.gray('=============================================='));
    console.log(`Candidate: ${chalk.bold(profile.personal.fullName)} (${profile.headline})`);
    console.log(`Role: ${chalk.green(options.role)} | Location: ${chalk.green(options.location)}`);
    console.log(`Platforms: ${chalk.yellow(options.platforms ? options.platforms.join(', ') : 'All enabled')}`);
    console.log(chalk.gray('==============================================\n'));

    const spinner = ora('Scanning job boards...').start();

    try {
      spinner.stop();
      const jobs = await scraperManager.runScan({
        platforms: options.platforms,
        role: options.role,
        location: options.location,
        enableAIAnalysis: options.ai !== false
      });

      const saveRes = await store.saveJobs(jobs);
      console.log(chalk.bold.green(`\n💾 Saved to jobs.csv:`));
      console.log(`   + Added: ${chalk.bold(saveRes.added)} new jobs`);
      console.log(`   ~ Updated: ${saveRes.updated} existing jobs`);
      console.log(`   Total tracked jobs: ${chalk.bold(saveRes.total)}`);

      if (sheetsSync.isConfigured()) {
        const syncSpinner = ora('Syncing to Google Sheets...').start();
        const synced = await sheetsSync.syncJobsToSheet(await store.getAllJobs());
        if (synced) {
          syncSpinner.succeed(chalk.green('Successfully synced with Google Sheets!'));
        } else {
          syncSpinner.fail(chalk.yellow('Google Sheets sync encountered an issue. Check credentials.'));
        }
      } else {
        console.log(chalk.gray('ℹ️ Google Sheets not configured yet. (All data safely stored in jobs.csv)'));
      }
    } catch (err: any) {
      spinner.fail(chalk.red(`Scan failed: ${err.message}`));
      console.error(err);
    }
  });

// 2. DASHBOARD / LIST COMMAND
program
  .command('dashboard')
  .alias('list')
  .description('Display summary dashboard and top recommended jobs')
  .option('-s, --status <status>', 'Filter by status (NEW, APPLIED, REVIEWED)')
  .option('-n, --limit <limit>', 'Number of jobs to show', '15')
  .action(async (options) => {
    const jobs = await store.getAllJobs();

    if (jobs.length === 0) {
      console.log(chalk.yellow('\nNo jobs found in jobs.csv yet. Run `npm run scan` first!'));
      return;
    }

    const total = jobs.length;
    const highlyRec = jobs.filter((j) => j.recommendation === 'HIGHLY_RECOMMENDED' || (j.matchScore || 0) >= 80).length;
    const applied = jobs.filter((j) => j.status === 'APPLIED').length;
    const newJobs = jobs.filter((j) => !j.status || j.status === 'NEW').length;

    console.log(chalk.bold.cyan('\n📊 JOB HUNTING DASHBOARD'));
    console.log(chalk.gray('=============================================='));
    console.log(`Total Tracked: ${chalk.bold(total)} | New: ${chalk.blue(newJobs)} | Highly Recommended: ${chalk.green(highlyRec)} | Applied: ${chalk.magenta(applied)}`);
    console.log(chalk.gray('==============================================\n'));

    let filtered = jobs;
    if (options.status) {
      filtered = filtered.filter((j) => j.status?.toUpperCase() === options.status.toUpperCase());
    }

    // Sort by Match Score descending
    filtered.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

    const limit = parseInt(options.limit, 10);
    const displayList = filtered.slice(0, limit);

    console.log(
      chalk.bold(
        '#'.padEnd(4) +
          'Score'.padEnd(8) +
          'Platform'.padEnd(12) +
          'Company'.padEnd(20) +
          'Title'.padEnd(30) +
          'Location'.padEnd(18) +
          'Status'
      )
    );
    console.log(chalk.gray('-'.repeat(105)));

    displayList.forEach((j, idx) => {
      const scoreStr = j.matchScore ? `${j.matchScore}%` : 'N/A';
      const scoreColored =
        (j.matchScore || 0) >= 80
          ? chalk.green(scoreStr.padEnd(8))
          : (j.matchScore || 0) >= 65
          ? chalk.yellow(scoreStr.padEnd(8))
          : chalk.gray(scoreStr.padEnd(8));

      const statusColored =
        j.status === 'APPLIED'
          ? chalk.magenta('APPLIED')
          : j.status === 'REVIEWED'
          ? chalk.blue('REVIEWED')
          : chalk.cyan('NEW');

      console.log(
        `${(idx + 1).toString().padEnd(4)}${scoreColored}${j.platform.padEnd(12)}${j.company.slice(0, 18).padEnd(20)}${j.title.slice(0, 28).padEnd(30)}${j.location.slice(0, 16).padEnd(18)}${statusColored}`
      );
      if (j.url) {
        console.log(chalk.gray(`     URL: ${j.url}`));
      }
    });

    console.log(chalk.gray('\nTip: To autofill any job above, run:'));
    console.log(chalk.cyan(`npm run autofill -- <url>`));
  });

// 3. AUTOFILL COMMAND
program
  .command('autofill <url>')
  .description('Open Chrome with Smart Autofill assistant for a given job application URL')
  .option('-r, --resume <path>', 'Path to resume PDF file to auto-attach')
  .action(async (url, options) => {
    console.log(chalk.bold.cyan('\n🤖 SMART AUTOFILL ASSISTANT'));
    console.log(chalk.gray('=============================================='));
    console.log(`Target: ${chalk.green(url)}`);
    console.log(`Candidate: ${chalk.bold(profile.personal.fullName)}`);
    console.log(chalk.gray('==============================================\n'));

    await autofiller.launchAutofillSession(url, options.resume);
  });

// 4. ANALYZE COMMAND
program
  .command('analyze <input>')
  .description('Analyze a job description text or URL with Gemini to get match report & cover letter')
  .option('-c, --company <company>', 'Company name (if passing text directly)', 'Target Company')
  .option('-t, --title <title>', 'Job title (if passing text directly)', 'DevOps Engineer')
  .action(async (input, options) => {
    const spinner = ora('Analyzing Job Description with Gemini...').start();

    try {
      let description = input;
      let title = options.title;
      let company = options.company;

      if (input.startsWith('http://') || input.startsWith('https://')) {
        spinner.text = 'Fetching job description from URL...';
        const resp = await fetch(input);
        description = await resp.text();
      }

      spinner.text = 'Running Gemini Deep Analysis against Priyanshu\'s Profile...';
      const result = await ai.analyzeJobDescription(
        { title, company, description },
        profile,
        searchConfig.keywords
      );

      spinner.succeed(chalk.green('Analysis Complete!'));

      console.log(chalk.bold.cyan('\n🎯 MATCH REPORT'));
      console.log(chalk.gray('=============================================='));
      console.log(`Match Score: ${chalk.bold.green(result.matchScore + '%')} (${result.recommendation})`);
      console.log(chalk.bold('\nMatched Skills:'));
      console.log(chalk.green(result.matchedKeywords.join(', ') || 'None'));

      if (result.missingKeywords.length > 0) {
        console.log(chalk.bold('\nMissing / Target Skills to Highlight:'));
        console.log(chalk.yellow(result.missingKeywords.join(', ')));
      }

      console.log(chalk.bold('\nJob Summary:'));
      console.log(result.jdSummary);

      console.log(chalk.bold('\nRecommended Resume Tweaks:'));
      result.resumeTweaks.forEach((t) => console.log(`• ${t}`));

      console.log(chalk.bold('\nTailored Pitch / Cover Letter:'));
      console.log(chalk.cyan(result.draftCoverLetter));
      console.log(chalk.gray('==============================================\n'));
    } catch (err: any) {
      spinner.fail(chalk.red(`Analysis failed: ${err.message}`));
    }
  });

// 5. APPLY / STATUS COMMAND
program
  .command('apply <id>')
  .description('Mark a job as APPLIED in jobs.csv')
  .option('-n, --notes <notes>', 'Optional notes about the application')
  .action(async (id, options) => {
    const updated = await store.updateJobStatus(id, 'APPLIED', options.notes);
    if (updated) {
      console.log(chalk.green(`\n✅ Marked job "${id}" as APPLIED on ${new Date().toISOString().split('T')[0]}`));
    } else {
      console.log(chalk.yellow(`\nJob with ID or URL "${id}" not found in jobs.csv.`));
    }
  });

// 6. LOGIN COMMAND (Persistent Session)
program
  .command('login <platform>')
  .description('Open Chrome to log in once to a platform (saves cookies for subsequent runs)')
  .action(async (platform) => {
    console.log(chalk.bold.cyan(`\n🔑 ONE-TIME LOGIN: ${platform.toUpperCase()}`));
    console.log(chalk.yellow('A Chrome window will open. Please log in manually.'));
    console.log(chalk.yellow('When you are done logging in, close the browser or press Ctrl+C to save cookies!\n'));

    const scraper = scraperManager.getScraper(platform);
    if (!scraper) {
      console.error(chalk.red(`Platform ${platform} not recognized.`));
      return;
    }

    const { page, context } = await scraper.initBrowser(true); // interactive non-headless

    let targetUrl = 'https://www.google.com';
    if (platform === 'linkedin') targetUrl = 'https://www.linkedin.com/login';
    else if (platform === 'naukri') targetUrl = 'https://www.naukri.com/nlogin/login';
    else if (platform === 'indeed') targetUrl = 'https://secure.indeed.com/account/login';
    else if (platform === 'wellfound') targetUrl = 'https://wellfound.com/login';
    else if (platform === 'instahyre') targetUrl = 'https://www.instahyre.com/candidate/login/';

    await page.goto(targetUrl).catch(() => {});

    await new Promise((resolve) => {
      page.on('close', async () => {
        await scraper.saveSession(context);
        resolve(true);
      });
    });

    console.log(chalk.green(`\n✅ Login session for ${platform} successfully saved!`));
  });

program.parse(process.argv);

