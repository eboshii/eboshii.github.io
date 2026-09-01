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

  const BAYER_4X4_PAT = [
    [ 0/16,  8/16,  2/16, 10/16],
    [12/16,  4/16, 14/16,  6/16],
    [ 3/16, 11/16,  1/16,  9/16],
    [15/16,  7/16, 13/16,  5/16]
  ];

  function triggerScreenDitherTransition(swapCallback) {
    const fxCanvas = document.getElementById('screen-dither-fx');
    if (!fxCanvas) {
      swapCallback();
      return;
    }

    const ctx = fxCanvas.getContext('2d', { alpha: true });
    if (!ctx) {
      swapCallback();
      return;
    }

    const w = window.innerWidth;
    const h = window.innerHeight;
    fxCanvas.width = w;
    fxCanvas.height = h;
    fxCanvas.classList.add('active');

    const DURATION = 250; // Snappy 250ms full-screen pixelation crunch & resolve
    const HALFWAY = 100;  // Swap content at peak pixelation (100ms)
    let hasSwapped = false;
    const startTime = performance.now();

    function frame(now) {
      const elapsed = now - startTime;
      const progress = Math.min(1.0, elapsed / DURATION);

      // Intensity curve: rises to 1.0 at 100ms, decays to 0.0 by 250ms
      let intensity;
      if (elapsed < HALFWAY) {
        intensity = elapsed / HALFWAY;
      } else {
        intensity = Math.max(0.0, 1.0 - (elapsed - HALFWAY) / (DURATION - HALFWAY));
      }

      // Drive dynamic WebGL shader pixelation & quantization
      if (window.setNebulaTransition) {
        window.setNebulaTransition(intensity);
      }

      // Execute content swap at peak crunch
      if (!hasSwapped && elapsed >= HALFWAY) {
        hasSwapped = true;
        swapCallback();
      }

      // Draw full-screen retro dither blocks
      ctx.clearRect(0, 0, w, h);

      if (intensity > 0.03) {
        // Chunky pixel scale: 6px normal -> up to 24px retro blocks
        const blockSize = Math.round(5 + intensity * 19);
        const cols = Math.ceil(w / blockSize);
        const rows = Math.ceil(h / blockSize);

        for (let gy = 0; gy < rows; gy++) {
          for (let gx = 0; gx < cols; gx++) {
            const threshold = BAYER_4X4_PAT[gy % 4][gx % 4];
            if (intensity > threshold * 0.82) {
              const alpha = Math.min(0.95, intensity * 1.12);
              const pRnd = ((gx * 37 + gy * 73) % 100) / 100;
              if (pRnd < 0.65) {
                ctx.fillStyle = `rgba(5, 3, 10, ${alpha})`;
              } else if (pRnd < 0.82) {
                ctx.fillStyle = `rgba(14, 63, 82, ${alpha})`;
              } else if (pRnd < 0.94) {
                ctx.fillStyle = `rgba(81, 22, 59, ${alpha})`;
              } else {
                ctx.fillStyle = `rgba(174, 93, 29, ${alpha})`;
              }
              ctx.fillRect(gx * blockSize, gy * blockSize, blockSize, blockSize);
            }
          }
        }
      }

      if (progress < 1.0) {
        requestAnimationFrame(frame);
      } else {
        if (window.setNebulaTransition) {
          window.setNebulaTransition(0.0);
        }
        ctx.clearRect(0, 0, w, h);
        fxCanvas.classList.remove('active');
      }
    }

    requestAnimationFrame(frame);
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

      triggerScreenDitherTransition(() => {
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
      });
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
