import os
import glob
import re

css_code = """
/* Inner Page Hero Override */
.hero-section.inner-page {
  padding: 50px 20px 40px !important;
  background: #fcfcfc !important;
  background-image: radial-gradient(#e5e5e5 1.5px, transparent 1.5px) !important;
  background-size: 20px 20px !important;
  border-bottom: 1px solid rgba(0,0,0,0.05) !important;
  min-height: auto !important;
}
.hero-section.inner-page::before {
  display: none !important;
}
.hero-section.inner-page .gradient-heading {
  font-size: clamp(2.5rem, 6vw, 4rem) !important;
  margin-bottom: 10px !important;
}
.hero-section.inner-page .hero-content p {
  color: #555 !important;
  font-size: 1.1rem !important;
}
"""

# 1. Append CSS to style.css
with open(r"e:\speaklabs\style.css", "r", encoding="utf-8") as f:
    css_content = f.read()

if "Inner Page Hero Override" not in css_content:
    with open(r"e:\speaklabs\style.css", "a", encoding="utf-8") as f:
        f.write(css_code)
    print("Added inner-page CSS to style.css")

# 2. Update HTML files
files = glob.glob(r"e:\speaklabs\*.html")

for filepath in files:
    filename = os.path.basename(filepath)
    if filename in ["index.html", "enroll.html"]:
        continue
        
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Replace any <header class="hero-section"...> with <header class="hero-section inner-page">
    # Note: careful not to match things that aren't the hero section.
    new_content = re.sub(r'<header class="hero-section"[^>]*>', '<header class="hero-section inner-page">', content)
    
    if new_content != content:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"Updated {filename}")
