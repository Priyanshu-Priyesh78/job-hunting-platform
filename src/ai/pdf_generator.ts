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
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: "Nimbus Sans L", "Nimbus Sans", "Helvetica Neue", Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 0;
      color: #000000;
      background: #ffffff;
      -webkit-font-smoothing: antialiased;
      line-height: 1.28;
      font-size: 9.46pt;
    }
    b, strong {
      font-weight: 700;
      color: #000000;
    }
    i, em {
      font-style: italic;
    }
    p {
      text-align: justify;
      margin: 0 0 6px 0;
    }
    ul {
      margin: 0;
      padding-left: 18px;
      font-size: 9.46pt;
      line-height: 1.25;
    }
    li {
      margin-bottom: 2.5px;
      text-align: justify;
    }
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
          top: '0.55in',
          bottom: '0.55in',
          left: '0.55in',
          right: '0.55in'
        }
      });

      console.log(`Generated tailored PDF from visual editor: ${filePath}`);
      return { filename, filePath };
    } finally {
      await browser.close().catch(() => {});
    }
  }
}
