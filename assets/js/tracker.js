/**
 * eboshii site traffic & pageview tracker
 * Tracks 24-hour rolling window views and all-time total views.
 */
(function () {
  const HITS_24H_KEY = 'eboshii_24h_hits_v1';
  const TOTAL_HITS_KEY = 'eboshii_total_hits_v1';

  function getRouteKey(pathname) {
    if (!pathname || pathname === '/' || pathname === '/index.html' || pathname === '/eboshii.github.io/' || pathname === '/eboshii.github.io/index.html') {
      return 'page_home';
    }
    
    const clean = pathname.replace(/^\/eboshii\.github\.io/, '').replace(/^\/+|\/+$/g, '');
    
    if (clean === 'blog') return 'page_blog';
    if (clean === 'pre-ipo') return 'page_pre_ipo';
    if (clean === 'news') return 'page_news';
    if (clean === 'stats') return 'page_stats';
    if (clean === 'artificial-life') return 'cat_artificial_life';
    if (clean === 'quant') return 'cat_quant';
    if (clean === 'travel') return 'cat_travel';
    
    const postSlug = clean.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    return 'post_' + postSlug;
  }

  function recordHit(key) {
    if (!key) return;
    const now = Date.now();
    const sessionHitKey = 'hit_recorded_' + key;

    try {
      // 1. Record 24-hour rolling hit
      const raw24h = localStorage.getItem(HITS_24H_KEY);
      const hits24h = raw24h ? JSON.parse(raw24h) : {};
      const cutoff = now - 86400000;
      
      const currentList = (hits24h[key] || []).filter(ts => ts > cutoff);
      
      // Deduplicate rapid refresh spam within 1 session
      if (!sessionStorage.getItem(sessionHitKey)) {
        currentList.push(now);
      }
      hits24h[key] = currentList;
      localStorage.setItem(HITS_24H_KEY, JSON.stringify(hits24h));

      // 2. Record all-time total hit
      if (!sessionStorage.getItem(sessionHitKey)) {
        sessionStorage.setItem(sessionHitKey, 'true');
        const rawTotals = localStorage.getItem(TOTAL_HITS_KEY);
        const totals = rawTotals ? JSON.parse(rawTotals) : {};
        totals[key] = (totals[key] || 0) + 1;
        localStorage.setItem(TOTAL_HITS_KEY, JSON.stringify(totals));
      }
    } catch (e) {
      console.warn('Storage tracking error:', e);
    }
  }

  // Global tracker helper
  window.EboshiiTracker = {
    getRouteKey: getRouteKey,
    recordHit: recordHit,

    get24hCount: function (key) {
      try {
        const raw24h = localStorage.getItem(HITS_24H_KEY);
        if (!raw24h) return 0;
        const hits24h = JSON.parse(raw24h);
        const cutoff = Date.now() - 86400000;
        const valid = (hits24h[key] || []).filter(ts => ts > cutoff);
        return valid.length;
      } catch (e) {
        return 0;
      }
    },

    getTotalCount: function (key) {
      try {
        const rawTotals = localStorage.getItem(TOTAL_HITS_KEY);
        if (!rawTotals) return this.get24hCount(key);
        const totals = JSON.parse(rawTotals);
        return totals[key] || this.get24hCount(key);
      } catch (e) {
        return 0;
      }
    }
  };

  // Record current page visit
  const currentKey = getRouteKey(window.location.pathname);
  if (currentKey) {
    recordHit(currentKey);
  }

  // Record outbound game clicks
  function setupGameTracking() {
    document.querySelectorAll('a[href*="predichess"], a[href*="Paperclips"], a[href*="paperclips"], a[href*="emergence"]').forEach(link => {
      if (link.dataset.tracked) return;
      link.dataset.tracked = 'true';
      link.addEventListener('click', () => {
        const href = (link.getAttribute('href') || '').toLowerCase();
        if (href.includes('paperclips')) {
          recordHit('game_paperclips');
        } else if (href.includes('predichess')) {
          recordHit('game_predichess');
        } else if (href.includes('emergence')) {
          recordHit('game_emergence');
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupGameTracking);
  } else {
    setupGameTracking();
  }
})();
