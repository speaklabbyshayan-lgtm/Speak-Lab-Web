import os
import re
import json

# ===============================
# faq.html
# ===============================
faq_path = r"e:\speaklabs\faq.html"
with open(faq_path, "r", encoding="utf-8") as f:
    faq_html = f.read()

new_faqs = """
          <div class="faq-item">
            <button class="faq-question">Is this program worth it?<span class="faq-icon">+</span></button>
            <div class="faq-answer"><p>Our students consistently say it's the best investment they've made in themselves. One session can change how you see yourself as a communicator.</p></div>
          </div>
          <div class="faq-item">
            <button class="faq-question">Can I pay in installments?<span class="faq-icon">+</span></button>
            <div class="faq-answer"><p>Yes — contact us on WhatsApp and we'll work something out: wa.me/923014497532</p></div>
          </div>
          <div class="faq-item">
            <button class="faq-question">What's the class schedule?<span class="faq-icon">+</span></button>
            <div class="faq-answer"><p>2 live sessions per week via Zoom. Schedule shared after enrollment.</p></div>
          </div>
          <div class="faq-item">
            <button class="faq-question">Will I get a certificate?<span class="faq-icon">+</span></button>
            <div class="faq-answer"><p>Yes — a SpeakLab Certificate of Completion is awarded after finishing the 8-week program.</p></div>
          </div>
        </div>
        <div style="text-align: center; margin-top: 40px; margin-bottom: 20px;">
          <a href="enroll.html" class="speaklab-join-btn" style="display: inline-block; padding: 15px 30px; font-size: 1rem;">READY TO JOIN? ENROLL NOW</a>
        </div>
"""
faq_html = re.sub(r'</div>\s*</div>\s*</div>\s*</section>', new_faqs + '\n      </div>\n    </div>\n  </section>', faq_html, flags=re.DOTALL)
with open(faq_path, "w", encoding="utf-8") as f:
    f.write(faq_html)


# ===============================
# thank-you.html
# ===============================
ty_path = r"e:\speaklabs\thank-you.html"
with open(ty_path, "r", encoding="utf-8") as f:
    ty = f.read()

# Add WhatsApp redirect: "Meanwhile, join our student WhatsApp group for updates" → https://wa.me/923014497532
# The instruction is to add this. We can put it in the Hero section or Next Step card.
ty = re.sub(
    r'<a href="index.html" class="speaklab-join-btn">Back to Home</a>',
    '<a href="https://wa.me/923014497532" class="speaklab-join-btn" target="_blank" style="margin-right: 15px; margin-bottom: 15px;">Meanwhile, join our student WhatsApp group for updates</a>\n      <a href="index.html" class="speaklab-join-btn" style="background: transparent; border: 1px solid #fff; color: #fff;">Back to Home</a>',
    ty
)

# Add: "Questions? Email us at info@speaklabbyshayan.com or WhatsApp 0301-4497532"
ty = re.sub(
    r'<h3 style="font-size: 1.8rem; margin-bottom: 15px;">Questions\?</h3>\s*<p style="font-size: 1.1rem; line-height: 1.6;">Email us at <span id="contact-email-text">[^<]*</span></p>',
    '<h3 style="font-size: 1.8rem; margin-bottom: 15px;">Questions?</h3>\n        <p style="font-size: 1.1rem; line-height: 1.6;">Email us at <span id="contact-email-text">info@speaklabbyshayan.com</span> or WhatsApp 0301-4497532</p>',
    ty, flags=re.DOTALL
)
with open(ty_path, "w", encoding="utf-8") as f:
    f.write(ty)


# ===============================
# data.json
# ===============================
dj_path = r"e:\speaklabs\data.json"
if os.path.exists(dj_path):
    with open(dj_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if "faqs" in data:
        # Append new FAQs
        data["faqs"].extend([
            {
                "q": "Is this program worth it?",
                "a": "Our students consistently say it's the best investment they've made in themselves. One session can change how you see yourself as a communicator."
            },
            {
                "q": "Can I pay in installments?",
                "a": "Yes — contact us on WhatsApp and we'll work something out: wa.me/923014497532"
            },
            {
                "q": "What's the class schedule?",
                "a": "2 live sessions per week via Zoom. Schedule shared after enrollment."
            },
            {
                "q": "Will I get a certificate?",
                "a": "Yes — a SpeakLab Certificate of Completion is awarded after finishing the 8-week program."
            }
        ])
    with open(dj_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

print("Updated faq, thank-you, and data.json")
