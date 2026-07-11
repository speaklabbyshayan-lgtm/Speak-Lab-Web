import re

html_path = r"e:\speaklabs\index.html"
with open(html_path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace Testimonials
new_testimonials = """  <!-- Testimonials -->
  <section class="support-banner-section" style="margin-top: 40px;">
    <div class="support-banner-card" style="background: #111; padding: 40px 20px; border-radius: 20px; text-align: center;">
      <div class="support-content" style="max-width: 1000px; margin: 0 auto; text-align: center;">
        <h2 style="color: #fff; margin-bottom: 30px; font-size: clamp(1.8rem, 5vw, 2.5rem);">Student Success Stories</h2>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; text-align: left;">
          <div style="background: rgba(255,255,255,0.05); padding: 25px; border-radius: 15px; border: 1px solid rgba(255,255,255,0.1);">
            <p style="color: #fff; font-size: 0.95rem; font-weight: 300; line-height: 1.6; font-style: italic;">"I had 3 job interviews before SpeakLab. Failed all 3. After the program, I cleared my very first interview and got hired at a multinational. The confidence I built here changed everything."</p>
            <div style="margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 15px;">
              <strong style="color: #fff; display: block; font-size: 0.95rem;">Ali Hassan</strong>
              <span style="color: #aaa; font-size: 0.8rem;">Fresh Graduate, Lahore</span>
            </div>
          </div>
          <div style="background: rgba(255,255,255,0.05); padding: 25px; border-radius: 15px; border: 1px solid rgba(255,255,255,0.1);">
            <p style="color: #fff; font-size: 0.95rem; font-weight: 300; line-height: 1.6; font-style: italic;">"I used to stay silent in university presentations because I was terrified. Now I volunteer to go first. SpeakLab didn't just teach me English — it taught me to believe in myself."</p>
            <div style="margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 15px;">
              <strong style="color: #fff; display: block; font-size: 0.95rem;">Fatima Malik</strong>
              <span style="color: #aaa; font-size: 0.8rem;">University Student, Lahore</span>
            </div>
          </div>
          <div style="background: rgba(255,255,255,0.05); padding: 25px; border-radius: 15px; border: 1px solid rgba(255,255,255,0.1);">
            <p style="color: #fff; font-size: 0.95rem; font-weight: 300; line-height: 1.6; font-style: italic;">"As a working professional, I needed to communicate better with my team and clients. 8 weeks later, my manager actually commented on how much I've improved. Worth every rupee."</p>
            <div style="margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 15px;">
              <strong style="color: #fff; display: block; font-size: 0.95rem;">Usman Tariq</strong>
              <span style="color: #aaa; font-size: 0.8rem;">Marketing Executive, Lahore</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>"""

old_testimonials_pattern = r'<!-- Testimonials -->\s*<section class="ai-tutor-section" style="margin-top: 40px;">.*?</section>'
content = re.sub(old_testimonials_pattern, new_testimonials, content, flags=re.DOTALL)

# Replace Final CTA
new_cta = """  <!-- Final CTA Section -->
  <section class="support-banner-section" style="margin-bottom: 20px;">
    <div class="support-banner-card" style="background: #111; padding: 40px 20px; border-radius: 20px; text-align: center;">
      <div class="support-content">
        <h2 style="color: #fff; margin-bottom: 15px; font-size: clamp(1.6rem, 4vw, 2.2rem);">Your Confidence Journey Starts With One Decision</h2>
        <p style="max-width: 600px; margin: 0 auto 30px; color: #ddd; font-size: 0.95rem;">Hundreds of students have already transformed their communication. July batch is starting soon — don't be the person who waited too long.</p>
        
        <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
          <a href="enroll.html" class="btn-primary" style="background: #fff; color: #000; padding: 12px 25px; font-size: 0.9rem;">ENROLL NOW — JULY BATCH</a>
          <a href="https://wa.me/923014497532" class="btn-outline" style="border-color: #333; color: #fff; padding: 12px 25px; font-size: 0.9rem;" target="_blank">ASK US ANYTHING ON WHATSAPP</a>
        </div>
      </div>
    </div>
  </section>"""

old_cta_pattern = r'<!-- Final CTA Section -->\s*<section class="ai-tutor-section" style="margin-bottom: 0;">.*?</section>'
content = re.sub(old_cta_pattern, new_cta, content, flags=re.DOTALL)

with open(html_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Updated index.html to fix responsive clipping issues")
