# 🎯 AI Job Hunting Automation Platform
> Tailored for **Priyanshu Priyesh** — DevOps / SRE (AWS, Kubernetes, Terraform, Platform Engineering)

An automated local job hunting platform that scans job boards, filters by your keywords and 0-2 years experience level, uses **Google Gemini AI** (via your Jio plan) to analyze job descriptions and calculate match scores, maintains a **spreadsheet / CSV tracker**, and provides **browser autofill** so you can apply to dozens of jobs in minutes with zero ban risk.

---

## ⚡ Quick Start

```bash
cd /Users/mac/.gemini/antigravity/scratch/job-hunting-bot

# 1. View your current Dashboard & Top Matched Jobs
npm start dashboard

# 2. Run a live scan across job boards
npm run scan

# 3. Open Chrome with Smart Autofill on any job application
npm run autofill -- "https://in.linkedin.com/jobs/view/..."
```

---

## 🚀 Key Commands

### 1. Scan Job Boards
Scrapes target job boards, matches against your 35+ keywords and 0-2 yrs experience, and runs Gemini to evaluate JD fit:
```bash
# Scan default platforms (LinkedIn, Naukri, Indeed, Wellfound, Instahyre)
npm run scan

# Scan specific platforms
npx tsx src/cli/index.ts scan -p linkedin indeed

# Scan for specific role or location
npx tsx src/cli/index.ts scan -r "Site Reliability Engineer" -l "Bengaluru"
```

### 2. View Dashboard & Tracked Jobs
```bash
npm start dashboard

# Filter by status:
npx tsx src/cli/index.ts dashboard --status NEW
npx tsx src/cli/index.ts dashboard --status APPLIED
```

### 3. Smart Application Autofill (Assisted)
Launches a visible Google Chrome window, navigates to the application, auto-fills all your standard contact, education, and company information, uses **Gemini** to draft answers for open-ended questions ("Why this company?", "Describe your Kubernetes experience"), and leaves the **Submit** button for you to review and click:
```bash
npm run autofill -- "https://example.com/apply"

# With PDF Resume auto-attached:
npm run autofill -- "https://example.com/apply" --resume "/path/to/resume.pdf"
```

### 4. 1-Click Browser Bookmarklet (For Any Browser)
Want to browse manually in your everyday Chrome/Brave browser and autofill with 1 click?
- Open Chrome Bookmarks Manager (`Cmd + Option + B`).
- Add a new Bookmark named `⚡ AutoFill Job`.
- Copy & paste the code from [bookmarklet.js](file:///Users/mac/.gemini/antigravity/scratch/job-hunting-bot/src/autofill/bookmarklet.js) into the URL field.
- Whenever you are on an application page (Workday, Greenhouse, Lever, Naukri, LinkedIn, etc.), click the bookmark and it will instantly populate all fields!

### 5. Instant JD Match Analyzer
Paste any Job Description or URL to get an instant Gemini evaluation:
```bash
npm run analyze -- "We are seeking a DevOps Engineer with AWS, EKS, Terraform, and ArgoCD..."
```
Returns:
- Match Score % (e.g., 95% HIGHLY_RECOMMENDED)
- Matching technical skills
- Missing skills
- Tactical resume tweaks to emphasize
- A tailored 120-word cover letter draft

### 6. Mark Job as Applied
```bash
npm start apply <job_id_or_url>
```

### 7. One-Time Login (Preserve Cookies)
For job boards that require login to see full details:
```bash
npx tsx src/cli/index.ts login linkedin
npx tsx src/cli/index.ts login naukri
```
A browser opens. Log in once. Cookies are saved to `session_cookies/` and reused automatically.

---

## ⏰ Automated 6-Hour Scanner (Mac Native)

To have your Mac run the scanner automatically every 6 hours in the background:
```bash
./scripts/setup_cron.sh
```
Logs are saved to `logs/scheduler.stdout.log`. To disable:
```bash
launchctl unload ~/Library/LaunchAgents/com.priyanshu.jobhunter.plist
```

---

## 📊 Google Sheets Sync

All jobs are automatically saved locally in [jobs.csv](file:///Users/mac/.gemini/antigravity/scratch/job-hunting-bot/jobs.csv).
To also sync directly to Google Sheets:
- Read the 1-minute setup guide in [GOOGLE_SHEETS_SETUP.md](file:///Users/mac/.gemini/antigravity/scratch/job-hunting-bot/docs/GOOGLE_SHEETS_SETUP.md).
- You can either use a **1-click Webhook** (no GCP setup needed) or a **Google Cloud Service Account**.

---

## 🛠️ Configuration Files

- [profile.json](file:///Users/mac/.gemini/antigravity/scratch/job-hunting-bot/config/profile.json): Your parsed resume, contact info, LNCT Bhopal education, Revent Labs experience, and standard answers.
- [search_config.json](file:///Users/mac/.gemini/antigravity/scratch/job-hunting-bot/config/search_config.json): Target roles, experience ranges, locations, and your 35+ keywords.
- `.env`: Gemini API key and optional Google Sheets credentials.

