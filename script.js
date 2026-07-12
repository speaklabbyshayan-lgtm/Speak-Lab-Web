document.addEventListener('DOMContentLoaded', () => {
  // 1. MOBILE MENU
  const menuBtn = document.querySelector('.menu-btn');
  const mobileDropdown = document.getElementById('mobile-dropdown');

  if (menuBtn && mobileDropdown) {
    // Add CSS for slide down animation since we can't edit style.css
    const style = document.createElement('style');
    style.textContent = `
      #mobile-dropdown {
        transition: max-height 0.3s ease-out, opacity 0.3s ease-out, padding 0.3s ease-out;
        max-height: 0;
        opacity: 0;
        overflow: hidden;
        display: block !important;
        visibility: hidden;
      }
      #mobile-dropdown.show {
        max-height: 500px;
        opacity: 1;
        visibility: visible;
      }
      @keyframes enrollPulse {
        0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(0, 255, 255, 0.4); }
        70% { transform: scale(1.02); box-shadow: 0 0 0 10px rgba(0, 255, 255, 0); }
        100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(0, 255, 255, 0); }
      }
      .btn-pulse {
        animation: enrollPulse 2s infinite;
      }
      html {
        scroll-behavior: smooth;
      }
    `;
    document.head.appendChild(style);

    // Override the inline onclick handler to use smooth animation
    menuBtn.removeAttribute('onclick');
    
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      mobileDropdown.classList.toggle('show');
    });

    // Close menu when clicking links
    mobileDropdown.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mobileDropdown.classList.remove('show');
      });
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!menuBtn.contains(e.target) && !mobileDropdown.contains(e.target)) {
        mobileDropdown.classList.remove('show');
      }
    });
  }

  // 2. FAQ ACCORDION (using event delegation to support dynamic content)
  document.addEventListener('click', (e) => {
    const faqBtn = e.target.closest('.faq-question');
    if (faqBtn) {
      const item = faqBtn.parentElement;
      const icon = faqBtn.querySelector('.faq-icon');
      const isActive = item.classList.contains('active');
      
      // Close all
      document.querySelectorAll('.faq-item').forEach(f => {
        f.classList.remove('active');
        const i = f.querySelector('.faq-icon');
        if (i) i.textContent = '+';
      });
      
      // Open clicked
      if (!isActive) {
        item.classList.add('active');
        if (icon) icon.textContent = '-';
      }
    }
  });

  // 3. SMOOTH SCROLL
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      // Ignore just "#"
      if (targetId === '#') return;
      
      // If it's a link to another page with a hash, let normal navigation happen
      if (targetId.startsWith('#')) {
        const targetElement = document.querySelector(targetId);
        if (targetElement) {
          e.preventDefault();
          // Adjust scroll position to account for fixed navbar (approx 80px)
          const y = targetElement.getBoundingClientRect().top + window.pageYOffset - 80;
          window.scrollTo({ top: y, behavior: 'smooth' });
          // Also close mobile menu if open
          if (mobileDropdown) mobileDropdown.classList.remove('show');
        }
      }
    });
  });

  // 4. STICKY NAV SHADOW
  const nav = document.querySelector('.top-nav');
  if (nav) {
    nav.style.transition = 'box-shadow 0.3s ease';
    window.addEventListener('scroll', () => {
      if (window.scrollY > 10) {
        nav.style.boxShadow = '0 4px 20px rgba(0,0,0,0.1)';
      } else {
        nav.style.boxShadow = 'none';
      }
    });
  }

  // 5. ENROLL BUTTON PULSE
  const elements = document.querySelectorAll('button, a');
  elements.forEach(el => {
    if (el.textContent.trim().toUpperCase() === 'ENROLL NOW') {
      el.classList.add('btn-pulse');
    }
  });

  // 6. REAL-TIME SEATS COUNTER
  const fetchSeats = async () => {
    if (!window.supabase) return;
    try {
      const { data, error } = await supabase.from('seats').select('*').limit(1).single();
      if (error) throw error;
      if (data) {
        const remaining = data.total_seats - data.booked_seats;
        const seatEls = document.querySelectorAll('#seats-available');
        seatEls.forEach(el => {
          if (remaining <= 0) {
            el.textContent = 'Batch Full';
            // Hide enroll buttons
            document.querySelectorAll('a, button').forEach(btn => {
              if (btn.textContent.trim().toUpperCase().includes('ENROLL NOW') || btn.textContent.trim().toUpperCase().includes('JOIN')) {
                btn.style.display = 'none';
              }
            });
          } else if (remaining <= 5) {
            el.innerHTML = `<span style="color:red; font-weight:bold;">${remaining} (Hurry!)</span>`;
          } else {
            el.textContent = remaining;
          }
        });
      }
    } catch (err) {
      console.error('Error fetching seats:', err);
    }
  };
  // Wait a small bit for data.json fetch to populate the hardcoded #seats-available first, then override
  setTimeout(fetchSeats, 500);

  // 7. CONTACT FORM
  const contactForm = document.querySelector('.contact-form form');
  if (contactForm && window.supabase) {
    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = contactForm.querySelector('button[type="submit"]');
      const originalText = btn.textContent;
      btn.textContent = 'Submitting...';
      btn.disabled = true;

      try {
        const formData = new FormData(contactForm);
        const payload = {
          full_name: formData.get('name'),
          email: formData.get('email'),
          whatsapp: formData.get('whatsapp'),
          message: formData.get('message')
        };
        const { error } = await supabase.from('contact_submissions').insert([payload]);
        if (error) throw error;
        
        let msgEl = document.getElementById('contact-msg');
        if (!msgEl) {
          msgEl = document.createElement('p');
          msgEl.id = 'contact-msg';
          contactForm.appendChild(msgEl);
        }
        msgEl.textContent = "Message sent! We'll reply within 24 hours";
        msgEl.style.color = 'green';
        msgEl.style.marginTop = '10px';
        contactForm.reset();
      } catch (err) {
        console.error(err);
        let msgEl = document.getElementById('contact-msg');
        if (!msgEl) {
          msgEl = document.createElement('p');
          msgEl.id = 'contact-msg';
          contactForm.appendChild(msgEl);
        }
        msgEl.textContent = 'Something went wrong, please try again.';
        msgEl.style.color = 'red';
        msgEl.style.marginTop = '10px';
      } finally {
        btn.textContent = originalText;
        btn.disabled = false;
      }
    });
  }

  // 8. ENROLL FORM
  const enrollForm = document.querySelector('.enroll-form form');
  if (enrollForm) {
    enrollForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = enrollForm.querySelector('button[type="submit"]');
      const originalText = btn.textContent;
      btn.textContent = 'Submitting...';
      btn.disabled = true;

      try {
        const formData = new FormData(enrollForm);
        const payload = {
          full_name: formData.get('name'),
          whatsapp: formData.get('whatsapp'),
          email: formData.get('email'),
          city: formData.get('city'),
          heard_from: formData.get('source')
        };
        
        // 1. Insert into Supabase (if configured)
        if (window.supabaseClient) {
          const { error } = await window.supabaseClient.from('enrollments').insert([payload]);
          if (error) {
            console.warn('Supabase Error (Ignored):', error.message);
          }
        }

        // 2. Send Emails
        const emailResponse = await fetch('/api/enroll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: payload.full_name,
            whatsapp: payload.whatsapp,
            email: payload.email,
            city: payload.city,
            source: payload.heard_from
          })
        });

        if (!emailResponse.ok) {
          const errData = await emailResponse.json().catch(() => ({}));
          throw new Error(errData.message || 'Failed to send emails. Please check your Resend configuration.');
        }
        
        window.location.href = 'thank-you.html';
      } catch (err) {
        console.error(err);
        let msgEl = document.getElementById('enroll-msg');
        if (!msgEl) {
          msgEl = document.createElement('p');
          msgEl.id = 'enroll-msg';
          enrollForm.appendChild(msgEl);
        }
        // Show the actual error message instead of generic text
        msgEl.textContent = `Error: ${err.message}. Please try again or WhatsApp us.`;
        msgEl.style.color = 'red';
        msgEl.style.marginTop = '10px';
        btn.textContent = originalText;
        btn.disabled = false;
      }
    });
  }

  // 9. SMART GOOGLE REVIEW POPUP
  function initSmartReviewPopup() {
    if (localStorage.getItem('speaklab_review_shown')) return;

    const path = window.location.pathname;
    const isIndex = path === '/' || path.endsWith('index.html');
    const isContact = path.endsWith('contact.html');
    const isThankYou = path.endsWith('thank-you.html');
    const isFaq = path.endsWith('faq.html');

    if (!isIndex && !isContact && !isThankYou && !isFaq) return;

    // Create popup HTML
    const overlay = document.createElement('div');
    overlay.id = 'smart-review-overlay';
    overlay.innerHTML = `
      <div id="smart-review-popup">
        <div class="stars">⭐⭐⭐⭐⭐</div>
        <h3>Enjoying SpeakLab?</h3>
        <p>Your Google review takes 30 seconds and helps hundreds of students find the confidence they need.</p>
        <div class="buttons">
          <a href="https://g.page/r/CdPtj9VpwqqKEBM/review" target="_blank" rel="noopener noreferrer" class="review-btn" onclick="dismissSmartReviewPopup(true)">⭐ LEAVE A REVIEW</a>
          <button class="later-btn" onclick="dismissSmartReviewPopup(false)">Maybe Later</button>
        </div>
      </div>
    `;

    // Inject CSS
    const style = document.createElement('style');
    style.textContent = `
      #smart-review-overlay {
        position: fixed;
        top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0,0,0,0.8);
        backdrop-filter: blur(5px);
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.4s ease, visibility 0.4s ease;
      }
      #smart-review-overlay.active {
        opacity: 1;
        visibility: visible;
      }
      #smart-review-popup {
        background: radial-gradient(circle at top right, #3b82f6 0%, transparent 70%), linear-gradient(135deg, #1e1e38 0%, #0f0f1a 100%);
        border: 1px solid rgba(255,255,255,0.1);
        padding: 40px;
        border-radius: 30px;
        text-align: center;
        box-shadow: 0 20px 50px rgba(0,0,0,0.5);
        max-width: 500px;
        width: 90%;
        transform: translateY(20px) scale(0.95);
        transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      }
      #smart-review-overlay.active #smart-review-popup {
        transform: translateY(0) scale(1);
      }
      #smart-review-popup .stars {
        font-size: 1.5rem;
        letter-spacing: 5px;
        margin-bottom: 15px;
      }
      #smart-review-popup h3 {
        font-size: 1.8rem;
        color: #fff;
        margin-bottom: 15px;
      }
      #smart-review-popup p {
        font-size: 1.05rem;
        line-height: 1.6;
        color: #cbd5e1;
        margin-bottom: 25px;
      }
      #smart-review-popup .buttons {
        display: flex;
        flex-direction: column;
        gap: 15px;
      }
      #smart-review-popup .review-btn {
        background: linear-gradient(90deg, #f59e0b, #d97706);
        color: #fff;
        text-decoration: none;
        padding: 15px;
        border-radius: 12px;
        font-weight: 600;
        font-size: 1.1rem;
        border: none;
        min-height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      #smart-review-popup .later-btn {
        background: transparent;
        border: 1px solid rgba(255,255,255,0.2);
        color: #94a3b8;
        padding: 12px;
        border-radius: 12px;
        cursor: pointer;
        font-size: 1rem;
        min-height: 44px;
      }
      @media(min-width: 480px) {
        #smart-review-popup .buttons {
          flex-direction: row;
        }
        #smart-review-popup .review-btn { flex: 2; }
        #smart-review-popup .later-btn { flex: 1; }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(overlay);

    window.showSmartReviewPopup = function() {
      if (localStorage.getItem('speaklab_review_shown')) return;
      overlay.classList.add('active');
    };

    window.dismissSmartReviewPopup = function(clickedReview) {
      overlay.classList.remove('active');
      localStorage.setItem('speaklab_review_shown', 'true');
    };

    // Close on outside click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) dismissSmartReviewPopup(false);
    });
    
    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('active')) {
        dismissSmartReviewPopup(false);
      }
    });

    // TRIGGERS
    if (isIndex) {
      let scrolledPast50 = false;
      let timeSpent45s = false;
      
      setTimeout(() => {
        timeSpent45s = true;
        if (scrolledPast50) showSmartReviewPopup();
      }, 45000);

      window.addEventListener('scroll', () => {
        if (scrolledPast50) return;
        const docHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        if (docHeight > 0 && (window.scrollY / docHeight) > 0.5) {
          scrolledPast50 = true;
          if (timeSpent45s) showSmartReviewPopup();
        }
      });
    }
    
    if (isContact) {
      document.addEventListener('mouseleave', (e) => {
        if (e.clientY <= 0) showSmartReviewPopup();
      });
    }

    if (isThankYou) {
      setTimeout(() => {
        showSmartReviewPopup();
      }, 3000);
    }

    if (isFaq) {
      let faqsOpened = new Set();
      document.addEventListener('click', (e) => {
        const faqBtn = e.target.closest('.faq-question');
        if (faqBtn) {
          const index = Array.from(document.querySelectorAll('.faq-question')).indexOf(faqBtn);
          faqsOpened.add(index);
          if (faqsOpened.size >= 3) {
            setTimeout(showSmartReviewPopup, 500);
          }
        }
      });
    }
  }

  initSmartReviewPopup();
});
