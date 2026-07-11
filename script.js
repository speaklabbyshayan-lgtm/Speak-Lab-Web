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
  if (enrollForm && window.supabase) {
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
        const { error } = await supabase.from('enrollments').insert([payload]);
        if (error) throw error;
        
        window.location.href = 'thank-you.html';
      } catch (err) {
        console.error(err);
        let msgEl = document.getElementById('enroll-msg');
        if (!msgEl) {
          msgEl = document.createElement('p');
          msgEl.id = 'enroll-msg';
          enrollForm.appendChild(msgEl);
        }
        msgEl.textContent = 'Something went wrong, please try again or WhatsApp us';
        msgEl.style.color = 'red';
        msgEl.style.marginTop = '10px';
        btn.textContent = originalText;
        btn.disabled = false;
      }
    });
  }
});
