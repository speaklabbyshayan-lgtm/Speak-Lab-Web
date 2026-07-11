import os
import glob
import re

premium_wa = """<!-- Floating WhatsApp Button -->
<a href="https://wa.me/923014497532" target="_blank" class="floating-whatsapp" style="position: fixed; bottom: 25px; right: 25px; z-index: 1000; border-radius: 50%; display: flex; align-items: center; justify-content: center; animation: pulse 2s infinite; transition: transform 0.3s ease; background: #fff; box-shadow: 0 4px 10px rgba(0,0,0,0.15);">
  <svg viewBox="0 0 24 24" width="60" height="60" style="display: block;">
    <path d="M11.99 0a11.99 11.99 0 0 0-10.1 18.42L0 23.97l5.72-1.85A11.96 11.96 0 0 0 11.99 24C18.62 24 24 18.62 24 11.99S18.62 0 11.99 0Zm6.56 17.27c-.28.78-1.59 1.5-2.22 1.55-.58.05-1.27.18-4.04-1.02-3.33-1.44-5.49-4.88-5.65-5.11-.17-.22-1.35-1.8-1.35-3.44 0-1.63.85-2.45 1.15-2.76.29-.31.64-.39.85-.39.22 0 .43 0 .61.01.2 0 .46-.07.72.54.27.64.91 2.22.99 2.39.08.17.14.37.03.58-.1.21-.16.34-.32.53-.16.18-.34.4-.49.54-.17.18-.35.37-.15.71.2.35.88 1.47 1.91 2.38 1.33 1.18 2.41 1.54 2.76 1.71.35.17.55.15.76-.08.2-.24.87-1 1.1-1.35.23-.34.46-.28.78-.16.32.12 2.05.97 2.4 1.14.35.17.59.26.67.4.08.14.08.82-.2 1.6z" fill="#25D366" />
  </svg>
</a>
<style>
@keyframes pulse {
  0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(37, 211, 102, 0.5); }
  70% { transform: scale(1.05); box-shadow: 0 0 0 20px rgba(37, 211, 102, 0); }
  100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(37, 211, 102, 0); }
}
.floating-whatsapp:hover {
  transform: scale(1.1) !important;
  box-shadow: 0 15px 35px rgba(37, 211, 102, 0.6), 0 5px 15px rgba(0,0,0,0.2) !important;
}
</style>"""

html_files = glob.glob(r"e:\speaklabs\*.html")

for filepath in html_files:
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # Find the old block starting with <!-- Floating WhatsApp Button --> up to </style>
    pattern = r'<!-- Floating WhatsApp Button -->.*?</style>'
    new_content = re.sub(pattern, premium_wa, content, flags=re.DOTALL)

    if new_content != content:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"Updated {os.path.basename(filepath)}")
