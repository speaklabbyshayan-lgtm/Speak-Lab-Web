const fs = require('fs');
const data = require('./data.json');

const metaTags = `
  <meta property="og:title" content="SpeakLab - Communication & Confidence Program">
  <meta property="og:description" content="Master Spoken English in 8 weeks. In-person classes at Punjab Tianjin University of Technology, Lahore. Only 20 seats available.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://speaklab.pk">
  <meta property="og:image" content="https://speaklab.pk/og-image.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="SpeakLab - Speak English with Confidence">
  <meta name="twitter:description" content="8-week Communication & Confidence Program in Lahore. PKR 15,000 only.">
  <meta name="description" content="SpeakLab offers an intensive 8-week Communication & Confidence Program in Lahore at Punjab Tianjin University of Technology. Learn Spoken English, Public Speaking, and Interview Skills.">
`;

const schema1 = `{
  "@context": "https://schema.org",
  "@type": "Course",
  "name": "Communication & Confidence Program",
  "description": "An intensive 8-week English communication program focused on Spoken English, Confidence Building, Public Speaking, Interview Preparation, and Critical Thinking.",
  "provider": {
    "@type": "Organization",
    "name": "SpeakLab",
    "email": "support@speaklab.pk"
  },
  "courseMode": "in-person",
  "duration": "P8W",
  "offers": {
    "@type": "Offer",
    "price": "15000",
    "priceCurrency": "PKR",
    "availability": "https://schema.org/LimitedAvailability"
  },
  "location": {
    "@type": "Place",
    "name": "Punjab Tianjin University of Technology",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Lahore",
      "addressCountry": "PK"
    }
  }
}`;

const schema2 = `{
  "@context": "https://schema.org",
  "@type": "EducationalOrganization",
  "name": "SpeakLab",
  "email": "support@speaklab.pk",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Punjab Tianjin University of Technology",
    "addressLocality": "Lahore",
    "addressCountry": "PK"
  },
  "openingHours": "Mo,We,Fr 17:00-18:45",
  "url": "https://speaklab.pk"
}`;

const schema3 = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": data.faqs.map(f => ({
    "@type": "Question",
    "name": f.q,
    "acceptedAnswer": {
      "@type": "Answer",
      "text": f.a
    }
  }))
};

const headIndexAdditions = `
  ${metaTags}
  <script type="application/ld+json">${schema1}</script>
  <script type="application/ld+json">${schema2}</script>
  <script type="application/ld+json">${JSON.stringify(schema3, null, 2)}</script>
`;

const newScriptBlock = `  <script>
    fetch('./data.json')
      .then(res => res.json())
      .then(data => {
        const update = (id, text) => {
          const el = document.getElementById(id);
          if (el) el.textContent = text;
        };

        // Site
        update('site-tagline', data.site.tagline);
        update('footer-location', \`VENUE: \${data.site.location}\`);
        update('contact-email-text', data.site.email);
        update('contact-email-text2', data.site.email);
        const emailLink = document.getElementById('contact-email-link');
        if (emailLink) emailLink.href = \`mailto:\${data.site.email}\`;

        // Program
        update('prog-name', data.program.name);
        update('prog-duration', \`\${data.program.duration} (\${data.program.sessions})\`);
        update('prog-schedule', data.program.schedule);
        update('prog-timing', data.program.timing);
        update('prog-location', data.site.location);
        update('tag-duration', data.program.duration.toUpperCase());
        update('tag-sessions', data.program.sessions.toUpperCase());
        update('prog-batch', data.program.batch);
        update('prog-fee', \`PKR \${data.program.fee.toLocaleString()}\`);
        update('prog-reg-fee', \`PKR \${data.program.regularFee.toLocaleString()}\`);
        update('prog-reg-amount', \`PKR \${data.program.registrationFee.toLocaleString()}\`);
        const rem = data.program.fee - data.program.registrationFee;
        update('prog-rem-amount', \`PKR \${rem.toLocaleString()}\`);
        update('prog-balance-due', data.program.balanceDue);
        update('cta-batch', \`JOIN \${data.program.batch.toUpperCase()}\`);
        update('seats-available', data.program.seats);

        // Instructor
        update('inst-name', data.instructor.name);
        update('inst-bio', data.instructor.bio);

        // Faq
        const faqContainer = document.getElementById('faq-container');
        if (faqContainer && data.faqs) {
          const seeAllBtn = faqContainer.parentElement.querySelector('.faq-see-all');
          const isIndex = !!seeAllBtn;
          
          faqContainer.innerHTML = ''; 
          data.faqs.forEach((faq, index) => {
            const isHidden = (isIndex && index >= 3) ? 'faq-hidden' : '';
            faqContainer.innerHTML += \`
              <div class="faq-item \${isHidden}">
                <button class="faq-question">\${faq.q}<span class="faq-icon">+</span></button>
                <div class="faq-answer"><p>\${faq.a}</p></div>
              </div>
            \`;
          });
        }

        // Curriculum
        const currContainer = document.getElementById('curriculum-container');
        if (currContainer && data.curriculum) {
          currContainer.innerHTML = '';
          data.curriculum.forEach(item => {
            currContainer.innerHTML += \`
              <div class="curr-item">
                <div class="curr-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
                <div class="curr-content">
                  <h4>\${item.title}</h4>
                  <p>\${item.desc}</p>
                </div>
              </div>
            \`;
          });
        }
      })
      .catch(err => console.error('Failed to load data.json', err));
  </script>
  <script src="script.js"></script>`;

const files = ['index.html', 'course-details.html', 'about.html', 'contact.html', 'venue.html', 'enroll.html', 'faq.html'];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');

  // Replace old fetch script completely (from <script> fetch('./data.json') to the closing </script>)
  content = content.replace(/<script>\s*fetch\('\.\/data\.json'\)[\s\S]*?<\/script>/, newScriptBlock);

  // Also remove <script src="script.js"></script> if it was somehow added twice just to be safe
  content = content.replace(/<script src="script\.js"><\/script>\s*<script src="script\.js"><\/script>/, '<script src="script.js"></script>');

  // Inject meta tags
  if (file === 'index.html') {
    content = content.replace(/<meta name="description"[\s\S]*?>/, '');
    content = content.replace('</head>', headIndexAdditions + '\n</head>');
  } else {
    content = content.replace(/<meta name="description"[\s\S]*?>/, '');
    content = content.replace('</head>', metaTags + '\n</head>');
  }

  // Specific rule for enroll.html
  if (file === 'enroll.html') {
    content = content.replace(/<form action="mailto:support@speaklab\.pk" method="post" enctype="text\/plain">/, '<form action="thank-you.html" method="get">');
  }

  fs.writeFileSync(file, content);
});
console.log('Update complete.');
