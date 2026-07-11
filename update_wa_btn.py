import os
import glob
import re

premium_wa = """<!-- Floating WhatsApp Button -->
<a href="https://wa.me/923014497532" target="_blank" class="floating-whatsapp" style="position: fixed; bottom: 25px; right: 25px; background: linear-gradient(135deg, #25D366 0%, #128C7E 100%); color: white; border-radius: 50%; width: 65px; height: 65px; display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 25px rgba(37, 211, 102, 0.4), 0 4px 10px rgba(0,0,0,0.1); z-index: 1000; animation: pulse 2s infinite; border: 2px solid rgba(255,255,255,0.3); transition: transform 0.3s ease, box-shadow 0.3s ease;">
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" width="38" height="38" fill="currentColor">
    <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 222.4-99.6 222.4-222 0-59.3-23.1-115-65.4-157zM223.9 412.3h-.1c-32.9 0-65.2-8.8-93.5-25.5l-6.7-4-69.5 18.2 18.6-67.8-4.4-7C49.9 296 41.5 260.4 41.5 223.9 41.5 123.3 123.3 41.5 223.9 41.5c48.8 0 94.6 19 129.1 53.5s53.5 80.3 53.5 129.1c-.1 100.6-81.9 188.2-182.6 188.2zm99.6-136.2c-5.5-2.7-32.3-16-37.3-17.8-5-1.8-8.6-2.7-12.2 2.7-3.6 5.5-14.1 17.8-17.3 21.4-3.2 3.6-6.4 4.1-11.8 1.4s-23-8.5-43.8-27.1c-16.2-14.5-27.1-32.4-30.3-37.8-3.2-5.5-.3-8.5 2.4-11.2 2.4-2.4 5.5-6.4 8.2-9.5 2.7-3.2 3.6-5.5 5.5-9.1 1.8-3.6.9-6.8-.5-9.5-1.4-2.7-12.2-29.5-16.8-40.4-4.5-10.7-9-9.2-12.2-9.4-3.2-.2-6.8-.2-10.4-.2-3.6 0-9.5 1.4-14.5 6.8-5 5.5-19.1 18.6-19.1 45.4s19.5 52.7 22.2 56.3c2.7 3.6 38.4 58.7 93 82.3 13 5.6 23.2 9 31.1 11.5 13.1 4.1 25 3.5 34.4 2.1 10.5-1.5 32.3-13.2 36.9-25.9 4.5-12.7 4.5-23.6 3.2-25.9-1.4-2.3-5-3.6-10.5-6.3z"/>
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
