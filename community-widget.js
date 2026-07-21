/*
 * SpeakLab — Community Announcements widget
 * ------------------------------------------------------------------
 * Drops a live community board into #community-widget. Self-contained:
 * injects its own (theme-matched) styles so there is no external CSS to cache.
 *
 * Backend: Supabase (window.supabaseClient from supabase-config.js).
 * Run community-schema.sql once in the Supabase SQL editor to create the
 * tables, policies, realtime and starter posts.
 *
 * Roles:
 *   - Visitors  : read everything, like posts (localStorage-tracked), cannot post.
 *   - Students  : post, reply, like. Badge "Student 🎓".
 *   - Admins    : everything + pin/unpin + delete any post/reply. Badge "Admin 👑".
 *                 Admin = whatever public.is_admin() returns (admin_users table).
 */
(function () {
  'use strict';

  var MOUNT_ID = 'community-widget';
  var PAGE_SIZE = 10;

  // Theme tokens (read from the site's CSS: navy / teal / gold / dark / Outfit)
  var C = {
    navy: '#1e3a8a', teal: '#0f766e', gold: '#d97706', dark: '#0b0e1a',
    text: '#111111', muted: '#555555', line: '#ececf2', soft: '#f6f7fb'
  };
  var AVATAR_COLORS = ['#1e3a8a', '#0f766e', '#d97706', '#7c3aed', '#be123c', '#0369a1'];

  // ---- State --------------------------------------------------------------
  var sb = window.supabaseClient || null;
  var state = {
    session: null, user: null, isAdmin: false, name: null, badge: null,
    posts: [], repliesByPost: {}, offset: 0, hasMore: true,
    seenPosts: new Set(), seenReplies: new Set(),
    expanded: new Set()  // post ids whose replies/reply-box are open
  };

  // ---- Small utils --------------------------------------------------------
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function initial(name) {
    var n = (name || '?').trim();
    return n ? n.charAt(0).toUpperCase() : '?';
  }
  function avatarColor(name) {
    var h = 0, s = name || '';
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  }
  function isAdminBadge(b) { return /admin/i.test(b || ''); }
  function relTime(ts) {
    var d = new Date(ts).getTime();
    if (isNaN(d)) return '';
    var s = Math.floor((Date.now() - d) / 1000);
    if (s < 45) return 'just now';
    var m = Math.floor(s / 60);
    if (m < 60) return m + (m === 1 ? ' minute ago' : ' minutes ago');
    var h = Math.floor(m / 60);
    if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
    var day = Math.floor(h / 24);
    if (day < 7) return day + (day === 1 ? ' day ago' : ' days ago');
    var w = Math.floor(day / 7);
    if (w < 5) return w + (w === 1 ? ' week ago' : ' weeks ago');
    return new Date(ts).toLocaleDateString();
  }
  function lget(key, def) {
    try { return JSON.parse(localStorage.getItem(key)) || def; } catch (e) { return def; }
  }
  function lset(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }
  function visitorId() {
    var id = lget('slab_cw_visitor', null);
    if (!id) {
      id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
        : 'v-' + Date.now() + '-' + Math.random().toString(16).slice(2);
      lset('slab_cw_visitor', id);
    }
    return id;
  }
  function likedSet() { return new Set(lget('slab_cw_liked', [])); }
  function markLiked(id) { var s = likedSet(); s.add(id); lset('slab_cw_liked', Array.from(s)); }

  // ---- Styles -------------------------------------------------------------
  function injectStyles() {
    if (document.getElementById('slab-cw-style')) return;
    var css = [
      '.slab-cw{flex:0 0 100%;max-width:560px;margin:46px auto 0;position:relative;z-index:1;text-align:left;font-family:"Outfit",system-ui,-apple-system,sans-serif;color:' + C.text + ';}',
      '.slab-cw *{box-sizing:border-box;}',
      '.slab-cw-board{background:#fff;border:1px solid ' + C.line + ';border-radius:22px;overflow:hidden;box-shadow:0 24px 60px rgba(17,24,58,0.10);}',
      '.slab-cw-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;color:#fff;background:linear-gradient(120deg,' + C.navy + ' 0%,' + C.teal + ' 60%,' + C.gold + ' 130%);}',
      '.slab-cw-title{display:flex;align-items:center;gap:9px;font-weight:800;font-size:1.02rem;letter-spacing:-.01em;}',
      '.slab-cw-live{display:inline-flex;align-items:center;gap:6px;font-size:.62rem;font-weight:800;letter-spacing:.14em;background:rgba(255,255,255,.18);padding:5px 10px;border-radius:999px;}',
      '.slab-cw-live .d{width:7px;height:7px;border-radius:50%;background:#4ade80;box-shadow:0 0 0 0 rgba(74,222,128,.7);animation:slabPulse 1.8s infinite;}',
      '@keyframes slabPulse{0%{box-shadow:0 0 0 0 rgba(74,222,128,.6);}70%{box-shadow:0 0 0 7px rgba(74,222,128,0);}100%{box-shadow:0 0 0 0 rgba(74,222,128,0);}}',

      '.slab-cw-compose{padding:14px 16px;border-bottom:1px solid ' + C.line + ';display:flex;gap:11px;}',
      '.slab-cw-compose .av{flex:0 0 auto;}',
      '.slab-cw-cbody{flex:1;min-width:0;}',
      '.slab-cw-ta{width:100%;border:1px solid ' + C.line + ';border-radius:13px;padding:11px 13px;font:inherit;font-size:.93rem;resize:none;height:44px;transition:height .18s ease,border-color .18s ease;background:' + C.soft + ';color:' + C.text + ';}',
      '.slab-cw-ta:focus{outline:none;border-color:' + C.teal + ';background:#fff;height:88px;}',
      '.slab-cw-ta.tall{height:88px;background:#fff;}',
      '.slab-cw-cfoot{display:flex;align-items:center;justify-content:flex-end;gap:14px;margin-top:9px;}',
      '.slab-cw-count{font-size:.76rem;color:' + C.muted + ';font-variant-numeric:tabular-nums;}',
      '.slab-cw-count.over{color:#e11d48;}',
      '.slab-cw-post-btn{border:none;cursor:pointer;font:inherit;font-weight:800;font-size:.78rem;letter-spacing:.06em;color:#fff;background:' + C.dark + ';padding:9px 20px;border-radius:999px;transition:opacity .2s,transform .15s;}',
      '.slab-cw-post-btn:disabled{opacity:.4;cursor:not-allowed;}',
      '.slab-cw-post-btn:not(:disabled):hover{transform:translateY(-1px);}',

      '.slab-cw-login{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 18px;border-bottom:1px solid ' + C.line + ';background:' + C.soft + ';font-size:.86rem;color:' + C.muted + ';}',
      '.slab-cw-login a{color:' + C.navy + ';font-weight:700;text-decoration:none;white-space:nowrap;}',
      '.slab-cw-login a:hover{text-decoration:underline;}',

      '.slab-cw-feed{max-height:500px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:' + C.teal + ' transparent;}',
      '.slab-cw-feed::-webkit-scrollbar{width:8px;}',
      '.slab-cw-feed::-webkit-scrollbar-thumb{background:linear-gradient(' + C.navy + ',' + C.teal + ');border-radius:8px;border:2px solid #fff;}',
      '.slab-cw-feed::-webkit-scrollbar-track{background:transparent;}',

      '.slab-cw-post{padding:16px 18px;border-bottom:1px solid ' + C.line + ';position:relative;animation:slabIn .35s ease;}',
      '@keyframes slabIn{from{opacity:0;transform:translateY(-8px);}to{opacity:1;transform:none;}}',
      '.slab-cw-post.admin{background:linear-gradient(180deg,rgba(30,58,138,.05),rgba(15,118,110,.03));}',
      '.slab-cw-post.pinned{border-left:4px solid ' + C.gold + ';}',
      '.slab-cw-prow{display:flex;align-items:center;gap:10px;}',
      '.slab-cw-av{flex:0 0 auto;width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:1rem;}',
      '.slab-cw-meta{flex:1;min-width:0;line-height:1.25;}',
      '.slab-cw-name{font-weight:700;font-size:.9rem;}',
      '.slab-cw-badge{display:inline-block;font-size:.62rem;font-weight:800;letter-spacing:.04em;padding:2px 8px;border-radius:999px;margin-left:6px;vertical-align:middle;background:' + C.soft + ';color:' + C.muted + ';}',
      '.slab-cw-badge.admin{background:linear-gradient(90deg,' + C.navy + ',' + C.gold + ');color:#fff;}',
      '.slab-cw-badge.student{background:rgba(15,118,110,.12);color:' + C.teal + ';}',
      '.slab-cw-time{font-size:.74rem;color:' + C.muted + ';}',
      '.slab-cw-pin-ic{color:' + C.gold + ';margin-right:4px;}',
      '.slab-cw-content{margin:10px 0 12px;font-size:.94rem;line-height:1.5;white-space:pre-wrap;word-wrap:break-word;}',
      '.slab-cw-actions{display:flex;align-items:center;gap:20px;}',
      '.slab-cw-act{display:inline-flex;align-items:center;gap:6px;background:none;border:none;cursor:pointer;font:inherit;font-size:.82rem;font-weight:600;color:' + C.muted + ';padding:2px;transition:color .18s,transform .12s;}',
      '.slab-cw-act:hover{color:' + C.navy + ';}',
      '.slab-cw-act.liked{color:#e11d48;}',
      '.slab-cw-act.liked:hover{color:#e11d48;}',
      '.slab-cw-act.pop{transform:scale(1.25);}',
      '.slab-cw-admin-ctl{position:absolute;top:12px;right:12px;display:flex;gap:6px;opacity:0;transition:opacity .18s;}',
      '.slab-cw-post:hover .slab-cw-admin-ctl{opacity:1;}',
      '.slab-cw-iconbtn{width:28px;height:28px;border:none;border-radius:8px;cursor:pointer;background:' + C.soft + ';font-size:.8rem;display:flex;align-items:center;justify-content:center;transition:background .18s;}',
      '.slab-cw-iconbtn:hover{background:#e6e8f0;}',
      '.slab-cw-iconbtn.on{background:' + C.gold + ';}',

      '.slab-cw-replies{margin:12px 0 2px;padding-left:14px;border-left:2px solid ' + C.line + ';display:none;}',
      '.slab-cw-replies.open{display:block;animation:slabIn .3s ease;}',
      '.slab-cw-reply{padding:8px 0;}',
      '.slab-cw-reply .slab-cw-prow{gap:8px;}',
      '.slab-cw-rav{width:28px;height:28px;font-size:.8rem;}',
      '.slab-cw-rname{font-weight:700;font-size:.82rem;}',
      '.slab-cw-rtext{font-size:.87rem;line-height:1.45;margin:4px 0 0 36px;white-space:pre-wrap;word-wrap:break-word;}',
      '.slab-cw-rdel{background:none;border:none;color:' + C.muted + ';cursor:pointer;font-size:.9rem;padding:0 4px;}',
      '.slab-cw-rdel:hover{color:#e11d48;}',
      '.slab-cw-rbox{display:flex;gap:8px;margin-top:8px;}',
      '.slab-cw-rinput{flex:1;border:1px solid ' + C.line + ';border-radius:10px;padding:8px 11px;font:inherit;font-size:.85rem;background:' + C.soft + ';}',
      '.slab-cw-rinput:focus{outline:none;border-color:' + C.teal + ';background:#fff;}',
      '.slab-cw-rsend{border:none;background:' + C.teal + ';color:#fff;border-radius:10px;padding:0 15px;font:inherit;font-weight:700;font-size:.8rem;cursor:pointer;}',
      '.slab-cw-rsend:disabled{opacity:.4;cursor:not-allowed;}',

      '.slab-cw-more{width:100%;border:none;background:#fff;color:' + C.navy + ';font:inherit;font-weight:700;font-size:.85rem;padding:14px;cursor:pointer;border-top:1px solid ' + C.line + ';}',
      '.slab-cw-more:hover{background:' + C.soft + ';}',
      '.slab-cw-empty{padding:34px 20px;text-align:center;color:' + C.muted + ';font-size:.9rem;}',

      '.slab-cw-sk{padding:16px 18px;border-bottom:1px solid ' + C.line + ';}',
      '.slab-cw-sk .l{height:11px;border-radius:6px;background:linear-gradient(90deg,#eef0f5 25%,#f7f8fb 50%,#eef0f5 75%);background-size:200% 100%;animation:slabShim 1.3s infinite;}',
      '@keyframes slabShim{0%{background-position:200% 0;}100%{background-position:-200% 0;}}',
      '.slab-cw-sk .row{display:flex;align-items:center;gap:10px;margin-bottom:12px;}',
      '.slab-cw-sk .c{width:38px;height:38px;border-radius:50%;flex:0 0 auto;}',

      '.slab-cw-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%) translateY(20px);background:' + C.dark + ';color:#fff;padding:11px 18px;border-radius:999px;font-family:"Outfit",sans-serif;font-size:.85rem;font-weight:600;z-index:100000;opacity:0;transition:opacity .25s,transform .25s;pointer-events:none;}',
      '.slab-cw-toast.show{opacity:1;transform:translateX(-50%) translateY(0);}',

      '@media (max-width:640px){.slab-cw{margin-top:34px;}.slab-cw-feed{max-height:400px;}.slab-cw-head{padding:14px 16px;}.slab-cw-title{font-size:.95rem;}}'
    ].join('');
    var el = document.createElement('style');
    el.id = 'slab-cw-style';
    el.textContent = css;
    document.head.appendChild(el);
  }

  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'slab-cw-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 300);
    }, 2600);
  }

  // ---- WhatsApp-icon-free SVGs -------------------------------------------
  var HEART = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21s-7.5-4.9-10-9.2C.4 8.9 1.6 5.5 4.7 5.5c1.9 0 3.1 1.1 3.9 2.3.8-1.2 2-2.3 3.9-2.3 3.1 0 4.3 3.4 2.7 6.3C19.5 16.1 12 21 12 21z"/></svg>';
  var HEART_O = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 20s-7-4.6-9.3-8.5C1.3 9.1 2.4 6.5 5 6.5c1.7 0 2.9 1 3.8 2.2C9.7 7.5 10.9 6.5 12.6 6.5c2.6 0 3.7 2.6 2.3 5C13.6 15.4 12 20 12 20z"/></svg>';
  var CHAT = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
  var SHARE = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/></svg>';

  // ---- Rendering ----------------------------------------------------------
  function badgeHtml(badge) {
    var cls = isAdminBadge(badge) ? 'admin' : 'student';
    return '<span class="slab-cw-badge ' + cls + '">' + esc(badge || 'Student') + '</span>';
  }

  function replyHtml(r) {
    var canDel = state.isAdmin || (state.user && state.user.id === r.user_id);
    return '' +
      '<div class="slab-cw-reply" data-reply="' + r.id + '">' +
        '<div class="slab-cw-prow">' +
          '<div class="slab-cw-av slab-cw-rav" style="background:' + avatarColor(r.user_name) + '">' + esc(initial(r.user_name)) + '</div>' +
          '<div class="slab-cw-meta"><span class="slab-cw-rname">' + esc(r.user_name) + '</span>' + badgeHtml(r.user_badge) +
            ' <span class="slab-cw-time">• ' + esc(relTime(r.created_at)) + '</span></div>' +
          (canDel ? '<button class="slab-cw-rdel" data-delreply="' + r.id + '" title="Delete reply">🗑️</button>' : '') +
        '</div>' +
        '<div class="slab-cw-rtext">' + esc(r.content) + '</div>' +
      '</div>';
  }

  function postHtml(p) {
    var admin = isAdminBadge(p.user_badge);
    var replies = state.repliesByPost[p.id] || [];
    var open = state.expanded.has(p.id);
    var liked = likedSet().has(p.id);
    var cls = 'slab-cw-post' + (admin ? ' admin' : '') + (p.is_pinned ? ' pinned' : '');

    var adminCtl = state.isAdmin ? (
      '<div class="slab-cw-admin-ctl">' +
        '<button class="slab-cw-iconbtn' + (p.is_pinned ? ' on' : '') + '" data-pin="' + p.id + '" title="' + (p.is_pinned ? 'Unpin' : 'Pin') + '">📌</button>' +
        '<button class="slab-cw-iconbtn" data-delpost="' + p.id + '" title="Delete post">🗑️</button>' +
      '</div>') : '';

    var repliesHtml = replies.map(replyHtml).join('');
    var replyBox = (state.user ? (
      '<div class="slab-cw-rbox">' +
        '<input class="slab-cw-rinput" data-rinput="' + p.id + '" maxlength="500" placeholder="Write a reply…">' +
        '<button class="slab-cw-rsend" data-rsend="' + p.id + '" disabled>Reply</button>' +
      '</div>') : '');

    return '' +
      '<article class="' + cls + '" data-post="' + p.id + '">' +
        adminCtl +
        '<div class="slab-cw-prow">' +
          '<div class="slab-cw-av" style="background:' + avatarColor(p.user_name) + '">' + esc(initial(p.user_name)) + '</div>' +
          '<div class="slab-cw-meta">' +
            '<div class="slab-cw-name">' + (p.is_pinned ? '<span class="slab-cw-pin-ic">📌</span>' : '') + esc(p.user_name) + badgeHtml(p.user_badge) + '</div>' +
            '<div class="slab-cw-time">' + esc(relTime(p.created_at)) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="slab-cw-content">' + esc(p.content) + '</div>' +
        '<div class="slab-cw-actions">' +
          '<button class="slab-cw-act like' + (liked ? ' liked' : '') + '" data-like="' + p.id + '">' +
            '<span class="ic">' + (liked ? HEART : HEART_O) + '</span> <span class="n">' + (p.likes_count || 0) + '</span></button>' +
          '<button class="slab-cw-act" data-toggle="' + p.id + '">' + CHAT + ' <span>' + (replies.length ? replies.length + (replies.length === 1 ? ' reply' : ' replies') : 'Reply') + '</span></button>' +
          '<button class="slab-cw-act" data-share="' + p.id + '">' + SHARE + ' Share</button>' +
        '</div>' +
        '<div class="slab-cw-replies' + (open ? ' open' : '') + '" data-replies="' + p.id + '">' +
          repliesHtml + replyBox +
        '</div>' +
      '</article>';
  }

  function sortPosts() {
    state.posts.sort(function (a, b) {
      if (!!b.is_pinned !== !!a.is_pinned) return (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0);
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }

  function feedHtml() {
    if (!state.posts.length) {
      return '<div class="slab-cw-empty">No announcements yet — check back soon! 💬</div>';
    }
    sortPosts();
    return state.posts.map(postHtml).join('') +
      (state.hasMore ? '<button class="slab-cw-more" data-more>Load more</button>' : '');
  }

  function composeHtml() {
    if (state.user) {
      return '' +
        '<div class="slab-cw-compose">' +
          '<div class="av slab-cw-av" style="background:' + avatarColor(state.name) + '">' + esc(initial(state.name)) + '</div>' +
          '<div class="slab-cw-cbody">' +
            '<textarea class="slab-cw-ta" id="slab-cw-ta" maxlength="500" placeholder="What\'s on your mind?"></textarea>' +
            '<div class="slab-cw-cfoot"><span class="slab-cw-count" id="slab-cw-count">0/500</span>' +
              '<button class="slab-cw-post-btn" id="slab-cw-post" disabled>POST</button></div>' +
          '</div>' +
        '</div>';
    }
    return '' +
      '<div class="slab-cw-login">' +
        '<span>💬 Login to join the conversation</span>' +
        '<a href="login.html">Login to post or reply →</a>' +
      '</div>';
  }

  function boardShell(inner) {
    return '' +
      '<div class="slab-cw-board">' +
        '<div class="slab-cw-head">' +
          '<span class="slab-cw-title">📢 SpeakLab Community</span>' +
          '<span class="slab-cw-live"><span class="d"></span>LIVE</span>' +
        '</div>' +
        inner +
      '</div>';
  }

  function skeleton() {
    var one = '<div class="slab-cw-sk"><div class="row"><div class="l c"></div><div style="flex:1"><div class="l" style="width:40%"></div><div class="l" style="width:24%;margin-top:7px"></div></div></div><div class="l" style="width:92%"></div><div class="l" style="width:70%;margin-top:7px"></div></div>';
    return boardShell('<div class="slab-cw-feed">' + one + one + one + '</div>');
  }

  var mount;
  function render() {
    if (!mount) return;
    mount.innerHTML = boardShell(composeHtml() + '<div class="slab-cw-feed">' + feedHtml() + '</div>');
    wire();
  }

  // ---- Data ---------------------------------------------------------------
  function fetchReplies(postIds) {
    if (!postIds.length) return Promise.resolve();
    return sb.from('community_replies').select('*').in('post_id', postIds)
      .order('created_at', { ascending: true })
      .then(function (res) {
        (res.data || []).forEach(function (r) {
          state.seenReplies.add(r.id);
          (state.repliesByPost[r.post_id] = state.repliesByPost[r.post_id] || []).push(r);
        });
      });
  }

  function loadPage() {
    return sb.from('community_posts').select('*')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .range(state.offset, state.offset + PAGE_SIZE - 1)
      .then(function (res) {
        if (res.error) throw res.error;
        var rows = res.data || [];
        var fresh = rows.filter(function (p) { return !state.seenPosts.has(p.id); });
        fresh.forEach(function (p) { state.seenPosts.add(p.id); state.posts.push(p); });
        state.offset += rows.length;
        state.hasMore = rows.length === PAGE_SIZE;
        return fetchReplies(fresh.map(function (p) { return p.id; }));
      });
  }

  // ---- Auth ---------------------------------------------------------------
  function resolveAuth() {
    if (!sb) return Promise.resolve();
    return sb.auth.getSession().then(function (res) {
      var session = res && res.data ? res.data.session : null;
      state.session = session;
      state.user = session ? session.user : null;
      if (state.user) {
        var m = state.user.user_metadata || {};
        state.name = m.full_name || m.name || (state.user.email || '').split('@')[0] || 'Member';
        return sb.rpc('is_admin').then(function (r) {
          state.isAdmin = !!(r && r.data);
          state.badge = state.isAdmin ? 'Admin 👑' : 'Student 🎓';
        }).catch(function () { state.badge = 'Student 🎓'; });
      }
    });
  }

  // ---- Actions ------------------------------------------------------------
  function createPost(content) {
    return sb.from('community_posts').insert({
      user_id: state.user.id, user_name: state.name, user_badge: state.badge, content: content
    }).select().single().then(function (res) {
      if (res.error) throw res.error;
      var p = res.data;
      state.seenPosts.add(p.id);
      state.posts.unshift(p);
      render();
    });
  }

  function createReply(postId, content) {
    return sb.from('community_replies').insert({
      post_id: postId, user_id: state.user.id, user_name: state.name, user_badge: state.badge, content: content
    }).select().single().then(function (res) {
      if (res.error) throw res.error;
      var r = res.data;
      state.seenReplies.add(r.id);
      (state.repliesByPost[postId] = state.repliesByPost[postId] || []).push(r);
      state.expanded.add(postId);
      render();
    });
  }

  function likePost(postId, btn) {
    if (likedSet().has(postId)) return;
    markLiked(postId);
    // optimistic UI
    var post = state.posts.find(function (p) { return p.id === postId; });
    if (post) post.likes_count = (post.likes_count || 0) + 1;
    if (btn) {
      btn.classList.add('liked', 'pop');
      btn.querySelector('.ic').innerHTML = HEART;
      var n = btn.querySelector('.n'); if (n) n.textContent = post ? post.likes_count : n.textContent;
      setTimeout(function () { btn.classList.remove('pop'); }, 180);
    }
    var row = { post_id: postId, visitor_id: visitorId() };
    if (state.user) row.user_id = state.user.id;
    sb.from('community_likes').insert(row).then(function (res) {
      if (res.error && !/duplicate|unique/i.test(res.error.message || '')) {
        console.warn('like failed', res.error.message);
      }
    });
  }

  function togglePin(postId) {
    var post = state.posts.find(function (p) { return p.id === postId; });
    if (!post) return;
    var next = !post.is_pinned;
    sb.from('community_posts').update({ is_pinned: next }).eq('id', postId)
      .then(function (res) {
        if (res.error) { toast('Could not update pin'); return; }
        post.is_pinned = next; render();
      });
  }

  function deletePost(postId) {
    sb.from('community_posts').delete().eq('id', postId).then(function (res) {
      if (res.error) { toast('Delete failed'); return; }
      state.posts = state.posts.filter(function (p) { return p.id !== postId; });
      delete state.repliesByPost[postId];
      render();
    });
  }

  function deleteReply(replyId) {
    sb.from('community_replies').delete().eq('id', replyId).then(function (res) {
      if (res.error) { toast('Delete failed'); return; }
      Object.keys(state.repliesByPost).forEach(function (pid) {
        state.repliesByPost[pid] = state.repliesByPost[pid].filter(function (r) { return r.id !== replyId; });
      });
      render();
    });
  }

  // ---- Event wiring (re-run after every render) ---------------------------
  function wire() {
    var root = mount;

    // Compose box
    var ta = root.querySelector('#slab-cw-ta');
    if (ta) {
      var countEl = root.querySelector('#slab-cw-count');
      var postBtn = root.querySelector('#slab-cw-post');
      ta.addEventListener('focus', function () { ta.classList.add('tall'); });
      ta.addEventListener('input', function () {
        var len = ta.value.length;
        countEl.textContent = len + '/500';
        countEl.classList.toggle('over', len > 500);
        postBtn.disabled = ta.value.trim().length === 0 || len > 500;
      });
      postBtn.addEventListener('click', function () {
        var content = ta.value.trim();
        if (!content) return;
        postBtn.disabled = true; postBtn.textContent = '…';
        createPost(content).catch(function (e) {
          toast('Could not post — ' + (e.message || 'try again'));
          postBtn.disabled = false; postBtn.textContent = 'POST';
        });
      });
    }

    // Post-level buttons
    root.querySelectorAll('[data-like]').forEach(function (b) {
      b.addEventListener('click', function () { likePost(b.getAttribute('data-like'), b); });
    });
    root.querySelectorAll('[data-toggle]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-toggle');
        var box = root.querySelector('[data-replies="' + id + '"]');
        if (!box) return;
        var open = box.classList.toggle('open');
        if (open) state.expanded.add(id); else state.expanded.delete(id);
      });
    });
    root.querySelectorAll('[data-share]').forEach(function (b) {
      b.addEventListener('click', function () {
        var url = location.origin + location.pathname + '#post-' + b.getAttribute('data-share');
        if (navigator.share) { navigator.share({ title: 'SpeakLab Community', url: url }).catch(function () {}); }
        else if (navigator.clipboard) { navigator.clipboard.writeText(url); toast('Link copied!'); }
        else { toast('Share: ' + url); }
      });
    });
    root.querySelectorAll('[data-pin]').forEach(function (b) {
      b.addEventListener('click', function () { togglePin(b.getAttribute('data-pin')); });
    });
    root.querySelectorAll('[data-delpost]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (confirm('Delete this post?')) deletePost(b.getAttribute('data-delpost'));
      });
    });
    root.querySelectorAll('[data-delreply]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (confirm('Delete this reply?')) deleteReply(b.getAttribute('data-delreply'));
      });
    });

    // Reply inputs
    root.querySelectorAll('[data-rinput]').forEach(function (inp) {
      var id = inp.getAttribute('data-rinput');
      var send = root.querySelector('[data-rsend="' + id + '"]');
      inp.addEventListener('input', function () { send.disabled = inp.value.trim().length === 0; });
      function submit() {
        var content = inp.value.trim();
        if (!content) return;
        send.disabled = true;
        createReply(id, content).catch(function (e) { toast('Reply failed'); send.disabled = false; });
      }
      send.addEventListener('click', submit);
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    });

    // Load more
    var more = root.querySelector('[data-more]');
    if (more) more.addEventListener('click', function () {
      more.textContent = 'Loading…';
      loadPage().then(render).catch(function () { more.textContent = 'Load more'; });
    });
  }

  // ---- Realtime -----------------------------------------------------------
  function subscribe() {
    if (!sb || !sb.channel) return;
    sb.channel('community-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_posts' }, function (payload) {
        var p = payload.new;
        if (state.seenPosts.has(p.id)) return;
        state.seenPosts.add(p.id);
        state.posts.unshift(p);
        render();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_replies' }, function (payload) {
        var r = payload.new;
        if (state.seenReplies.has(r.id)) return;
        if (!state.seenPosts.has(r.post_id)) return; // reply to a post not loaded
        state.seenReplies.add(r.id);
        (state.repliesByPost[r.post_id] = state.repliesByPost[r.post_id] || []).push(r);
        render();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'community_posts' }, function (payload) {
        var u = payload.new, post = state.posts.find(function (p) { return p.id === u.id; });
        if (!post) return;
        post.is_pinned = u.is_pinned; post.likes_count = u.likes_count; post.content = u.content;
        render();
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'community_posts' }, function (payload) {
        var id = payload.old.id;
        state.posts = state.posts.filter(function (p) { return p.id !== id; });
        render();
      })
      .subscribe();
  }

  // ---- Boot ---------------------------------------------------------------
  function boot() {
    mount = document.getElementById(MOUNT_ID);
    if (!mount) return;
    injectStyles();
    mount.innerHTML = skeleton();

    if (!sb) {
      console.warn('[community] Supabase client not available.');
      mount.innerHTML = boardShell(
        '<div class="slab-cw-login"><span>💬 Community is warming up…</span><a href="login.html">Login →</a></div>' +
        '<div class="slab-cw-empty">Couldn\'t connect right now. Please refresh in a moment.</div>');
      return;
    }

    resolveAuth()
      .then(loadPage)
      .then(function () { render(); subscribe(); })
      .catch(function (err) {
        console.warn('[community] load failed:', err && err.message);
        mount.innerHTML = boardShell(composeHtml() +
          '<div class="slab-cw-empty">No announcements yet — check back soon! 💬</div>');
        wire();
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
