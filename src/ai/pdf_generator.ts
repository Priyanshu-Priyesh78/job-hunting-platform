import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { SearchConfig } from '../types/index.js';

const RESUMES_DIR = path.resolve(process.cwd(), 'resumes');

export class ResumePdfGenerator {
  private config: SearchConfig;

  constructor(config: SearchConfig) {
    this.config = config;
    if (!fs.existsSync(RESUMES_DIR)) {
      fs.mkdirSync(RESUMES_DIR, { recursive: true });
    }
  }

  async generatePdfFromHtml(companyName: string, resumeHtml: string): Promise<{ filename: string; filePath: string }> {
    const cleanCompany = companyName
      .toUpperCase()
      .replace(/,\s*(LLC|INC|LTD|PVT)\.?/gi, '')
      .replace(/[^A-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 30);

    const filename = `PRIYANSHU_PRIYESH_${cleanCompany || 'CUSTOM'}.pdf`;
    const filePath = path.join(RESUMES_DIR, filename);

    const fullDocument = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Priyanshu Priyesh - Resume</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 0;
      color: #0f172a;
      background: #ffffff;
      -webkit-font-smoothing: antialiased;
      line-height: 1.4;
    }
    .header { text-align: center; margin-bottom: 10px; border-bottom: 1.5px solid #0f172a; padding-bottom: 8px; }
    .name { font-size: 20px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; margin: 0 0 2px 0; }
    .headline { font-size: 11px; font-weight: 600; color: #334155; margin-bottom: 3px; }
    .contact { font-size: 10.5px; color: #475569; }
    .section-title {
      font-size: 11.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 2px;
      margin-top: 10px;
      margin-bottom: 5px;
      color: #0f172a;
    }
    .summary-text { font-size: 10.5px; line-height: 1.45; color: #334155; text-align: justify; margin: 0; }
    .skill-row { font-size: 10.5px; line-height: 1.45; margin-bottom: 2px; color: #334155; }
    .skill-label { font-weight: 700; color: #0f172a; }
    ul { margin: 0; padding-left: 18px; font-size: 10.5px; line-height: 1.45; color: #334155; }
    li { margin-bottom: 3px; }
    .exp-header { display: flex; justify-content: space-between; align-items: baseline; }
    .exp-company { font-size: 12.5px; font-weight: 700; color: #0f172a; }
    .exp-title { font-size: 11.5px; font-weight: 600; color: #1e293b; margin: 1px 0 3px 0; }
    .exp-date { font-size: 11px; color: #475569; }
  </style>
</head>
<body>
  ${resumeHtml}
</body>
</html>`;

    const browser = await chromium.launch({
      executablePath: this.config.chromeExecutablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      await page.setContent(fullDocument, { waitUntil: 'load' });

      await page.pdf({
        path: filePath,
        format: 'A4',
        printBackground: true,
        margin: {
          top: '0.35in',
          bottom: '0.35in',
          left: '0.45in',
          right: '0.45in'
        }
      });

      console.log(`Generated tailored PDF from visual editor: ${filePath}`);
      return { filename, filePath };
    } finally {
      await browser.close().catch(() => {});
    }
  }
}
