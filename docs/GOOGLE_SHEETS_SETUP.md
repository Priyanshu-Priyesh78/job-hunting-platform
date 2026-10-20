# 📊 Google Sheets Integration Guide

There are 3 easy ways to sync your scanned jobs with Google Sheets:

---

## ⚡ Option 1: 1-Click Webhook Sync (Easiest — No GCP setup needed)

1. Open a new Google Sheet: [sheets.new](https://sheets.new)
2. In the menu, click **Extensions** > **Apps Script**
3. Replace the code in the editor with this script:

```javascript
function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = JSON.parse(e.postData.contents);
  
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "ID", "Platform", "Title", "Company", "Location", "Exp Required",
      "Match Score %", "Recommendation", "Matched Keywords", "Missing Keywords",
      "Application URL", "Status", "Date Posted", "Date Applied", "Notes"
    ]);
  }
  
  data.forEach(function(row) {
    sheet.appendRow([
      row.id, row.platform, row.title, row.company, row.location, row.experienceRequired,
      row.matchScore, row.recommendation, (row.matchedKeywords || []).join(", "),
      (row.missingKeywords || []).join(", "), row.url, row.status || "NEW",
      row.postedDate || "", row.appliedDate || "", row.notes || ""
    ]);
  });
  
  return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
}
```

4. Click **Deploy** > **New Deployment**
   - Select type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the Web App URL and add it to your `.env`:
   ```bash
   GOOGLE_SHEET_WEBHOOK_URL="https://script.google.com/macros/s/..."
   ```

---

## 🔑 Option 2: Google Cloud Service Account (Official API)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the **Google Sheets API**
3. Create a **Service Account** and generate a JSON Key.
4. Download the JSON key file and place it in the project root as `service-account.json`.
5. Create a Google Sheet and share it (Editor permissions) with the service account email (e.g., `job-hunter@your-project.iam.gserviceaccount.com`).
6. Copy the Spreadsheet ID from the URL (`https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit`).
7. Update your `.env`:
   ```bash
   GOOGLE_SHEET_ID="your_spreadsheet_id_here"
   GOOGLE_SERVICE_ACCOUNT_KEY_PATH="./service-account.json"
   ```

---

## 📁 Option 3: Instant Local CSV Import

You don't even need API credentials!
Every run saves all jobs to `jobs.csv` in your project folder.
- In Google Sheets: Click **File** > **Import** > **Upload** > Select `jobs.csv`.

