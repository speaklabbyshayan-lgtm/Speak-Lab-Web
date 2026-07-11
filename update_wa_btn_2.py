import os
import glob
import re

premium_wa = """<!-- Floating WhatsApp Button -->
<a href="https://wa.me/923014497532" target="_blank" class="floating-whatsapp" style="position: fixed; bottom: 25px; right: 25px; background: linear-gradient(135deg, #25D366 0%, #128C7E 100%); color: white; border-radius: 50%; width: 65px; height: 65px; display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 25px rgba(37, 211, 102, 0.4), 0 4px 10px rgba(0,0,0,0.1); z-index: 1000; animation: pulse 2s infinite; border: 2px solid rgba(255,255,255,0.3); transition: transform 0.3s ease, box-shadow 0.3s ease;">
  <svg viewBox="0 0 24 24" width="40" height="40" fill="currentColor" style="margin-left: 1px; margin-top: 1px;">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.489-1.761-1.662-2.06-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
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
