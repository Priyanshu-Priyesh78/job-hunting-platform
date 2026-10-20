import { chromium, Browser, BrowserContext, Page } from 'playwright';
import fs from 'fs';
import path from 'path';
import { CandidateProfile, SearchConfig } from '../types/index.js';
import { GeminiAI } from '../ai/gemini.js';

export class FormAutofiller {
  private profile: CandidateProfile;
  private config: SearchConfig;
  private ai: GeminiAI;

  constructor(profile: CandidateProfile, config: SearchConfig, ai: GeminiAI) {
    this.profile = profile;
    this.config = config;
    this.ai = ai;
  }

  async launchAutofillSession(jobUrl: string, resumePath?: string): Promise<void> {
    console.log(`\n🌐 Launching Interactive Autofill Browser for: ${jobUrl}`);

    const browser = await chromium.launch({
      executablePath: this.config.chromeExecutablePath,
      headless: false, // VISIBLE to user so they can review and submit!
      args: [
        '--disable-blink-features=AutomationControlled',
        '--window-size=1366,850'
      ]
    });

    const context = await browser.newContext({
      viewport: { width: 1366, height: 850 },
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();

    try {
      await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      console.log('Page loaded. Waiting for form elements...');
      await page.waitForTimeout(3000);

      // Check if there is an "Apply", "Apply Now", or "Easy Apply" button to click first
      const applyBtn = await page.$(
        'button:has-text("Apply"), a:has-text("Apply"), button:has-text("Apply Now"), a:has-text("Apply Now"), button:has-text("Easy Apply")'
      );
      if (applyBtn) {
        console.log('Found Apply button, clicking...');
        await applyBtn.click().catch(() => {});
        await page.waitForTimeout(2000);
      }

      await this.fillStandardInputs(page);

      // Handle resume file upload if provided
      if (resumePath && fs.existsSync(resumePath)) {
        await this.handleResumeUpload(page, resumePath);
      }

      // Handle open-ended textareas with Gemini
      await this.handleCustomQuestions(page);

      console.log('\n======================================================');
      console.log('✅ Autofill complete! Please review all fields in Chrome.');
      console.log('👉 Make any manual adjustments and click SUBMIT yourself.');
      console.log('======================================================\n');

      // Keep browser alive until user closes the window or presses Ctrl+C
      await new Promise((resolve) => {
        page.on('close', () => resolve(true));
      });
    } catch (err: any) {
      console.error('Autofill error:', err.message);
    } finally {
      await browser.close().catch(() => {});
    }
  }

  private async fillStandardInputs(page: Page): Promise<void> {
    const p = this.profile.personal;

    const fieldMappings: Array<{ selectors: string[]; value: string; name: string }> = [
      // First Name
      {
        selectors: [
          'input[name*="first" i]',
          'input[id*="first" i]',
          'input[placeholder*="first name" i]',
          'input[aria-label*="first name" i]'
        ],
        value: p.firstName,
        name: 'First Name'
      },
      // Last Name
      {
        selectors: [
          'input[name*="last" i]',
          'input[id*="last" i]',
          'input[placeholder*="last name" i]',
          'input[aria-label*="last name" i]'
        ],
        value: p.lastName,
        name: 'Last Name'
      },
      // Full Name (if no first/last split)
      {
        selectors: [
          'input[name*="name" i]:not([name*="first" i]):not([name*="last" i])',
          'input[id*="name" i]:not([id*="first" i]):not([id*="last" i])',
          'input[placeholder*="full name" i]',
          'input[aria-label*="full name" i]'
        ],
        value: p.fullName,
        name: 'Full Name'
      },
      // Email
      {
        selectors: [
          'input[type="email"]',
          'input[name*="email" i]',
          'input[id*="email" i]',
          'input[placeholder*="email" i]'
        ],
        value: p.email,
        name: 'Email'
      },
      // Phone
      {
        selectors: [
          'input[type="tel"]',
          'input[name*="phone" i]',
          'input[id*="phone" i]',
          'input[placeholder*="phone" i]',
          'input[placeholder*="mobile" i]'
        ],
        value: p.phoneNumberRaw,
        name: 'Phone'
      },
      // LinkedIn
      {
        selectors: [
          'input[name*="linkedin" i]',
          'input[id*="linkedin" i]',
          'input[placeholder*="linkedin" i]'
        ],
        value: p.linkedin,
        name: 'LinkedIn Profile'
      },
      // GitHub
      {
        selectors: [
          'input[name*="github" i]',
          'input[id*="github" i]',
          'input[placeholder*="github" i]'
        ],
        value: p.github,
        name: 'GitHub Profile'
      },
      // Location / City
      {
        selectors: [
          'input[name*="location" i]',
          'input[id*="location" i]',
          'input[placeholder*="location" i]',
          'input[name*="city" i]',
          'input[id*="city" i]'
        ],
        value: p.currentLocation,
        name: 'Location'
      },
      // College / University
      {
        selectors: [
          'input[name*="school" i]',
          'input[name*="college" i]',
          'input[name*="university" i]',
          'input[id*="school" i]',
          'input[id*="college" i]'
        ],
        value: this.profile.education[0]?.institution || 'LNCT Bhopal',
        name: 'University / College'
      },
      // Current Company
      {
        selectors: [
          'input[name*="current_company" i]',
          'input[name*="company" i]',
          'input[id*="current_company" i]',
          'input[id*="company" i]'
        ],
        value: this.profile.workExperience[0]?.company || 'Revent Labs',
        name: 'Current Company'
      },
      // Total Experience
      {
        selectors: [
          'input[name*="experience" i]',
          'input[id*="experience" i]',
          'input[placeholder*="experience" i]'
        ],
        value: this.profile.standardAnswers.yearsOfExperienceTotal || '1.5',
        name: 'Years of Experience'
      },
      // Notice Period
      {
        selectors: [
          'input[name*="notice" i]',
          'input[id*="notice" i]',
          'input[placeholder*="notice" i]'
        ],
        value: '15-30 days',
        name: 'Notice Period'
      }
    ];

    for (const field of fieldMappings) {
      for (const selector of field.selectors) {
        try {
          const el = await page.$(selector);
          if (el && (await el.isVisible())) {
            const currentVal = await el.inputValue().catch(() => '');
            if (!currentVal) {
              await el.fill(field.value);
              console.log(`Filled [${field.name}]: ${field.value}`);
              break;
            }
          }
        } catch {
          // continue
        }
      }
    }
  }

  private async handleResumeUpload(page: Page, resumePath: string): Promise<void> {
    try {
      const fileInputs = await page.$$('input[type="file"]');
      for (const input of fileInputs) {
        const accept = (await input.getAttribute('accept')) || '';
        const name = (await input.getAttribute('name')) || '';
        const id = (await input.getAttribute('id')) || '';

        if (
          accept.includes('pdf') ||
          accept.includes('doc') ||
          name.toLowerCase().includes('resume') ||
          id.toLowerCase().includes('resume') ||
          name.toLowerCase().includes('cv') ||
          fileInputs.length === 1
        ) {
          await input.setInputFiles(resumePath);
          console.log(`📎 Attached Resume: ${path.basename(resumePath)}`);
          break;
        }
      }
    } catch (e: any) {
      console.warn('Resume attach note:', e.message);
    }
  }

  private async handleCustomQuestions(page: Page): Promise<void> {
    try {
      const textareas = await page.$$('textarea');
      for (const textarea of textareas) {
        if (!(await textarea.isVisible())) continue;

        const currentVal = await textarea.inputValue().catch(() => '');
        if (currentVal && currentVal.length > 5) continue; // already filled

        // Look for preceding label or placeholder
        const labelText =
          (await textarea.getAttribute('placeholder')) ||
          (await textarea.getAttribute('aria-label')) ||
          (await page.evaluate((el: any) => {
            const label = document.querySelector(`label[for="${el.id}"]`);
            if (label) return label.innerText;
            const parent = el.closest('div, fieldset');
            return parent ? parent.innerText : '';
          }, textarea)) ||
          '';

        if (labelText && labelText.trim().length > 10) {
          console.log(`🤖 Detected Question: "${labelText.trim().slice(0, 80)}..."`);
          console.log('Generating tailored answer with Gemini...');

          const answer = await this.ai.answerApplicationQuestion(labelText.trim(), this.profile);
          await textarea.fill(answer);
          console.log(`Filled answer (${answer.length} chars)`);
        }
      }
    } catch (e: any) {
      console.warn('Custom questions handler note:', e.message);
    }
  }
}

