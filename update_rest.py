import os
import re

# ===============================
# course-details.html
# ===============================
cd_path = r"e:\speaklabs\course-details.html"
with open(cd_path, "r", encoding="utf-8") as f:
    cd = f.read()

# Hero
cd = re.sub(
    r'<h1 class="gradient-heading"[^>]*>.*?</h1>',
    '<h1 class="gradient-heading" style="font-size: clamp(2.2rem, 8vw, 4rem); line-height: 1.15;">8 Weeks. One Decision.<br>A Lifetime of Confidence.</h1>',
    cd, flags=re.DOTALL
)
cd = re.sub(
    r'<p style="font-size: 1.1rem; padding: 0 10px;">.*?</p>',
    '<p style="font-size: 1.1rem; padding: 0 10px; margin-bottom: 20px;">The SpeakLab Communication & Confidence Program is the most practical, results-driven English speaking program in Lahore.</p>\n      <p class="urgency-tag" style="color: #e53e3e; font-weight: 800; font-size: 0.95rem; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 25px;">🔥 July Batch Filling Fast — Limited to 15 Students</p>\n      <a href="enroll.html" class="enroll-btn" style="display: inline-block; padding: 15px 30px; margin-top: 0;">ENROLL NOW</a>',
    cd, flags=re.DOTALL
)

# Program Overview
new_overview = """<div class="overview-grid">
            <div class="overview-item"><h5>Duration</h5><p>8 Weeks</p></div>
            <div class="overview-item"><h5>Sessions</h5><p>Live via Zoom (2x per week)</p></div>
            <div class="overview-item"><h5>Batch Size</h5><p>Maximum 15 students</p></div>
            <div class="overview-item"><h5>Support</h5><p>WhatsApp group throughout the program</p></div>
            <div class="overview-item"><h5>Certificate</h5><p>Yes — on successful completion</p></div>
            <div class="overview-item"><h5>Language</h5><p>English (Urdu support when needed)</p></div>
          </div>"""
cd = re.sub(r'<div class="overview-grid">.*?</div>\s*</div>\s*</section>', new_overview + '\n        </div>\n      </section>', cd, flags=re.DOTALL)

# Pricing Section
new_pricing = """
          <div class="price-box">
            <h2 style="font-size: 1.8rem; font-weight: 800; margin-bottom: 20px; line-height: 1.2;">Your Investment In Yourself</h2>
            <div class="price-title" style="color: #e53e3e;">Early Bird Price (July batch only — limited time)</div>
            <div class="price-amount" style="font-size: 3rem;">PKR 10,000</div>
            <div class="price-regular">Regular Price: <span style="text-decoration: line-through;">PKR 15,000</span></div>
            <div style="background: #e53e3e; color: #fff; display: inline-block; padding: 5px 15px; border-radius: 20px; font-weight: 800; font-size: 0.85rem; margin-top: 10px;">Save PKR 5,000</div>
          </div>

          <div class="price-details" style="text-align: left; padding: 20px;">
            <p style="font-weight: 800; margin-bottom: 15px; font-size: 1.1rem;">What's included:</p>
            <ul style="list-style: none; padding: 0; margin: 0; font-size: 0.95rem; color: #222;">
              <li style="margin-bottom: 10px;">✅ 16 live Zoom sessions (2 per week)</li>
              <li style="margin-bottom: 10px;">✅ WhatsApp group support for 8 weeks</li>
              <li style="margin-bottom: 10px;">✅ Practice materials and assignments</li>
              <li style="margin-bottom: 10px;">✅ Personal feedback on your speaking</li>
              <li style="margin-bottom: 10px;">✅ Certificate of completion</li>
              <li>✅ Lifetime access to recorded sessions</li>
            </ul>
          </div>

          <div style="text-align: center; margin-top: 25px;">
            <p style="color: #e53e3e; font-weight: 700; font-size: 0.9rem; margin-bottom: 15px;">⚠️ Only 15 seats per batch. Early bird pricing ends when seats fill up.</p>
            <a href="enroll.html" class="enroll-btn" style="margin-top: 0;">SECURE MY SEAT — PKR 10,000</a>
            <a href="https://wa.me/923014497532" style="display: block; margin-top: 15px; color: #555; text-decoration: underline; font-weight: 600; font-size: 0.9rem;" target="_blank">Have questions? WhatsApp us</a>
          </div>
"""
cd = re.sub(r'<div class="price-box">.*?<a href="[^"]*" class="enroll-btn">[^<]*</a>', new_pricing, cd, flags=re.DOTALL)

with open(cd_path, "w", encoding="utf-8") as f:
    f.write(cd)

# ===============================
# about.html
# ===============================
about_path = r"e:\speaklabs\about.html"
with open(about_path, "r", encoding="utf-8") as f:
    ab = f.read()

# Hero
ab = re.sub(
    r'<h1 class="gradient-heading">.*?</h1>',
    '<h1 class="gradient-heading" style="font-size: clamp(2rem, 5vw, 3.5rem); line-height: 1.2; margin-bottom: 20px;">We Started SpeakLab Because We Felt What You\'re Feeling</h1>',
    ab, flags=re.DOTALL
)
ab = re.sub(
    r'<p>Pakistan\'s most practical English communication program</p>',
    '<p style="font-size: 1.1rem; max-width: 800px; margin: 0 auto; padding: 0 15px;">The frustration of knowing you\'re capable but not being able to prove it when it matters most.</p>',
    ab, flags=re.DOTALL
)

# New sections (Our Story, Mission, Vision)
new_about_content = """
    <section class="team-section" style="padding-top: 20px;">
      <div style="max-width: 800px; margin: 0 auto; text-align: left; background: rgba(255,255,255,0.7); backdrop-filter: blur(10px); padding: 40px; border-radius: 30px; box-shadow: 0 10px 30px rgba(0,0,0,0.05);">
        
        <h2 style="font-size: 2rem; margin-bottom: 20px;">Our Story</h2>
        <p style="font-size: 1.1rem; line-height: 1.7; color: #444; margin-bottom: 40px;">SpeakLab was born from a simple but painful truth — thousands of talented Pakistani students and professionals are held back every single day, not by their intelligence or skills, but by their inability to communicate with confidence. We've seen brilliant minds lose jobs to less-qualified candidates. We've seen students stay silent in classrooms because fear won. We built SpeakLab to change that — one student at a time.</p>
        
        <h2 style="font-size: 2rem; margin-bottom: 20px;">Mission</h2>
        <p style="font-size: 1.1rem; line-height: 1.7; color: #444; margin-bottom: 40px;">To make confident communication accessible to every Pakistani student and professional who has ever felt unheard.</p>
        
        <h2 style="font-size: 2rem; margin-bottom: 20px;">Vision</h2>
        <p style="font-size: 1.1rem; line-height: 1.7; color: #444; margin-bottom: 40px;">A Pakistan where talent is never overlooked because of communication barriers.</p>
        
        <div style="text-align: center;">
          <a href="enroll.html" class="speaklab-join-btn" style="display: inline-block; padding: 15px 30px; font-size: 1rem;">START YOUR JOURNEY</a>
        </div>

      </div>
    </section>
"""
ab = ab.replace('<main>', '<main>\n' + new_about_content)

with open(about_path, "w", encoding="utf-8") as f:
    f.write(ab)

print("Updated course-details and about")
