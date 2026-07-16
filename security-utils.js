/**
 * SpeakLabs Security Utilities
 * Provides client-side security hardening functions
 * This file should be included on ALL pages
 */

(function() {
  'use strict';

  // ============================================================================
  // SECURITY CONFIGURATION
  // ============================================================================
  const SECURITY_CONFIG = {
    // Content Security Policy - Report only mode initially, then enforce
    cspReportOnly: true,
    
    // Session timeout in milliseconds (30 minutes)
    sessionTimeout: 30 * 60 * 1000,
    
    // Maximum login attempts before lockout
    maxLoginAttempts: 5,
    
    // Lockout duration in milliseconds (15 minutes)
    lockoutDuration: 15 * 60 * 1000,
    
    // Form submission rate limiting (per minute)
    maxSubmissionsPerMinute: 3,
    
    // Allowed domains for external links
    allowedExternalDomains: [
      'wa.me',
      'maps.google.com',
      'fonts.googleapis.com',
      'fonts.gstatic.com',
      'cdn.jsdelivr.net',
      'cdnjs.cloudflare.com',
      'speaklab.pk'
    ],
    
    // Input validation patterns
    validationPatterns: {
      name: /^[a-zA-Z\s\-']{1,100}$/,
      email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
      phone: /^[\+]?[(]?[0-9]{1,3}[)]?[-\s\.]?[(]?[0-9]{1,3}[)]?[-\s\.]?[0-9]{4,10}$/,
      whatsapp: /^[\+]?[0-9]{10,15}$/,
      city: /^[a-zA-Z\s\-']{1,50}$/,
      message: /^[\s\S]{1,5000}$/,
      source: /^[a-zA-Z0-9\s\-_]{1,50}$/
    }
  };

  // ============================================================================
  // INPUT SANITIZATION
  // ============================================================================
  
  /**
   * Sanitize HTML to prevent XSS
   * @param {string} input - Raw input string
   * @returns {string} Sanitized string
   */
  function sanitizeHTML(input) {
    if (typeof input !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML;
  }

  /**
   * Sanitize input for safe use in HTML attributes
   * @param {string} input - Raw input string
   * @returns {string} Sanitized string
   */
  // The HTML entities here had themselves been HTML-unescaped at some point
  // ('&amp;' -> '&', '&#039;' -> ''', which broke the parse). That left this
  // file with a syntax error, so none of it ever ran — and had it run, every
  // replace below swapped a character for itself and sanitized nothing.
  function sanitizeAttribute(input) {
    if (typeof input !== 'string') return '';
    return input
      .replace(/&/g, '&amp;')   // must stay first, or it double-escapes the rest
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Validate input against a pattern
   * @param {string} input - Input to validate
   * @param {RegExp} pattern - Validation pattern
   * @returns {boolean} True if valid
   */
  function validateInput(input, pattern) {
    if (typeof input !== 'string') return false;
    return pattern.test(input.trim());
  }

  /**
   * Validate and sanitize form data
   * @param {Object} formData - Form data object
   * @param {Object} rules - Validation rules per field
   * @returns {Object} { isValid: boolean, sanitizedData: Object, errors: Array }
   */
  function validateAndSanitizeForm(formData, rules) {
    const errors = [];
    const sanitizedData = {};
    
    for (const [field, value] of Object.entries(formData)) {
      const rule = rules[field];
      if (!rule) {
        // No rule defined, just sanitize
        sanitizedData[field] = sanitizeHTML(value);
        continue;
      }
      
      // Check required
      if (rule.required && (!value || value.trim() === '')) {
        errors.push(`${field} is required`);
        continue;
      }
      
      // Validate pattern
      if (rule.pattern && !validateInput(value, rule.pattern)) {
        errors.push(`${field} format is invalid`);
        continue;
      }
      
      // Check max length
      if (rule.maxLength && value.length > rule.maxLength) {
        errors.push(`${field} exceeds maximum length of ${rule.maxLength}`);
        continue;
      }
      
      // Sanitize
      sanitizedData[field] = sanitizeHTML(value);
    }
    
    return {
      isValid: errors.length === 0,
      sanitizedData,
      errors
    };
  }

  // ============================================================================
  // HONEYPOT PROTECTION
  // ============================================================================
  
  /**
   * Create a honeypot field for forms
   * @param {HTMLFormElement} form - Form element
   * @returns {HTMLInputElement} Honeypot input
   */
  function createHoneypot(form) {
    const honeypot = document.createElement('input');
    honeypot.type = 'text';
    honeypot.name = 'website'; // Common bot field name
    honeypot.id = 'website-field';
    honeypot.tabIndex = -1;
    honeypot.autocomplete = 'off';
    honeypot.style.cssText = 'position:absolute;left:-9999px;opacity:0;height:0;width:0;pointer-events:none;';
    honeypot.setAttribute('aria-hidden', 'true');
    form.appendChild(honeypot);
    return honeypot;
  }

  /**
   * Check if honeypot is filled (bot detection)
   * @param {HTMLFormElement} form - Form element
   * @returns {boolean} True if honeypot is filled (likely bot)
   */
  function isHoneypotFilled(form) {
    const honeypot = form.querySelector('input[name="website"], input[name="hp_field"], #website-field');
    return honeypot && honeypot.value !== '';
  }

  // ============================================================================
  // RATE LIMITING
  // ============================================================================
  
  const submissionTracker = new Map();
  
  /**
   * Check and record form submission for rate limiting
   * @param {string} formId - Form identifier
   * @returns {boolean} True if allowed, false if rate limited
   */
  function checkRateLimit(formId) {
    const now = Date.now();
    const minuteAgo = now - 60000;
    
    if (!submissionTracker.has(formId)) {
      submissionTracker.set(formId, []);
    }
    
    const submissions = submissionTracker.get(formId).filter(t => t > minuteAgo);
    
    if (submissions.length >= SECURITY_CONFIG.maxSubmissionsPerMinute) {
      return false;
    }
    
    submissions.push(now);
    submissionTracker.set(formId, submissions);
    return true;
  }

  // ============================================================================
  // SESSION MANAGEMENT
  // ============================================================================
  
  let sessionTimer = null;
  let activityTimer = null;
  
  /**
   * Initialize session timeout handling
   * @param {Function} onTimeout - Callback when session expires
   */
  function initSessionTimeout(onTimeout) {
    // Clear existing timers
    if (sessionTimer) clearTimeout(sessionTimer);
    if (activityTimer) clearTimeout(activityTimer);
    
    // Set session timeout
    sessionTimer = setTimeout(() => {
      cleanupSession();
      if (onTimeout) onTimeout();
    }, SECURITY_CONFIG.sessionTimeout);
    
    // Track user activity
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    function resetActivityTimer() {
      if (activityTimer) clearTimeout(activityTimer);
      activityTimer = setTimeout(() => {
        // Warn user 1 minute before timeout
        if (typeof showToast === 'function') {
          showToast('Session expiring soon', 'Your session will expire in 1 minute due to inactivity.', 'warning');
        }
      }, SECURITY_CONFIG.sessionTimeout - 60000);
    }
    
    activityEvents.forEach(event => {
      document.addEventListener(event, resetActivityTimer, { passive: true });
    });
    
    // Initial reset
    resetActivityTimer();
  }
  
  /**
   * Clean up session data on logout/timeout
   */
  function cleanupSession() {
    // Clear all timers
    if (sessionTimer) clearTimeout(sessionTimer);
    if (activityTimer) clearTimeout(activityTimer);
    
    // Clear sensitive data from localStorage/sessionStorage
    const sensitiveKeys = ['supabase.auth.token', 'user_data', 'auth_token'];
    sensitiveKeys.forEach(key => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
    
    // Clear any Supabase auth data
    if (window.supabaseClient && window.supabaseClient.auth) {
      window.supabaseClient.auth.signOut().catch(() => {});
    }
  }
  
  /**
   * Secure logout with cleanup
   * @param {string} redirectUrl - URL to redirect after logout
   */
  function secureLogout(redirectUrl = 'login.html') {
    cleanupSession();
    window.location.href = redirectUrl;
  }

  // ============================================================================
  // EXTERNAL LINK PROTECTION
  // ============================================================================
  
  /**
   * Add security attributes to all external links
   */
  function secureExternalLinks() {
    const links = document.querySelectorAll('a[href^="http"]');
    links.forEach(link => {
      const href = link.getAttribute('href');
      try {
        const url = new URL(href);
        const isExternal = !SECURITY_CONFIG.allowedExternalDomains.some(domain => 
          url.hostname === domain || url.hostname.endsWith('.' + domain)
        );
        
        if (isExternal) {
          link.setAttribute('rel', 'noopener noreferrer');
          link.setAttribute('target', '_blank');
        }
      } catch (e) {
        // Invalid URL, add protection anyway
        link.setAttribute('rel', 'noopener noreferrer');
        link.setAttribute('target', '_blank');
      }
    });
  }

  // ============================================================================
  // CONSOLE PROTECTION
  // ============================================================================
  
  /**
   * Disable console.log/error in production to prevent data leakage
   */
  function protectConsole() {
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      const noop = () => {};
      console.log = noop;
      console.info = noop;
      console.warn = noop;
      console.error = noop;
      console.debug = noop;
    }
  }

  // ============================================================================
  // HTTPS ENFORCEMENT
  // ============================================================================
  
  /**
   * Enforce HTTPS
   */
  function enforceHTTPS() {
    if (window.location.protocol === 'http:' && 
        window.location.hostname !== 'localhost' && 
        window.location.hostname !== '127.0.0.1') {
      window.location.href = window.location.href.replace('http:', 'https:');
    }
  }

  // ============================================================================
  // CSP REPORTING
  // ============================================================================
  
  /**
   * Set up CSP violation reporting
   */
  function setupCSPReporting() {
    document.addEventListener('securitypolicyviolation', (e) => {
      // Log CSP violations (in production, send to reporting endpoint)
      if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        // In production, send to your CSP reporting endpoint
        // fetch('/api/csp-report', { method: 'POST', body: JSON.stringify(e) });
      } else {
        console.warn('CSP Violation:', e.violatedDirective, e.blockedURI);
      }
    });
  }

  // ============================================================================
  // DEPENDENCY INTEGRITY CHECKING
  // ============================================================================
  
  /**
   * Verify script integrity (basic check)
   * @param {string} scriptSrc - Script source URL
   * @param {string} expectedIntegrity - Expected integrity hash
   * @returns {Promise<boolean>} True if integrity matches
   */
  async function verifyScriptIntegrity(scriptSrc, expectedIntegrity) {
    try {
      const response = await fetch(scriptSrc, { integrity: expectedIntegrity });
      return response.ok;
    } catch (e) {
      return false;
    }
  }

  // ============================================================================
  // AUTHENTICATION HELPERS
  // ============================================================================
  
  /**
   * Check if user is authenticated (for protected pages)
   * @returns {Promise<boolean>} True if authenticated
   */
  async function checkAuth() {
    if (!window.supabaseClient) return false;

    try {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      return !!session;
    } catch (e) {
      return false;
    }
  }
  
  /**
   * Check if user has admin role
   * @returns {Promise<boolean>} True if admin
   */
  async function checkAdminAuth() {
    if (!window.supabaseClient) return false;

    try {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (!session) return false;

      // Check user metadata for admin role
      const { data: { user } } = await window.supabaseClient.auth.getUser();
      return user?.user_metadata?.role === 'admin' || user?.app_metadata?.role === 'admin';
    } catch (e) {
      return false;
    }
  }
  
  /**
   * Redirect to login if not authenticated
   * @param {string} redirectUrl - URL to redirect to after login
   */
  async function requireAuth(redirectUrl = null) {
    const isAuthenticated = await checkAuth();
    if (!isAuthenticated) {
      const loginUrl = redirectUrl ? `login.html?redirect=${encodeURIComponent(redirectUrl)}` : 'login.html';
      window.location.href = loginUrl;
      return false;
    }
    return true;
  }
  
  /**
   * Redirect to login if not admin
   */
  async function requireAdminAuth() {
    const isAdmin = await checkAdminAuth();
    if (!isAdmin) {
      window.location.href = 'login.html';
      return false;
    }
    return true;
  }

  // ============================================================================
  // TOAST NOTIFICATIONS (for security warnings)
  // ============================================================================
  
  /**
   * Show toast notification
   * @param {string} title - Toast title
   * @param {string} message - Toast message
   * @param {string} type - Type: 'info', 'success', 'warning', 'error'
   */
  function showToast(title, message, type = 'info') {
    // Create toast container if not exists
    let container = document.getElementById('security-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'security-toast-container';
      container.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        display: flex;
        flex-direction: column;
        gap: 10px;
      `;
      document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    const colors = {
      info: '#3b82f6',
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444'
    };
    
    toast.style.cssText = `
      background: white;
      border-left: 4px solid ${colors[type]};
      padding: 16px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      min-width: 300px;
      max-width: 400px;
      animation: slideIn 0.3s ease;
    `;
    
    toast.innerHTML = `
      <div style="font-weight: 600; color: #111; margin-bottom: 4px;">${sanitizeHTML(title)}</div>
      <div style="color: #555; font-size: 0.9rem;">${sanitizeHTML(message)}</div>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  
  /**
   * Initialize all security features
   */
  function initSecurity() {
    // Enforce HTTPS
    enforceHTTPS();
    
    // Protect console in production
    protectConsole();
    
    // Secure external links
    secureExternalLinks();
    
    // Setup CSP reporting
    setupCSPReporting();
    
    // Add animation styles for toasts
    if (!document.getElementById('security-toast-styles')) {
      const style = document.createElement('style');
      style.id = 'security-toast-styles';
      style.textContent = `
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(100%); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }
  }
  
  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSecurity);
  } else {
    initSecurity();
  }

  // ============================================================================
  // EXPORT PUBLIC API
  // ============================================================================
  
  window.SpeakLabsSecurity = {
    sanitizeHTML,
    sanitizeAttribute,
    validateInput,
    validateAndSanitizeForm,
    createHoneypot,
    isHoneypotFilled,
    checkRateLimit,
    initSessionTimeout,
    cleanupSession,
    secureLogout,
    secureExternalLinks,
    protectConsole,
    enforceHTTPS,
    checkAuth,
    checkAdminAuth,
    requireAuth,
    requireAdminAuth,
    showToast,
    CONFIG: SECURITY_CONFIG
  };
})();