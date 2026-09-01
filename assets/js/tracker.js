/**
 * eboshii site traffic & pageview tracker
 * Lightweight, privacy-respecting serverless analytics via CounterAPI & local storage caching
 */
(function () {
  const NAMESPACE = 'eboshii_site_analytics_v1';
  const API_BASE = 'https://api.counterapi.dev/v1/' + NAMESPACE;

  // Map route to clean identifier key
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
    
    // Post slug: convert slashes to underscores and alphanumeric only
    const postSlug = clean.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    return 'post_' + postSlug;
  }

  // Increment view count for a specific key
  async function incrementKey(key) {
    // Prevent duplicate counting within the same browser session
    const sessionKey = 'viewed_' + key;
    if (sessionStorage.getItem(sessionKey)) {
      return;
    }
    sessionStorage.setItem(sessionKey, 'true');

    // Local increment immediately for offline/instant feedback
    try {
      const localCounts = JSON.parse(localStorage.getItem('eboshii_view_counts') || '{}');
      localCounts[key] = (localCounts[key] || 0) + 1;
      localCounts['total_site_views'] = (localCounts['total_site_views'] || 0) + 1;
      localStorage.setItem('eboshii_view_counts', JSON.stringify(localCounts));
    } catch (e) {}

    // Remote API hit (non-blocking)
    try {
      fetch(`${API_BASE}/${encodeURIComponent(key)}/up`, { method: 'GET', mode: 'cors' })
        .then(res => res.json())
        .then(data => {
          if (data && typeof data.count === 'number') {
            try {
              const localCounts = JSON.parse(localStorage.getItem('eboshii_view_counts') || '{}');
              localCounts[key] = data.count;
              localStorage.setItem('eboshii_view_counts', JSON.stringify(localCounts));
            } catch (e) {}
          }
        })
        .catch(() => {});

      // Increment site-wide total counter
      fetch(`${API_BASE}/total_site_views/up`, { method: 'GET', mode: 'cors' }).catch(() => {});
    } catch (e) {}
  }

  // Record current page visit
  const currentKey = getRouteKey(window.location.pathname);
  if (currentKey) {
    incrementKey(currentKey);
  }

  // Track clicks on external game links
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('a[href*="predichess"], a[href*="emergence"]').forEach(link => {
      link.addEventListener('click', () => {
        const href = link.getAttribute('href');
        if (href.includes('predichess')) {
          incrementKey('game_predichess');
        } else if (href.includes('emergence')) {
          incrementKey('game_emergence');
        }
      });
    });
  });

  // Global helper for stats page
  window.EboshiiTracker = {
    getRouteKey: getRouteKey,
    API_BASE: API_BASE,
    fetchCount: async function (key) {
      try {
        const res = await fetch(`${API_BASE}/${encodeURIComponent(key)}`, { mode: 'cors' });
        if (!res.ok) throw new Error('API request failed');
        const data = await res.json();
        return data && typeof data.count === 'number' ? data.count : 0;
      } catch (e) {
        // Fallback to local storage
        try {
          const localCounts = JSON.parse(localStorage.getItem('eboshii_view_counts') || '{}');
          return localCounts[key] || 0;
        } catch (err) {
          return 0;
        }
      }
    }
  };
})();
