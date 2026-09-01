/**
 * eboshii instant-nav: Seamless zero-flicker client-side navigation
 * Keeps the WebGL background canvas permanently alive and uninterrupted across page transitions.
 * Features gentle, low-overhead background prefetching (idle queue + hover preload + in-memory cache).
 */
(function () {
  if (!window.history || !window.fetch || !window.DOMParser) return;

  // In-memory page cache and in-flight fetch registry
  const pageCache = new Map();
  const inFlightFetches = new Map();

  // Check if link is an internal same-origin page eligible for SPA routing
  function isEligibleLink(link) {
    if (!link) return false;
    const href = link.getAttribute('href');
    if (!href) return false;

    if (
      link.target === '_blank' ||
      href.startsWith('#') ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:') ||
      href.toLowerCase().includes('predichess') ||
      href.toLowerCase().includes('paperclips') ||
      href.includes('itch.io')
    ) {
      return false;
    }

    try {
      const targetUrl = new URL(link.href, window.location.href);
      return targetUrl.origin === window.location.origin;
    } catch (e) {
      return false;
    }
  }

  // Respect user data-saver settings and slow connections
  function canBackgroundPrefetch() {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn) {
      if (conn.saveData) return false;
      if (['slow-2g', '2g'].includes(conn.effectiveType)) return false;
    }
    return true;
  }

  // Fetch and parse page content with deduplication and in-memory caching
  async function fetchPage(targetUrl, isHighPriority = false) {
    const key = targetUrl.pathname.replace(/\/+$/, '') || '/';

    if (pageCache.has(key)) {
      return pageCache.get(key);
    }

    if (inFlightFetches.has(key)) {
      return inFlightFetches.get(key);
    }

    const fetchPromise = (async () => {
      try {
        const fetchOpts = isHighPriority ? {} : { priority: 'low' };
        const res = await fetch(targetUrl.href, fetchOpts);
        if (!res.ok) return null;

        const html = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const data = { html, doc };
        pageCache.set(key, data);
        return data;
      } catch (e) {
        return null;
      } finally {
        inFlightFetches.delete(key);
      }
    })();

    inFlightFetches.set(key, fetchPromise);
    return fetchPromise;
  }

  // Preload a single link gently
  function prefetchLink(link) {
    if (!isEligibleLink(link)) return;
    const targetUrl = new URL(link.href, window.location.href);
    const key = targetUrl.pathname.replace(/\/+$/, '') || '/';
    const currentKey = window.location.pathname.replace(/\/+$/, '') || '/';
    if (key === currentKey) return;

    fetchPage(targetUrl, false);
  }

  // Gentle idle-queue to prefetch primary nav tabs without starving the CPU or main thread
  function queueIdlePrefetches() {
    if (!canBackgroundPrefetch()) return;

    const navLinks = Array.from(document.querySelectorAll('.nav-links a, .site-title, .footer-stats-link'))
      .filter(isEligibleLink);

    const idleCallback = window.requestIdleCallback || (cb => setTimeout(cb, 500));

    let index = 0;
    function processNext() {
      if (index >= navLinks.length) return;
      const link = navLinks[index++];
      const targetUrl = new URL(link.href, window.location.href);
      const key = targetUrl.pathname.replace(/\/+$/, '') || '/';
      const currentKey = window.location.pathname.replace(/\/+$/, '') || '/';

      if (key !== currentKey && !pageCache.has(key)) {
        fetchPage(targetUrl, false).then(() => {
          // Stagger each prefetch by 400ms during browser idle periods
          setTimeout(() => {
            idleCallback(processNext);
          }, 400);
        });
      } else {
        idleCallback(processNext);
      }
    }

    // Allow the initial page rendering & WebGL background to stabilize first (1.5s delay)
    setTimeout(() => {
      idleCallback(processNext);
    }, 1500);
  }

  // Execute embedded scripts in swapped content
  function runScripts(container) {
    const scripts = container.querySelectorAll('script');
    scripts.forEach(oldScript => {
      const newScript = document.createElement('script');
      Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
      newScript.textContent = oldScript.textContent;
      oldScript.parentNode.replaceChild(newScript, oldScript);
    });
  }

  // Update active state in navigation
  function updateNav(url) {
    document.querySelectorAll('.nav-links a').forEach(link => {
      const href = link.getAttribute('href');
      if (!href) return;
      
      const cleanHref = href.replace(/\/+$/, '');
      const cleanPath = url.pathname.replace(/\/+$/, '');
      
      if (cleanHref === cleanPath || (cleanHref && cleanPath.startsWith(cleanHref) && cleanHref !== '')) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    document.querySelectorAll('.footer-stats-link').forEach(footerLink => {
      const href = footerLink.getAttribute('href');
      if (href && url.pathname.includes(href.replace(/\/+$/, ''))) {
        footerLink.classList.add('active');
      } else {
        footerLink.classList.remove('active');
      }
    });
  }

  async function navigate(url, pushState = true) {
    try {
      const currentMain = document.querySelector('main');

      // 1. Cosmic Dither Dissolve Out (85ms)
      if (currentMain) {
        currentMain.classList.remove('dither-enter');
        currentMain.classList.add('dither-exit');
      }

      // Fetch or retrieve from cache in parallel with the 85ms dither animation
      const [pageData] = await Promise.all([
        fetchPage(url, true),
        currentMain ? new Promise(r => setTimeout(r, 85)) : Promise.resolve()
      ]);

      if (!pageData || !pageData.doc) {
        window.location.href = url.href;
        return;
      }

      const doc = pageData.doc;
      const newMain = doc.querySelector('main');
      if (!newMain || !currentMain) {
        window.location.href = url.href;
        return;
      }

      // Update page title
      document.title = doc.title;

      // Update main class if wide layout changed
      currentMain.className = newMain.className;

      // Swap main content without touching the WebGL canvas
      currentMain.innerHTML = newMain.innerHTML;

      // Toggle permanent Ko-fi host visibility without moving/reloading iframe
      const kofiHost = document.getElementById('global-kofi-host');
      if (kofiHost) {
        const isTip = url.pathname.includes('/tip');
        kofiHost.classList.toggle('active', isTip);
      }

      // Update nav highlights
      updateNav(url);

      if (pushState) {
        window.history.pushState({}, '', url.href);
      }

      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'instant' });

      // Run any page-specific scripts (news search, stats expandable table, etc.)
      runScripts(currentMain);

      // Trigger tracking on new route
      if (window.EboshiiTracker) {
        const key = window.EboshiiTracker.getRouteKey(url.pathname);
        if (key) {
          window.EboshiiTracker.recordHit(key);
        }
      }

      // 2. Cosmic Dither Crystallize In (130ms)
      currentMain.classList.remove('dither-exit');
      currentMain.classList.add('dither-enter');
      setTimeout(() => {
        currentMain.classList.remove('dither-enter');
      }, 130);

    } catch (e) {
      window.location.href = url.href;
    }
  }

  // Hover & touch prefetching: triggers instant fetch right before click
  document.addEventListener('mouseover', e => {
    const link = e.target.closest('a');
    if (link) prefetchLink(link);
  }, { passive: true });

  document.addEventListener('touchstart', e => {
    const link = e.target.closest('a');
    if (link) prefetchLink(link);
  }, { passive: true });

  // Intercept internal link clicks
  document.addEventListener('click', e => {
    const link = e.target.closest('a');
    if (!link || !isEligibleLink(link)) return;

    const targetUrl = new URL(link.href, window.location.href);

    if (targetUrl.pathname === window.location.pathname && targetUrl.search === window.location.search) {
      return;
    }

    e.preventDefault();
    navigate(targetUrl, true);
  });

  // Handle browser back/forward buttons
  window.addEventListener('popstate', () => {
    navigate(new URL(window.location.href), false);
  });

  // Initialize gentle idle prefetching after initial load
  if (document.readyState === 'complete') {
    queueIdlePrefetches();
  } else {
    window.addEventListener('load', queueIdlePrefetches);
  }
})();
