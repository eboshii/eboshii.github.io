/**
 * eboshii instant-nav: Seamless zero-flicker client-side navigation
 * Keeps the WebGL background canvas permanently alive and uninterrupted across page transitions.
 */
(function () {
  if (!window.history || !window.fetch || !window.DOMParser) return;

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
      const res = await fetch(url.href);
      if (!res.ok) {
        window.location.href = url.href;
        return;
      }

      const html = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const newMain = doc.querySelector('main');
      const currentMain = document.querySelector('main');

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
    } catch (e) {
      window.location.href = url.href;
    }
  }

  // Intercept internal link clicks
  document.addEventListener('click', e => {
    const link = e.target.closest('a');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href) return;

    // Ignore external links, anchors, mailto, etc.
    if (
      link.target === '_blank' ||
      href.startsWith('#') ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:') ||
      href.includes('predichess') ||
      href.includes('itch.io')
    ) {
      return;
    }

    const targetUrl = new URL(link.href, window.location.href);

    // Only intercept same-origin internal navigations
    if (targetUrl.origin !== window.location.origin) {
      return;
    }

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
})();
