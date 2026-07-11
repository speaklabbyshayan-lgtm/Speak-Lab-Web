import os
import re
import json

directory = r"e:\speaklabs"

whatsapp_button_html = """
<!-- Floating WhatsApp Button -->
<a href="https://wa.me/923014497532" target="_blank" class="floating-whatsapp" style="position: fixed; bottom: 20px; right: 20px; background-color: #25D366; color: white; border-radius: 50%; width: 60px; height: 60px; display: flex; align-items: center; justify-content: center; font-size: 30px; box-shadow: 2px 2px 10px rgba(0,0,0,0.2); z-index: 1000; animation: pulse 2s infinite;">
  <svg viewBox="0 0 24 24" width="35" height="35" fill="currentColor">
    <path d="M12.01 2.011a9.97 9.97 0 0 0-8.5 4.887L2 12.5l2.427-4.475a9.97 9.97 0 1 0 7.583-6.014zm4.184 13.916c-.22.616-1.28 1.185-1.768 1.258-.456.068-.992.106-2.923-.524-2.37-.773-3.87-3.13-4.01-3.322-.14-.192-.958-1.293-.958-2.464 0-1.17.61-1.745.828-1.97.22-.224.473-.28.628-.28s.31 0 .448.006c.144.006.335-.054.524.41.196.48.667 1.666.726 1.785.058.118.098.256.02.404-.078.148-.118.236-.236.354-.118.118-.246.26-.354.364-.118.103-.242.217-.11.453.134.236.594.998 1.272 1.61.872.784 1.612 1.026 1.848 1.13.236.103.374.088.512-.06.138-.148.59-6.685.748-.92.158-.236.413-.197.63-.118s1.378.665 1.614.783c.236.118.394.177.453.275.058.098.058.572-.162 1.187z"/>
  </svg>
</a>
<style>
@keyframes pulse {
  0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(37, 211, 102, 0.7); }
  70% { transform: scale(1.05); box-shadow: 0 0 0 15px rgba(37, 211, 102, 0); }
  100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(37, 211, 102, 0); }
}
</style>
</body>"""

for filename in os.listdir(directory):
    if filename.endswith(".html"):
        filepath = os.path.join(directory, filename)
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()

        # PHASE 1:
        # 1. WhatsApp number
        content = re.sub(r'https://wa\.me/(?!\d)', 'https://wa.me/923014497532', content)
        content = content.replace("Number coming soon", "0301-4497532")
        
        # 2. Fix broken CTA buttons
        # Replace href="#" for JOIN JULY BATCH and GET STARTED
        content = re.sub(r'<a[^>]*href="#"[^>]*>([^<]*JOIN JULY BATCH[^<]*)</a>', lambda m: m.group(0).replace('href="#"', 'href="enroll.html"'), content, flags=re.IGNORECASE)
        content = re.sub(r'<a[^>]*href="#"[^>]*>([^<]*GET STARTED[^<]*)</a>', lambda m: m.group(0).replace('href="#"', 'href="enroll.html"'), content, flags=re.IGNORECASE)
        # Any other specific button texts pointing to # -> enroll.html if they match. The user said:
        # Every JOIN JULY BATCH button pointing to # -> change to enroll.html
        # Every GET STARTED button pointing to # -> change to enroll.html
        # Footer JOIN JULY BATCH -> enroll.html
        content = re.sub(r'href="#"([^>]*>\s*JOIN JULY BATCH)', r'href="enroll.html"\1', content, flags=re.IGNORECASE)
        content = re.sub(r'href="#"([^>]*>\s*❤️ GET STARTED)', r'href="enroll.html"\1', content, flags=re.IGNORECASE)
        
        # DOWNLOAD SYLLABUS button -> https://wa.me/923014497532
        content = re.sub(r'href="[^"]*"([^>]*>\s*DOWNLOAD SYLLABUS)', r'href="https://wa.me/923014497532"\1', content, flags=re.IGNORECASE)
        content = re.sub(r'href=\'#\'([^>]*>\s*DOWNLOAD SYLLABUS)', r'href="https://wa.me/923014497532"\1', content, flags=re.IGNORECASE)

        # 4. Fix footer newsletter button
        content = re.sub(r'<button type="button">ENROLL</button>', r'<button type="button" onclick="window.open(\'https://wa.me/923014497532\', \'_blank\')">GET EARLY ACCESS</button>', content)
        
        # 5. Update email everywhere
        content = content.replace("support@speaklab.pk", "info@speaklabbyshayan.com")
        content = content.replace("mailto:support@speaklab.pk", "mailto:info@speaklabbyshayan.com")
        if "action=\"mailto:" in content:
            content = re.sub(r'action="mailto:[^"]*"', 'action="mailto:info@speaklabbyshayan.com"', content)

        # 3. Add floating WhatsApp button
        if "floating-whatsapp" not in content and "</body>" in content:
            content = content.replace("</body>", whatsapp_button_html)

        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)

# Update data.json email
data_json_path = os.path.join(directory, "data.json")
if os.path.exists(data_json_path):
    with open(data_json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if "site" in data and "email" in data["site"]:
        data["site"]["email"] = "info@speaklabbyshayan.com"
    with open(data_json_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

print("Phase 1 done.")
