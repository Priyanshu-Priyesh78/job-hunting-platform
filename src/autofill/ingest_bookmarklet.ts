/**
 * Universal Ingestion Bookmarklet for JobHunter
 * Works when logged into Simplify, Wellfound, Instahyre, LinkedIn, or Direct ATS (Greenhouse/Lever/Workday)
 */

export function getIngestBookmarkletScript(): string {
  const code = `
(function(){
  try {
    var jobs = [];
    var host = window.location.hostname.toLowerCase();
    var href = window.location.href;

    // Helper to sanitize
    function clean(str) { return (str || '').replace(/\\s+/g, ' ').trim(); }

    // 1. SIMPLIFY (simplify.jobs)
    if (host.includes('simplify.jobs')) {
      // Find cards / rows / list items
      var cards = document.querySelectorAll('a[href*="/jobs/"], [data-testid*="job-card"], div[class*="JobCard"], tr, [class*="JobRow"]');
      cards.forEach(function(el) {
        var titleEl = el.querySelector('h2, h3, h4, [class*="title"], [class*="Title"], strong');
        var compEl = el.querySelector('[class*="company"], [class*="Company"], [class*="subtitle"]');
        var linkEl = el.tagName === 'A' ? el : el.querySelector('a[href]');
        var locEl = el.querySelector('[class*="location"], [class*="Location"]');
        if (titleEl && linkEl) {
          jobs.push({
            platform: 'simplify',
            title: clean(titleEl.innerText),
            company: compEl ? clean(compEl.innerText).replace(/^at\\s+/i, '') : 'Company',
            url: linkEl.href,
            location: locEl ? clean(locEl.innerText) : 'Remote / Flexible'
          });
        }
      });
    }
    // 2. WELLFOUND / ANGELLIST (wellfound.com)
    else if (host.includes('wellfound.com') || host.includes('angel.co')) {
      var wCards = document.querySelectorAll('[data-test="JobListing"], [class*="styles_jobListing"], div[class*="jobListing"], div[class*="listing-item"]');
      wCards.forEach(function(el) {
        var titleEl = el.querySelector('h2, h3, [class*="title"], a[href*="/jobs/"]');
        var compEl = el.querySelector('h1, [class*="company"], a[href*="/company/"]');
        var linkEl = el.querySelector('a[href*="/jobs/"]') || el.querySelector('a');
        var locEl = el.querySelector('[class*="location"], [class*="compensation"]');
        if (titleEl && linkEl) {
          jobs.push({
            platform: 'wellfound',
            title: clean(titleEl.innerText),
            company: compEl ? clean(compEl.innerText) : 'Tech Startup',
            url: linkEl.href,
            location: locEl ? clean(locEl.innerText) : 'Remote / India'
          });
        }
      });
    }
    // 3. INSTAHYRE (instahyre.com)
    else if (host.includes('instahyre.com')) {
      var iCards = document.querySelectorAll('.opportunity-card, .job-listing, [ng-repeat*="job"], div[id*="employer-profile"], .employer-details');
      iCards.forEach(function(el) {
        var titleEl = el.querySelector('.position-title, h4, .employer-job-title, [class*="position"]');
        var compEl = el.querySelector('.company-name, .employer-name, h3');
        var linkEl = el.querySelector('a[href*="/job-"], a[href*="/candidate/"], a[href*="/jobs/"]');
        var locEl = el.querySelector('.job-locations, .location');
        var expEl = el.querySelector('.experience, [class*="exp"]');
        if (titleEl && linkEl) {
          jobs.push({
            platform: 'instahyre',
            title: clean(titleEl.innerText),
            company: compEl ? clean(compEl.innerText) : 'Company',
            url: linkEl.href,
            location: locEl ? clean(locEl.innerText) : 'India',
            experienceRequired: expEl ? clean(expEl.innerText) : '1-3 years'
          });
        }
      });
    }
    // 4. LINKEDIN (linkedin.com)
    else if (host.includes('linkedin.com')) {
      var lCards = document.querySelectorAll('.jobs-search-results__list-item, .job-card-container, .job-card-list');
      lCards.forEach(function(el) {
        var titleEl = el.querySelector('.job-card-list__title, .artdeco-entity-lockup__title');
        var compEl = el.querySelector('.job-card-container__primary-description, .artdeco-entity-lockup__subtitle');
        var linkEl = el.querySelector('a[href*="/jobs/view/"], a[href*="/jobs/collections/"]');
        var locEl = el.querySelector('.job-card-container__metadata-item');
        if (titleEl && linkEl) {
          jobs.push({
            platform: 'linkedin',
            title: clean(titleEl.innerText),
            company: compEl ? clean(compEl.innerText) : 'Employer',
            url: linkEl.href.split('?')[0],
            location: locEl ? clean(locEl.innerText) : 'India'
          });
        }
      });
    }
    // 5. DIRECT ATS: GREENHOUSE, LEVER, WORKDAY, ASHBY, ETC.
    else {
      var heading = document.querySelector('h1, .job-title, [class*="jobTitle"], #header')?.innerText || document.title;
      var cleanHeading = clean(heading).split(/\\s+[\\|\\-\\•]\\s+/)[0];
      var comp = host.replace(/^www\\./, '').split('.')[0];
      jobs.push({
        platform: 'direct_ats',
        title: cleanHeading,
        company: comp.charAt(0).toUpperCase() + comp.slice(1),
        url: href,
        location: 'Direct Career Portal'
      });
    }

    // Deduplicate in memory
    var uniqueMap = {};
    var filteredJobs = [];
    jobs.forEach(function(j) {
      var k = (j.title + '_' + j.company).toLowerCase();
      if (!uniqueMap[k] && j.title.length > 2) {
        uniqueMap[k] = true;
        filteredJobs.push(j);
      }
    });

    if (filteredJobs.length === 0) {
      alert('⚠️ JobHunter: No job listings recognized on this page.\\n\\nMake sure you are viewing a job listings feed (e.g. Simplify /jobs, Wellfound /jobs, Instahyre /opportunities) or a specific job posting page.');
      return;
    }

    function showPill(msg, bg) {
      var p = document.getElementById('jh-sync-pill');
      if (!p) {
        p = document.createElement('div');
        p.id = 'jh-sync-pill';
        p.style.cssText = 'position:fixed;top:20px;right:20px;z-index:999999;padding:14px 22px;color:#fff;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;font-size:14px;font-weight:600;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,0.3);transition:opacity 0.4s ease;pointer-events:none;';
        document.body.appendChild(p);
      }
      p.style.background = bg;
      p.innerText = msg;
      p.style.opacity = '1';
      setTimeout(function(){ p.style.opacity = '0'; }, 5500);
    }

    showPill('⏳ Ingesting ' + filteredJobs.length + ' jobs into JobHunter...', '#2563eb');

    fetch('http://localhost:3333/api/jobs/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobs: filteredJobs,
        sourceUrl: href,
        sourcePlatform: host
      })
    })
    .then(function(r){ return r.json(); })
    .then(function(res){
      if (res.success) {
        showPill('✅ JobHunter: Imported ' + res.count + ' jobs (' + (res.directAtsCount || 0) + ' Direct ATS) matching your 1-3 yr profile!', '#059669');
      } else {
        showPill('❌ JobHunter: ' + (res.message || 'Import error'), '#dc2626');
      }
    })
    .catch(function(err){
      showPill('❌ Error connecting to JobHunter server on http://localhost:3333', '#dc2626');
    });

  } catch(e) {
    alert('JobHunter Ingest Bookmarklet Error: ' + e.message);
  }
})();
`;

  return `javascript:${encodeURIComponent(code.replace(/\s+/g, ' ').trim())}`;
}
