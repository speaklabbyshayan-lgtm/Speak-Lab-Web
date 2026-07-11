import os
import re

html_path = r"e:\speaklabs\index.html"
with open(html_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. HERO REWRITES
hero_old = r'<div class="hero-cta-wrapper">\s*<a href="[^"]*" class="hero-btn primary-btn">[^<]*</a>\s*<a href="[^"]*" class="hero-btn secondary-btn"[^>]*>\s*<svg[^>]*>.*?</svg>\s*Watch Demo Video\s*</a>\s*</div>'

hero_new = """<div class="hero-cta-wrapper">
        <a href="enroll.html" class="hero-btn primary-btn">SECURE MY SPOT</a>
        <a href="https://wa.me/923014497532" class="hero-btn secondary-btn" target="_blank">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
          CHAT ON WHATSAPP
        </a>
      </div>"""

content = re.sub(hero_old, hero_new, content, flags=re.DOTALL)

# Add urgency tag
content = content.replace('<h1 class="gradient-heading">', '<p class="urgency-tag" style="color: #e53e3e; font-weight: 800; font-size: 0.95rem; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 15px;">🔥 July Batch — Only 15 Seats Available</p>\n      <h1 class="gradient-heading">')

# STATS SECTION
stats_html = """
  <!-- Stats Section -->
  <section style="display: flex; justify-content: center; gap: 5vw; padding: 40px 20px; background: rgba(255,255,255,0.7); backdrop-filter: blur(10px); border-top: 1px solid rgba(0,0,0,0.05); border-bottom: 1px solid rgba(0,0,0,0.05); text-align: center; flex-wrap: wrap; margin-bottom: 40px;">
    <div style="min-width: 150px;"><h3 style="font-size: 2.8rem; font-weight: 900; color: #000; margin-bottom: 5px; line-height: 1;">200+</h3><p style="font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px; font-weight: 800; color: #555;">Students Transformed</p></div>
    <div style="min-width: 150px;"><h3 style="font-size: 2.8rem; font-weight: 900; color: #000; margin-bottom: 5px; line-height: 1;">8</h3><p style="font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px; font-weight: 800; color: #555;">Weeks Program</p></div>
    <div style="min-width: 150px;"><h3 style="font-size: 2.8rem; font-weight: 900; color: #000; margin-bottom: 5px; line-height: 1;">100%</h3><p style="font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px; font-weight: 800; color: #555;">Practical & Live</p></div>
  </section>
"""
content = content.replace('</header>', '</header>\n' + stats_html)


# PAIN POINTS (Card 1, 2, 3)
card1_old = r'<h2>PROGRAM DETAILS</h2>\s*<p>.*?</p>'
card1_new = '<h2>The Problem</h2>\n        <p>You know exactly what you want to say — but the moment you open your mouth, the words disappear. Your mind goes blank. Your voice shakes. Sound familiar?</p>'
content = re.sub(card1_old, card1_new, content, flags=re.DOTALL)

card2_old = r'<h2>WHAT YOU\'LL LEARN</h2>\s*<p>.*?</p>'
card2_new = '<h2>The Impact</h2>\n        <p>You\'re losing jobs, opportunities, and respect — not because you\'re not smart enough, but because you can\'t express how smart you are. Every missed moment costs you more than you realize.</p>'
content = re.sub(card2_old, card2_new, content, flags=re.DOTALL)

card3_old = r'<h2>CAREER PREPARATION</h2>\s*<p>.*?</p>'
card3_new = '<h2>The Solution</h2>\n        <p>SpeakLab\'s 8-week program is built for people exactly like you. Real practice. Real feedback. Real transformation. Not just theory — actual confidence you can use from Week 1.</p>'
content = re.sub(card3_old, card3_new, content, flags=re.DOTALL)


# NEW SECTIONS: WHY CHOOSE US, TESTIMONIALS, CURRICULUM OVERVIEW
new_sections = """
  <!-- Why Choose Us Section -->
  <section class="support-banner-section" style="margin-top: 60px;">
    <div class="support-banner-card" style="background: linear-gradient(135deg, #fdfbfb 0%, #ebedee 100%);">
      <div class="support-content" style="max-width: 1000px; text-align: center;">
        <h2 style="color: #111;">Why SpeakLab Works When Everything Else Fails</h2>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; text-align: left; margin-top: 40px;">
          <div style="background: rgba(255,255,255,0.8); padding: 25px; border-radius: 20px; border: 1px solid rgba(0,0,0,0.05); box-shadow: 0 10px 30px rgba(0,0,0,0.03);">
            <h4 style="font-weight: 800; font-size: 1.1rem; margin-bottom: 10px; color: #000;">Small Batches — Maximum Attention</h4>
            <p style="color: #444; font-size: 0.95rem; font-weight: 500; line-height: 1.5;">Only 15 students per batch. Your growth is personal, not generic.</p>
          </div>
          <div style="background: rgba(255,255,255,0.8); padding: 25px; border-radius: 20px; border: 1px solid rgba(0,0,0,0.05); box-shadow: 0 10px 30px rgba(0,0,0,0.03);">
            <h4 style="font-weight: 800; font-size: 1.1rem; margin-bottom: 10px; color: #000;">Real Practice, Not Just Lectures</h4>
            <p style="color: #444; font-size: 0.95rem; font-weight: 500; line-height: 1.5;">Every session is interactive. You speak, get feedback, and improve in real time.</p>
          </div>
          <div style="background: rgba(255,255,255,0.8); padding: 25px; border-radius: 20px; border: 1px solid rgba(0,0,0,0.05); box-shadow: 0 10px 30px rgba(0,0,0,0.03);">
            <h4 style="font-weight: 800; font-size: 1.1rem; margin-bottom: 10px; color: #000;">Built for Pakistani Students</h4>
            <p style="color: #444; font-size: 0.95rem; font-weight: 500; line-height: 1.5;">We understand your specific challenges, fears, and goals. This isn't a one-size-fits-all program.</p>
          </div>
          <div style="background: rgba(255,255,255,0.8); padding: 25px; border-radius: 20px; border: 1px solid rgba(0,0,0,0.05); box-shadow: 0 10px 30px rgba(0,0,0,0.03);">
            <h4 style="font-weight: 800; font-size: 1.1rem; margin-bottom: 10px; color: #000;">Results From Week 1</h4>
            <p style="color: #444; font-size: 0.95rem; font-weight: 500; line-height: 1.5;">You won't wait 8 weeks to feel the difference. Students notice a shift within the first 2 sessions.</p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Testimonials -->
  <section class="ai-tutor-section" style="margin-top: 40px;">
    <div class="ai-premium-card" style="background: #111;">
      <div class="ai-card-content" style="max-width: 1000px;">
        <h2>Student Success Stories</h2>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; text-align: left; margin-top: 40px;">
          <div style="background: rgba(255,255,255,0.05); padding: 25px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.1);">
            <p style="color: #fff; font-size: 1rem; font-weight: 400; line-height: 1.6; font-style: italic;">"I had 3 job interviews before SpeakLab. Failed all 3. After the program, I cleared my very first interview and got hired at a multinational. The confidence I built here changed everything."</p>
            <div style="margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 15px;">
              <strong style="color: #fff; display: block;">Ali Hassan</strong>
              <span style="color: #aaa; font-size: 0.85rem;">Fresh Graduate, Lahore</span>
            </div>
          </div>
          <div style="background: rgba(255,255,255,0.05); padding: 25px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.1);">
            <p style="color: #fff; font-size: 1rem; font-weight: 400; line-height: 1.6; font-style: italic;">"I used to stay silent in university presentations because I was terrified. Now I volunteer to go first. SpeakLab didn't just teach me English — it taught me to believe in myself."</p>
            <div style="margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 15px;">
              <strong style="color: #fff; display: block;">Fatima Malik</strong>
              <span style="color: #aaa; font-size: 0.85rem;">University Student, Lahore</span>
            </div>
          </div>
          <div style="background: rgba(255,255,255,0.05); padding: 25px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.1);">
            <p style="color: #fff; font-size: 1rem; font-weight: 400; line-height: 1.6; font-style: italic;">"As a working professional, I needed to communicate better with my team and clients. 8 weeks later, my manager actually commented on how much I've improved. Worth every rupee."</p>
            <div style="margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 15px;">
              <strong style="color: #fff; display: block;">Usman Tariq</strong>
              <span style="color: #aaa; font-size: 0.85rem;">Marketing Executive, Lahore</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Curriculum Overview -->
  <section class="support-banner-section" style="margin-top: 40px; margin-bottom: 40px;">
    <div class="support-banner-card" style="background: linear-gradient(135deg, #fdfbfb 0%, #ebedee 100%);">
      <div class="support-content" style="max-width: 800px; text-align: center;">
        <h2 style="color: #111;">Your 8-Week Transformation Journey</h2>
        <div style="text-align: left; margin-top: 40px;">
          
          <div style="display: flex; gap: 20px; align-items: flex-start; background: rgba(255,255,255,0.8); padding: 20px; border-radius: 15px; margin-bottom: 15px;">
            <div style="background: #000; color: #fff; padding: 5px 15px; border-radius: 20px; font-weight: 800; font-size: 0.85rem; white-space: nowrap;">Week 1-2</div>
            <div>
              <h4 style="font-weight: 800; font-size: 1.1rem; margin-bottom: 5px; color: #000;">Breaking The Fear Barrier</h4>
              <p style="color: #444; font-size: 0.95rem; font-weight: 500; margin: 0;">Destroy the mental blocks stopping you from speaking</p>
            </div>
          </div>

          <div style="display: flex; gap: 20px; align-items: flex-start; background: rgba(255,255,255,0.8); padding: 20px; border-radius: 15px; margin-bottom: 15px;">
            <div style="background: #000; color: #fff; padding: 5px 15px; border-radius: 20px; font-weight: 800; font-size: 0.85rem; white-space: nowrap;">Week 3-4</div>
            <div>
              <h4 style="font-weight: 800; font-size: 1.1rem; margin-bottom: 5px; color: #000;">Speaking With Clarity</h4>
              <p style="color: #444; font-size: 0.95rem; font-weight: 500; margin: 0;">Structure your thoughts, speak with confidence and flow</p>
            </div>
          </div>

          <div style="display: flex; gap: 20px; align-items: flex-start; background: rgba(255,255,255,0.8); padding: 20px; border-radius: 15px; margin-bottom: 15px;">
            <div style="background: #000; color: #fff; padding: 5px 15px; border-radius: 20px; font-weight: 800; font-size: 0.85rem; white-space: nowrap;">Week 5-6</div>
            <div>
              <h4 style="font-weight: 800; font-size: 1.1rem; margin-bottom: 5px; color: #000;">Advanced Communication</h4>
              <p style="color: #444; font-size: 0.95rem; font-weight: 500; margin: 0;">Presentations, storytelling, debates, and leadership voice</p>
            </div>
          </div>

          <div style="display: flex; gap: 20px; align-items: flex-start; background: rgba(255,255,255,0.8); padding: 20px; border-radius: 15px; margin-bottom: 25px;">
            <div style="background: #000; color: #fff; padding: 5px 15px; border-radius: 20px; font-weight: 800; font-size: 0.85rem; white-space: nowrap;">Week 7-8</div>
            <div>
              <h4 style="font-weight: 800; font-size: 1.1rem; margin-bottom: 5px; color: #000;">Interview & Professional Mastery</h4>
              <p style="color: #444; font-size: 0.95rem; font-weight: 500; margin: 0;">Own every room, nail every interview, lead every conversation</p>
            </div>
          </div>

          <div style="text-align: center;">
            <a href="course-details.html" class="btn-primary" style="display: inline-block;">SEE FULL CURRICULUM</a>
          </div>

        </div>
      </div>
    </div>
  </section>
"""

content = content.replace('<section class="faq-section">', new_sections + '\n  <section class="faq-section">')

# FAQ REPLACEMENT (The user gave 5 specific Qs)
# Note: since FAQ is loaded via data.json originally, I should actually just modify data.json for the new questions!
# But let's also hardcode it in index.html in case data.json fails.
new_faqs_html = """
        <div class="faq-accordion" id="faq-container">
          <div class="faq-item">
            <button class="faq-question">Do I need to be fluent in English to join?<span class="faq-icon">+</span></button>
            <div class="faq-answer"><p>Not at all. We start from wherever you are and build from there. All levels welcome.</p></div>
          </div>
          <div class="faq-item">
            <button class="faq-question">Are sessions online or in-person?<span class="faq-icon">+</span></button>
            <div class="faq-answer"><p>Live online sessions via Zoom — join from anywhere in Pakistan.</p></div>
          </div>
          <div class="faq-item">
            <button class="faq-question">What if I miss a session?<span class="faq-icon">+</span></button>
            <div class="faq-answer"><p>Recorded sessions are shared so you never fall behind.</p></div>
          </div>
          <div class="faq-item">
            <button class="faq-question">How is this different from other English programs?<span class="faq-icon">+</span></button>
            <div class="faq-answer"><p>Small batch, personal feedback, real speaking practice every session — not just grammar lectures.</p></div>
          </div>
          <div class="faq-item">
            <button class="faq-question">When does the July batch start?<span class="faq-icon">+</span></button>
            <div class="faq-answer"><p>Mid-July. Seats are filling fast — enroll now to secure yours.</p></div>
          </div>
        </div>
        <div style="text-align: center; margin-top: 30px;">
          <a href="https://wa.me/923014497532" target="_blank" class="faq-see-all">STILL HAVE QUESTIONS? CHAT WITH US &rarr;</a>
        </div>
"""
content = re.sub(r'<div class="faq-accordion".*?<div style="text-align: center; margin-top: 30px;">.*?</div>', new_faqs_html, content, flags=re.DOTALL)


# FINAL CTA SECTION (bottom, above footer)
final_cta = """
  <!-- Final CTA Section -->
  <section class="ai-tutor-section" style="margin-bottom: 0;">
    <div class="ai-premium-card" style="background: #111;">
      <div class="ai-card-content">
        <h2>Your Confidence Journey Starts With One Decision</h2>
        <p style="max-width: 600px; margin: 0 auto 30px;">Hundreds of students have already transformed their communication. July batch is starting soon — don't be the person who waited too long.</p>
        
        <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
          <a href="enroll.html" class="btn-primary" style="background: #fff; color: #000;">ENROLL NOW — JULY BATCH</a>
          <a href="https://wa.me/923014497532" class="btn-outline" style="border-color: #333; color: #fff;" target="_blank">ASK US ANYTHING ON WHATSAPP</a>
        </div>
        <p style="margin-top: 25px; font-size: 0.85rem; color: #666; font-weight: 600;">📧 info@speaklabbyshayan.com | 📱 0301-4497532</p>
      </div>
    </div>
  </section>
"""
content = content.replace('<footer class="dtl-footer">', final_cta + '\n  <footer class="dtl-footer">')


with open(html_path, "w", encoding="utf-8") as f:
    f.write(content)
print("Updated index.html")
