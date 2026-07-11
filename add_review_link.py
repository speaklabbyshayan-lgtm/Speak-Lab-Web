import glob
import os

files = [
    'index.html', 'about.html', 'course-details.html', 'faq.html', 
    'contact.html', 'enroll.html', 'venue.html', 'ai-tutor.html', 
    'thank-you.html', '404.html'
]

target = '<li><a href="https://wa.me/923014497532" target="_blank">WhatsApp Us</a></li>'
replacement = '<li><a href="https://wa.me/923014497532" target="_blank">WhatsApp Us</a></li>\n            <li><a href="https://g.page/r/CdPtj9VpwqqKEBM/review" target="_blank" rel="noopener noreferrer">⭐ Rate us on Google</a></li>'

for f in files:
    path = os.path.join(r"e:\speaklabs", f)
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as file:
            content = file.read()
            
        if target in content and "⭐ Rate us on Google" not in content:
            new_content = content.replace(target, replacement)
            with open(path, 'w', encoding='utf-8') as file:
                file.write(new_content)
            print(f"Updated {f}")
        else:
            print(f"Skipped {f} (Target not found or already modified)")
