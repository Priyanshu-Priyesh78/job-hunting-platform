/**
 * Universal 1-Click Job Application Autofill Bookmarklet
 * Created for Priyanshu Priyesh (DevOps / SRE)
 * 
 * Usage:
 * 1. Create a new bookmark in Chrome / Brave
 * 2. Name: "⚡ AutoFill Job"
 * 3. URL: Copy the minified code from `dist/bookmarklet_min.js`
 * 
 * OR paste directly into Browser DevTools Console on any job application page!
 */

(function () {
  const profile = {
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
    graduationYear: "2025",
    cgpa: "8.45",
    company: "Revent Labs",
    title: "Software Engineer I",
    expYears: "1.5",
    noticePeriod: "15-30 days",
    whyHireMe: "I have hands-on experience operating 14+ production EKS clusters across 7 AWS regions with 280+ nodes, zero customer-facing downtime upgrades, Gloo Gateway, ArgoCD GitOps, and automated IaC with Terraform/Terragrunt."
  };

  let filledCount = 0;

  function setVal(el, val) {
    if (!el || el.value) return;
    el.focus();
    el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
    filledCount++;
  }

  const inputs = Array.from(document.querySelectorAll('input, textarea, select'));

  inputs.forEach(el => {
    const name = (el.name || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    const placeholder = (el.placeholder || '').toLowerCase();
    const aria = (el.getAttribute('aria-label') || '').toLowerCase();
    const label = el.labels && el.labels[0] ? el.labels[0].innerText.toLowerCase() : '';
    const text = `${name} ${id} ${placeholder} ${aria} ${label}`;

    // First Name
    if (text.includes('first') && text.includes('name')) {
      setVal(el, profile.firstName);
    }
    // Last Name
    else if (text.includes('last') && text.includes('name')) {
      setVal(el, profile.lastName);
    }
    // Full Name
    else if ((text.includes('full') && text.includes('name')) || (text.includes('name') && !text.includes('company') && !text.includes('user'))) {
      setVal(el, profile.fullName);
    }
    // Email
    else if (text.includes('email') || el.type === 'email') {
      setVal(el, profile.email);
    }
    // Phone
    else if (text.includes('phone') || text.includes('mobile') || el.type === 'tel') {
      setVal(el, profile.phone);
    }
    // LinkedIn
    else if (text.includes('linkedin')) {
      setVal(el, profile.linkedin);
    }
    // GitHub
    else if (text.includes('github') || text.includes('git')) {
      setVal(el, profile.github);
    }
    // Location / City
    else if (text.includes('city') || text.includes('location')) {
      setVal(el, profile.city);
    }
    // University / College
    else if (text.includes('university') || text.includes('college') || text.includes('school')) {
      setVal(el, profile.college);
    }
    // Degree / Major
    else if (text.includes('degree') || text.includes('major') || text.includes('discipline')) {
      setVal(el, `${profile.degree} - ${profile.major}`);
    }
    // Graduation Year
    else if (text.includes('graduat') || text.includes('passing year')) {
      setVal(el, profile.graduationYear);
    }
    // Current Company
    else if (text.includes('current company') || text.includes('employer') || (text.includes('company') && !text.includes('address'))) {
      setVal(el, profile.company);
    }
    // Current Title
    else if (text.includes('title') || text.includes('designation') || text.includes('role')) {
      setVal(el, profile.title);
    }
    // Total Experience
    else if (text.includes('experience') || text.includes('total exp')) {
      setVal(el, profile.expYears);
    }
    // Notice Period
    else if (text.includes('notice')) {
      setVal(el, profile.noticePeriod);
    }
    // Summary / Why Hire
    else if (el.tagName === 'TEXTAREA' && (text.includes('why') || text.includes('about yourself') || text.includes('summary'))) {
      setVal(el, profile.whyHireMe);
    }
  });

  // Floating notification banner
  const banner = document.createElement('div');
  banner.style.position = 'fixed';
  banner.style.bottom = '20px';
  banner.style.right = '20px';
  banner.style.backgroundColor = '#10B981';
  banner.style.color = '#FFFFFF';
  banner.style.padding = '12px 20px';
  banner.style.borderRadius = '8px';
  banner.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.2)';
  banner.style.zIndex = '999999';
  banner.style.fontWeight = 'bold';
  banner.style.fontSize = '14px';
  banner.style.fontFamily = 'system-ui, sans-serif';
  banner.innerHTML = `⚡ Autofilled ${filledCount} fields for Priyanshu! Please review & submit.`;

  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 4000);
})();

