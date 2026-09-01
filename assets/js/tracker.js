/**
 * eboshii site traffic & pageview tracker
 * Tracks 24-hour rolling views and all-time total views
 */
(function () {
  const NAMESPACE = 'eboshii_site_analytics_v2';
  const API_BASE = 'https://api.counterapi.dev/v1/' + NAMESPACE;
  const HITS_24H_STORAGE_KEY = 'eboshii_24h_hits';
  const TOTAL_STORAGE_KEY = 'eboshii_total_counts';

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

  // Record a view hit (both 24h rolling and total)
  async function recordHit(key) {
    const now = Date.now();
    const sessionKey = 'viewed_' + key;

    // Record in local 24h rolling log
    try {
      const hits24h = JSON.parse(localStorage.getItem(HITS_24H_STORAGE_KEY) || '{}');
      const cutoff = now - 86400000; // 24 hours ago
      
      // Clean up expired hits and add new hit
      const currentList = (hits24h[key] || []).filter(ts => ts > cutoff);
      if (!sessionStorage.getItem(sessionKey)) {
        currentList.push(now);
      }
      hits24h[key] = currentList;
      localStorage.setItem(HITS_24H_STORAGE_KEY, JSON.stringify(hits24h));
    } catch (e) {}

    // Deduplicate total hit in this session
    if (sessionStorage.getItem(sessionKey)) {
      return;
    }
    sessionStorage.setItem(sessionKey, 'true');

    // Update local total counts
    try {
      const totals = JSON.parse(localStorage.getItem(TOTAL_STORAGE_KEY) || '{}');
      totals[key] = (totals[key] || 0) + 1;
      localStorage.setItem(TOTAL_STORAGE_KEY, JSON.stringify(totals));
    } catch (e) {}

    // Remote CounterAPI increment
    try {
      fetch(`${API_BASE}/${encodeURIComponent(key)}/up`, { method: 'GET', mode: 'cors' })
        .then(res => res.json())
        .then(data => {
          if (data && typeof data.count === 'number') {
            try {
              const totals = JSON.parse(localStorage.getItem(TOTAL_STORAGE_KEY) || '{}');
              totals[key] = data.count;
              localStorage.setItem(TOTAL_STORAGE_KEY, JSON.stringify(totals));
            } catch (e) {}
          }
        })
        .catch(() => {});
    } catch (e) {}
  }

  // Track current page
  const currentKey = getRouteKey(window.location.pathname);
  if (currentKey) {
    recordHit(currentKey);
  }

  // Track game link clicks
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('a[href*="predichess"], a[href*="emergence"]').forEach(link => {
      link.addEventListener('click', () => {
        const href = link.getAttribute('href');
        if (href.includes('predichess')) {
          recordHit('game_predichess');
        } else if (href.includes('emergence')) {
          recordHit('game_emergence');
        }
      });
    });
  });

  // Global helper for stats page queries
  window.EboshiiTracker = {
    getRouteKey: getRouteKey,
    API_BASE: API_BASE,

    get24hCount: function (key) {
      try {
        const hits24h = JSON.parse(localStorage.getItem(HITS_24H_STORAGE_KEY) || '{}');
        const cutoff = Date.now() - 86400000;
        const validHits = (hits24h[key] || []).filter(ts => ts > cutoff);
        return validHits.length;
      } catch (e) {
        return 0;
      }
    },

    getTotalCount: async function (key) {
      try {
        const res = await fetch(`${API_BASE}/${encodeURIComponent(key)}`, { mode: 'cors' });
        if (!res.ok) throw new Error('API failed');
        const data = await res.json();
        if (data && typeof data.count === 'number') {
          return data.count;
        }
      } catch (e) {}

      try {
        const totals = JSON.parse(localStorage.getItem(TOTAL_STORAGE_KEY) || '{}');
        return totals[key] || 0;
      } catch (err) {
        return 0;
      }
    }
  };
})();
