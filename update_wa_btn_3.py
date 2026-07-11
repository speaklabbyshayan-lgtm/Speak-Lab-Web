import os
import glob
import re

premium_wa = """<!-- Floating WhatsApp Button -->
<a href="https://wa.me/923014497532" target="_blank" class="floating-whatsapp" style="position: fixed; bottom: 25px; right: 25px; background: linear-gradient(135deg, #25D366 0%, #128C7E 100%); color: white; border-radius: 50%; width: 65px; height: 65px; display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 25px rgba(37, 211, 102, 0.4), 0 4px 10px rgba(0,0,0,0.1); z-index: 1000; animation: pulse 2s infinite; border: 2px solid rgba(255,255,255,0.3); transition: transform 0.3s ease, box-shadow 0.3s ease;">
  <svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" fill="currentColor" viewBox="0 0 16 16">
    <path d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232"/>
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
