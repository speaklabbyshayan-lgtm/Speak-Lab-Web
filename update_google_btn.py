import os
import glob

html_files = glob.glob('*.html')

for file in html_files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Standard footer link replacement
    old_link_1 = '<li><a href="https://g.page/r/CdPtj9VpwqqKEBM/review" target="_blank" rel="noopener noreferrer">⭐ Rate us on Google</a></li>'
    new_link_1 = '<li><a href="https://g.page/r/CdPtj9VpwqqKEBM/review" target="_blank" rel="noopener noreferrer" class="google-rate-btn">⭐ Rate us on Google</a></li>'
    
    # Specific course-details link replacement
    old_link_2 = '<p style="margin-top: 10px;"><a href="https://g.page/r/CdPtj9VpwqqKEBM/review" target="_blank" rel="noopener noreferrer" style="color: #666; text-decoration: none;">⭐ Rate us on Google</a></p>'
    new_link_2 = '<p style="margin-top: 15px;"><a href="https://g.page/r/CdPtj9VpwqqKEBM/review" target="_blank" rel="noopener noreferrer" class="google-rate-btn">⭐ Rate us on Google</a></p>'

    if old_link_1 in content or old_link_2 in content:
        content = content.replace(old_link_1, new_link_1)
        content = content.replace(old_link_2, new_link_2)
        with open(file, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {file}")
