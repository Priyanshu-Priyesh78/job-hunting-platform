/**
 * Universal Ingestion Bookmarklet for JobHunter
 * Works on: Wellfound, Simplify, Instahyre, LinkedIn, Greenhouse, Lever, Workday
 * Bypasses browser HTTPS Mixed-Content and Content Security Policy (CSP)
 * via Clipboard Data Bridge + Direct Form Bridge.
 */

export function getIngestBookmarkletScript(): string {
  const code = `
(function(){
  try {
    var jobs = [];
    var host = window.location.hostname.toLowerCase();
    var href = window.location.href;

    function clean(str) { return (str || '').replace(/\\s+/g, ' ').trim(); }

    // 1. WELLFOUND (Supports both Next.js Data state & DOM cards)
    if (host.includes('wellfound.com') || host.includes('angel.co')) {
      if (window.__NEXT_DATA__ && window.__NEXT_DATA__.props && window.__NEXT_DATA__.props.pageProps) {
        var apollo = window.__NEXT_DATA__.props.pageProps.apolloState ? window.__NEXT_DATA__.props.pageProps.apolloState.data : {};
        var jobToStartup = {};
        Object.keys(apollo).forEach(function(k) {
          if (k.startsWith('StartupResult:') || k.startsWith('Startup:')) {
            var s = apollo[k];
            if (s.highlightedJobListings && Array.isArray(s.highlightedJobListings)) {
              s.highlightedJobListings.forEach(function(item) {
                if (item.__ref) jobToStartup[item.__ref] = s;
              });
            }
          }
        });

        Object.keys(apollo).forEach(function(k) {
          if (k.startsWith('JobListingSearchResult:') || k.startsWith('JobListing:')) {
            var item = apollo[k];
            var startup = jobToStartup[k] || {};
            var title = clean(item.title || item.slug || '');
            if (title) {
              var sSlug = startup.slug || 'company';
              var jSlug = item.slug || 'job';
              var id = item.id || k.replace(/^[^:]+:/, '');
              var locs = Array.isArray(item.locationNames) ? item.locationNames.join(', ') : 'India / Remote';
              jobs.push({
                platform: 'wellfound',
                title: title,
                company: clean(startup.name || 'Startup'),
                url: 'https://wellfound.com/company/' + sSlug + '/jobs/' + id + '-' + jSlug,
                location: item.remote ? locs + ' (Remote)' : locs,
                description: item.description || ''
              });
            }
          }
        });
      }

      // DOM fallback
      if (jobs.length === 0) {
        document.querySelectorAll('[data-test="JobListing"], [class*="jobListing"], div[class*="styles_result"]').forEach(function(el) {
          var titleEl = el.querySelector('h2, h3, h4, a[href*="/jobs/"], [class*="title"]');
          var compEl = el.querySelector('h1, h2, [class*="company"], a[href*="/company/"]');
          var linkEl = el.querySelector('a[href*="/jobs/"]') || el.querySelector('a');
          var locEl = el.querySelector('[class*="location"], [class*="compensation"]');
          if (titleEl && linkEl) {
            jobs.push({
              platform: 'wellfound',
              title: clean(titleEl.innerText),
              company: compEl ? clean(compEl.innerText) : 'Tech Startup',
              url: linkEl.href,
              location: locEl ? clean(locEl.innerText) : 'India / Remote'
            });
          }
        });
      }
    }
    // 2. SIMPLIFY (simplify.jobs)
    else if (host.includes('simplify.jobs')) {
      document.querySelectorAll('a[href*="/jobs/"], [data-testid*="job-card"], div[class*="JobCard"], tr').forEach(function(el) {
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
            location: locEl ? clean(locEl.innerText) : 'India / Remote'
          });
        }
      });
    }
    // 3. INSTAHYRE (instahyre.com)
    else if (host.includes('instahyre.com')) {
      document.querySelectorAll('.opportunity-card, .job-listing, [ng-repeat*="job"], div[id*="employer-profile"]').forEach(function(el) {
        var titleEl = el.querySelector('.position-title, h4, .employer-job-title');
        var compEl = el.querySelector('.company-name, .employer-name');
        var linkEl = el.querySelector('a[href*="/job-"], a[href*="/candidate/"]');
        var locEl = el.querySelector('.job-locations, .location');
        if (titleEl && linkEl) {
          jobs.push({
            platform: 'instahyre',
            title: clean(titleEl.innerText),
            company: compEl ? clean(compEl.innerText) : 'Company',
            url: linkEl.href,
            location: locEl ? clean(locEl.innerText) : 'India'
          });
        }
      });
    }
    // 4. LINKEDIN (linkedin.com)
    else if (host.includes('linkedin.com')) {
      document.querySelectorAll('.jobs-search-results__list-item, .job-card-container').forEach(function(el) {
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
    // 5. DIRECT ATS: SINGLE JOB PAGE
    else {
      var heading = document.querySelector('h1, .job-title, [class*="jobTitle"], #header')?.innerText || document.title;
      var cleanHeading = clean(heading).split(/\\s+[\\|\\-\\•]\\s+/)[0];
      var comp = host.replace(/^www\\./, '').split('.')[0];
      jobs.push({
        platform: 'direct_ats',
        title: cleanHeading,
        company: comp.charAt(0).toUpperCase() + comp.slice(1),
        url: href,
        location: 'Direct Portal'
      });
    }

    // Deduplicate
    var unique = {};
    var filtered = [];
    jobs.forEach(function(j) {
      var k = (j.title + '_' + j.company).toLowerCase();
      if (!unique[k] && j.title.length > 2) {
        unique[k] = true;
        filtered.push(j);
      }
    });

    if (filtered.length === 0) {
      alert('⚠️ JobHunter: No job listings recognized on this page.\\n\\nMake sure you are viewing a job listings feed (e.g. Wellfound /role/l/devops-engineer/india, Simplify /jobs, Instahyre /opportunities) or a specific job posting page.');
      return;
    }

    var payload = JSON.stringify({ jobhunter_payload: true, jobs: filtered, sourceUrl: href, sourcePlatform: host });

    // Write to clipboard (Works on 100% of HTTPS pages regardless of CSP/Mixed Content)
    navigator.clipboard.writeText(payload).then(function() {
      showToast('✅ Extracted ' + filtered.length + ' jobs! Switching to JobHunter tab will auto-import them, or click "Paste from Clipboard" in JobHunter.', '#059669');
    }).catch(function() {
      showToast('✅ Extracted ' + filtered.length + ' jobs! Sending to JobHunter...', '#2563eb');
    });

    // Also attempt direct fetch (works if CSP permits)
    fetch('http://localhost:3333/api/jobs/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobs: filtered, sourceUrl: href, sourcePlatform: host })
    }).catch(function() {
      // Fetch blocked by CSP/Mixed-content; clipboard bridge handles it!
    });

    function showToast(msg, bg) {
      var t = document.getElementById('jh-toast-pill');
      if (!t) {
        t = document.createElement('div');
        t.id = 'jh-toast-pill';
        t.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999999;max-width:380px;padding:14px 20px;color:#fff;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;font-size:13px;font-weight:600;border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,0.35);line-height:1.4;transition:opacity 0.4s ease;pointer-events:none;';
        document.body.appendChild(t);
      }
      t.style.background = bg;
      t.innerText = msg;
      t.style.opacity = '1';
      setTimeout(function(){ t.style.opacity = '0'; }, 6000);
    }

  } catch(e) {
    alert('JobHunter Bookmarklet Error: ' + e.message);
  }
})();
`;

  return `javascript:${encodeURIComponent(code.replace(/\s+/g, ' ').trim())}`;
}
