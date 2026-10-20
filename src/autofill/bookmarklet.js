/**
 * Universal 1-Click Job Application Autofill Bookmarklet
 * Created for Priyanshu Priyesh (DevOps / SRE)
 * 
 * Works on: LinkedIn Easy Apply, Greenhouse, Lever, Workday, Naukri, Indeed, Wellfound, Instahyre
 */

(function () {
  const p = {
    firstName: "Priyanshu",
    lastName: "Priyesh",
    fullName: "Priyanshu Priyesh",
    email: "priyanshupriyesh78@gmail.com",
    phone: "8809003179",
    linkedin: "https://linkedin.com/in/priyanshu-priyesh-187340233",
    github: "https://github.com",
    city: "Indore",
    state: "Madhya Pradesh",
    country: "India",
    college: "Lakshmi Narain College of Technology (LNCT)",
    degree: "Bachelor of Technology",
    major: "Computer Science Engineering",
    gradYear: "2025",
    cgpa: "8.45",
    company: "Revent Labs",
    title: "Software Engineer I",
    expYears: "1.5",
    noticePeriod: "15-30 days",
    summary: "Software Engineer / SRE with experience operating production-grade AWS and Kubernetes platforms managing 14+ production EKS clusters across 7 AWS regions with zero downtime. Hands-on with Amazon EKS, Terraform/Terragrunt, Helm, ArgoCD, Gloo Gateway, and Prometheus/Grafana observability."
  };

  let filled = 0;

  function setNativeValue(el, val) {
    if (!el) return;
    try {
      const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) {
        setter.call(el, val);
      } else {
        el.value = val;
      }
    } catch (e) {
      el.value = val;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    filled++;
  }

  function getFormElements(doc) {
    let elements = [];
    try {
      elements = Array.from(doc.querySelectorAll('input, textarea, select'));
      const iframes = doc.querySelectorAll('iframe');
      iframes.forEach(iframe => {
        try {
          const idoc = iframe.contentDocument || iframe.contentWindow.document;
          if (idoc) elements = elements.concat(Array.from(idoc.querySelectorAll('input, textarea, select')));
        } catch (err) {}
      });
    } catch (e) {}
    return elements;
  }

  const allElements = getFormElements(document);

  allElements.forEach(el => {
    if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button') return;

    const name = (el.name || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    const placeholder = (el.placeholder || '').toLowerCase();
    const aria = (el.getAttribute('aria-label') || '').toLowerCase();
    const label = el.labels && el.labels[0] ? el.labels[0].innerText.toLowerCase() : '';
    const parentText = (el.closest('div, label, fieldset')?.innerText || '').slice(0, 150).toLowerCase();
    const combined = `${name} ${id} ${placeholder} ${aria} ${label} ${parentText}`;

    // Select dropdowns
    if (el.tagName === 'SELECT') {
      Array.from(el.options).forEach(opt => {
        const oText = opt.text.toLowerCase();
        if ((combined.includes('country') || combined.includes('nationality')) && (oText.includes('india') || opt.value === 'IN')) {
          el.value = opt.value;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          filled++;
        } else if ((combined.includes('authorized') || combined.includes('sponsorship')) && oText.includes('yes')) {
          el.value = opt.value;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          filled++;
        }
      });
      return;
    }

    // Radio buttons
    if (el.type === 'radio') {
      if ((combined.includes('authorized') || combined.includes('work in') || combined.includes('relocate')) && combined.includes('yes')) {
        el.checked = true;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        filled++;
      }
      return;
    }

    // Skip if already contains value
    if (el.value && el.value.trim().length > 0) return;

    // Text & Textarea fields
    if (combined.includes('first') && combined.includes('name')) {
      setNativeValue(el, p.firstName);
    } else if (combined.includes('last') && combined.includes('name')) {
      setNativeValue(el, p.lastName);
    } else if ((combined.includes('full') && combined.includes('name')) || (combined.includes('name') && !combined.includes('company') && !combined.includes('user') && !combined.includes('file'))) {
      setNativeValue(el, p.fullName);
    } else if (combined.includes('email') || el.type === 'email') {
      setNativeValue(el, p.email);
    } else if (combined.includes('phone') || combined.includes('mobile') || combined.includes('contact') || el.type === 'tel') {
      setNativeValue(el, p.phone);
    } else if (combined.includes('linkedin')) {
      setNativeValue(el, p.linkedin);
    } else if (combined.includes('github') || combined.includes('portfolio') || combined.includes('website')) {
      setNativeValue(el, p.github);
    } else if (combined.includes('city') || combined.includes('location') || combined.includes('current address')) {
      setNativeValue(el, p.city);
    } else if (combined.includes('university') || combined.includes('college') || combined.includes('institution') || combined.includes('school')) {
      setNativeValue(el, p.college);
    } else if (combined.includes('degree') || combined.includes('education level')) {
      setNativeValue(el, p.degree);
    } else if (combined.includes('major') || combined.includes('discipline') || combined.includes('branch')) {
      setNativeValue(el, p.major);
    } else if (combined.includes('graduat') || combined.includes('passing year') || combined.includes('end year')) {
      setNativeValue(el, p.gradYear);
    } else if (combined.includes('cgpa') || combined.includes('gpa') || combined.includes('percentage') || combined.includes('marks')) {
      setNativeValue(el, p.cgpa);
    } else if (combined.includes('current company') || combined.includes('current employer') || (combined.includes('company') && !combined.includes('address'))) {
      setNativeValue(el, p.company);
    } else if (combined.includes('designation') || combined.includes('current role') || (combined.includes('title') && !combined.includes('job title'))) {
      setNativeValue(el, p.title);
    } else if (combined.includes('total exp') || combined.includes('experience') || combined.includes('years of exp')) {
      setNativeValue(el, p.expYears);
    } else if (combined.includes('notice')) {
      setNativeValue(el, p.noticePeriod);
    } else if (el.tagName === 'TEXTAREA' && (combined.includes('why') || combined.includes('summary') || combined.includes('about yourself') || combined.includes('cover letter') || combined.includes('pitch'))) {
      setNativeValue(el, p.summary);
    }
  });

  // Visual Banner Notification
  const banner = document.createElement('div');
  banner.style.cssText = 'position:fixed;top:20px;right:20px;background:#059669;color:#ffffff;padding:14px 22px;border-radius:12px;font-family:system-ui,-apple-system,sans-serif;font-size:14px;font-weight:700;box-shadow:0 15px 30px rgba(0,0,0,0.35);z-index:9999999;display:flex;align-items:center;gap:10px;border:1px solid #10b981;';
  banner.innerHTML = `<span>⚡ Autofilled ${filled} fields for Priyanshu!</span><span style="font-size:11px;font-weight:normal;opacity:0.9;">(Review & Submit)</span>`;
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 4000);
})();
