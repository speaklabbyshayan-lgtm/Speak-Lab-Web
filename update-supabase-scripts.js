const fs = require('fs');
const files = ['index.html', 'course-details.html', 'about.html', 'contact.html', 'venue.html', 'enroll.html', 'faq.html', '404.html', 'thank-you.html'];

const scripts = `  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="supabase-config.js"></script>\n`;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  if (!content.includes('supabase-js@2')) {
    content = content.replace('</head>', scripts + '</head>');
    fs.writeFileSync(file, content);
  }
});
console.log('Added Supabase scripts');
