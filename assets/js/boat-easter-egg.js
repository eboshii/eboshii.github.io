/**
 * eboshii space sailboat easter egg
 * Controlled via WASD or Arrow keys on the homepage.
 * Features 8-direction isometric sailboat rendering, smooth sailing momentum,
 * screen wrapping, and dynamic cosmic wake ripples.
 */
(function () {
  // Only active on the homepage
  function isHomePage() {
    const p = window.location.pathname.replace(/^\/eboshii\.github\.io/, '').replace(/\/+$/, '');
    return p === '' || p === '/index.html';
  }

  let boatCanvas, ctx;
  let isInitialized = false;
  let isRevealed = false;
  let riseProgress = 0.0; // 0.0 (submerged) to 1.0 (fully surfaced)

  // Boat state
  const boat = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    speed: 0,
    targetAngle: -Math.PI / 4, // start facing NE
    currentAngle: -Math.PI / 4,
    isoDir: 1, // 0: N, 1: NE, 2: E, 3: SE, 4: S, 5: SW, 6: W, 7: NW
    sailBillow: 0,
    bobOffset: 0,
    rollAngle: 0,
    lastRippleTime: 0,
    foamParticles: []
  };

  // Key tracking
  const keys = {
    w: false,
    a: false,
    s: false,
    d: false,
    up: false,
    left: false,
    down: false,
    right: false
  };

  function initBoat() {
    if (isInitialized || !isHomePage()) return;
    isInitialized = true;

    boatCanvas = document.createElement('canvas');
    boatCanvas.id = 'boat-easter-egg-canvas';
    boatCanvas.style.position = 'fixed';
    boatCanvas.style.top = '0';
    boatCanvas.style.left = '0';
    boatCanvas.style.width = '100%';
    boatCanvas.style.height = '100%';
    boatCanvas.style.pointerEvents = 'none';
    boatCanvas.style.zIndex = '1'; // Above nebula canvas (-1), below page content
    boatCanvas.style.opacity = '0';
    boatCanvas.style.transition = 'opacity 0.6s ease';
    document.body.appendChild(boatCanvas);

    ctx = boatCanvas.getContext('2d');

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      boatCanvas.width = Math.floor(window.innerWidth * dpr);
      boatCanvas.height = Math.floor(window.innerHeight * dpr);
    }
    window.addEventListener('resize', resize);
    resize();

    // Default spawn coordinates (lower-right quarter of screen)
    boat.x = window.innerWidth * 0.72;
    boat.y = window.innerHeight * 0.68;

    requestAnimationFrame(gameLoop);
  }

  // Key listeners
  window.addEventListener('keydown', e => {
    if (!isHomePage()) return;
    const k = e.key.toLowerCase();

    let handled = false;
    if (k === 'w' || e.key === 'ArrowUp') { keys.w = true; keys.up = true; handled = true; }
    if (k === 's' || e.key === 'ArrowDown') { keys.s = true; keys.down = true; handled = true; }
    if (k === 'a' || e.key === 'ArrowLeft') { keys.a = true; keys.left = true; handled = true; }
    if (k === 'd' || e.key === 'ArrowRight') { keys.d = true; keys.right = true; handled = true; }

    if (handled) {
      if (!isRevealed) {
        isRevealed = true;
        initBoat();
        if (boatCanvas) boatCanvas.style.opacity = '1';
      }
      // Prevent page scrolling on arrow keys when steering the sailboat
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
      }
    }
  });

  window.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (k === 'w' || e.key === 'ArrowUp') { keys.w = false; keys.up = false; }
    if (k === 's' || e.key === 'ArrowDown') { keys.s = false; keys.down = false; }
    if (k === 'a' || e.key === 'ArrowLeft') { keys.a = false; keys.left = false; }
    if (k === 'd' || e.key === 'ArrowRight') { keys.d = false; keys.right = false; }
  });

  // Calculate 8-direction isometric index (0: N, 1: NE, 2: E, 3: SE, 4: S, 5: SW, 6: W, 7: NW)
  function getIsoDirection(angle) {
    // Normalize angle to [0, 2pi)
    let a = (angle % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    // Sector size is pi / 4
    const sector = Math.PI / 4;
    // Offset by half sector for rounding
    const idx = Math.floor((a + sector / 2) / sector) % 8;
    // Maps standard trig angle (0=E, pi/2=S, pi=W, 3pi/2=N) to our 8 directions:
    // 0: N, 1: NE, 2: E, 3: SE, 4: S, 5: SW, 6: W, 7: NW
    const mapping = [2, 3, 4, 5, 6, 7, 0, 1];
    return mapping[idx];
  }

  // Draw 8-Direction Isometric Sailboat Sprite
  function drawSailboat(ctx, x, y, scale, isoDir, billow, rise, time) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    // Wave bobbing & buoyancy rocking
    const bob = Math.sin(time * 3.2) * 1.8;
    const rock = Math.sin(time * 2.1) * 0.045;
    ctx.translate(0, bob);
    ctx.rotate(rock);

    // Elevation rise progress (emerging from the cosmic depths)
    const riseY = (1.0 - rise) * 25;
    ctx.translate(0, riseY);

    // Color Palette
    const woodDark  = '#26140b';
    const woodMid   = '#593217';
    const woodLight = '#9e5d2d';
    const woodDeck  = '#c98a53';
    const mastColor = '#e0a96d';
    const sailLit   = '#fffaf0';
    const sailMid   = '#e3d5be';
    const sailShade = '#a89478';
    const foamColor = 'rgba(127, 212, 138, 0.75)';

    // Directions: 0:N, 1:NE, 2:E, 3:SE, 4:S, 5:SW, 6:W, 7:NW
    // We flip horizontally for West-facing directions (5, 6, 7)
    let flipX = 1;
    let dirKey = isoDir;
    if (isoDir === 5) { dirKey = 3; flipX = -1; }
    else if (isoDir === 6) { dirKey = 2; flipX = -1; }
    else if (isoDir === 7) { dirKey = 1; flipX = -1; }

    ctx.scale(flipX, 1);

    // --- Submerged Hull Mask & Cosmic Waterline ---
    // Draw Hull Base
    ctx.fillStyle = woodMid;
    ctx.strokeStyle = woodDark;
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    if (dirKey === 1) {
      // Isometric NE (quarter view from stern-left)
      ctx.moveTo(-18, 6);
      ctx.lineTo(20, -10);
      ctx.lineTo(24, -8);
      ctx.lineTo(-12, 12);
      ctx.closePath();
    } else if (dirKey === 2) {
      // Isometric E (side profile)
      ctx.moveTo(-22, 5);
      ctx.lineTo(24, 5);
      ctx.lineTo(20, 12);
      ctx.lineTo(-18, 12);
      ctx.closePath();
    } else if (dirKey === 3) {
      // Isometric SE (front-quarter view towards viewer)
      ctx.moveTo(-20, -6);
      ctx.lineTo(18, 10);
      ctx.lineTo(12, 14);
      ctx.lineTo(-24, -2);
      ctx.closePath();
    } else if (dirKey === 4) {
      // Isometric S (bow facing directly towards viewer)
      ctx.moveTo(0, 16);
      ctx.lineTo(-12, -2);
      ctx.lineTo(-8, -6);
      ctx.lineTo(0, -4);
      ctx.lineTo(8, -6);
      ctx.lineTo(12, -2);
      ctx.closePath();
    } else {
      // Isometric N (stern facing directly away)
      ctx.moveTo(0, -14);
      ctx.lineTo(-12, 4);
      ctx.lineTo(-8, 8);
      ctx.lineTo(0, 6);
      ctx.lineTo(8, 8);
      ctx.lineTo(12, 4);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();

    // Deck planking highlight
    ctx.fillStyle = woodDeck;
    ctx.beginPath();
    if (dirKey === 1) {
      ctx.moveTo(-16, 5);
      ctx.lineTo(18, -9);
      ctx.lineTo(16, -7);
      ctx.lineTo(-14, 7);
    } else if (dirKey === 2) {
      ctx.moveTo(-20, 5);
      ctx.lineTo(22, 5);
      ctx.lineTo(18, 8);
      ctx.lineTo(-16, 8);
    } else if (dirKey === 3) {
      ctx.moveTo(-18, -5);
      ctx.lineTo(16, 9);
      ctx.lineTo(11, 11);
      ctx.lineTo(-21, -3);
    } else if (dirKey === 4) {
      ctx.moveTo(0, 14);
      ctx.lineTo(-10, 0);
      ctx.lineTo(0, -2);
      ctx.lineTo(10, 0);
    } else {
      ctx.moveTo(0, -12);
      ctx.lineTo(-10, 3);
      ctx.lineTo(0, 5);
      ctx.lineTo(10, 3);
    }
    ctx.closePath();
    ctx.fill();

    // --- Mast ---
    ctx.strokeStyle = mastColor;
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(0, 3);
    ctx.lineTo(0, -32);
    ctx.stroke();

    // --- Two-Part Sails (Mainsail & Jib) with Billow ---
    const b = Math.sin(time * 4.0 + billow) * 2.0;

    // 1. Mainsail (Large triangular sail)
    ctx.fillStyle = sailLit;
    ctx.strokeStyle = sailShade;
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(0, -30);
    if (dirKey === 1 || dirKey === 2 || dirKey === 3) {
      ctx.quadraticCurveTo(-14 + b, -14, -18 + b * 0.8, -2);
      ctx.lineTo(0, 2);
    } else if (dirKey === 4) {
      ctx.quadraticCurveTo(-15 + b, -15, -16 + b, 0);
      ctx.lineTo(0, 2);
    } else {
      ctx.quadraticCurveTo(14 + b, -15, 16 + b, 0);
      ctx.lineTo(0, 2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Mainsail shadow / inner fold
    ctx.fillStyle = sailMid;
    ctx.beginPath();
    ctx.moveTo(0, -28);
    if (dirKey === 1 || dirKey === 2 || dirKey === 3) {
      ctx.quadraticCurveTo(-8 + b * 0.5, -14, -12 + b * 0.5, 0);
      ctx.lineTo(0, 1);
    } else {
      ctx.quadraticCurveTo(8 + b * 0.5, -14, 10 + b * 0.5, 0);
      ctx.lineTo(0, 1);
    }
    ctx.closePath();
    ctx.fill();

    // 2. Jib / Foresail (Front triangular sail)
    ctx.fillStyle = sailLit;
    ctx.beginPath();
    ctx.moveTo(0, -24);
    if (dirKey === 1) {
      ctx.quadraticCurveTo(12 + b * 0.6, -12, 16, -8);
      ctx.lineTo(2, 0);
    } else if (dirKey === 2) {
      ctx.quadraticCurveTo(14 + b * 0.6, -10, 18, 4);
      ctx.lineTo(2, 2);
    } else if (dirKey === 3) {
      ctx.quadraticCurveTo(10 + b * 0.6, 0, 14, 8);
      ctx.lineTo(2, 2);
    } else if (dirKey === 4) {
      ctx.quadraticCurveTo(8 + b * 0.6, 2, 6, 12);
      ctx.lineTo(0, 2);
    } else {
      ctx.quadraticCurveTo(-8 + b * 0.6, -8, -6, -10);
      ctx.lineTo(0, 2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // --- Luminous Waterline Foam & Cosmic Wave Wake ---
    ctx.fillStyle = foamColor;
    ctx.beginPath();
    ctx.arc(-14, 8, 2.5, 0, Math.PI * 2);
    ctx.arc(14, 8, 2.0, 0, Math.PI * 2);
    ctx.arc(0, 11, 2.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Foam Particle Trailing System
  function addFoam(x, y, vx, vy) {
    boat.foamParticles.push({
      x: x + (Math.random() - 0.5) * 8,
      y: y + (Math.random() - 0.5) * 6 + 6,
      vx: -vx * 0.25 + (Math.random() - 0.5) * 0.6,
      vy: -vy * 0.25 + (Math.random() - 0.5) * 0.6,
      size: 2.0 + Math.random() * 2.5,
      life: 1.0,
      decay: 0.02 + Math.random() * 0.015
    });
    if (boat.foamParticles.length > 50) {
      boat.foamParticles.shift();
    }
  }

  let lastTime = performance.now();

  function gameLoop(now) {
    const dt = Math.min((now - lastTime) * 0.001, 0.05);
    lastTime = now;
    const timeSec = now * 0.001;

    if (isRevealed && isHomePage() && ctx && boatCanvas) {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      ctx.clearRect(0, 0, boatCanvas.width, boatCanvas.height);
      ctx.save();
      ctx.scale(dpr, dpr);

      // Rise progress
      if (riseProgress < 1.0) {
        riseProgress = Math.min(1.0, riseProgress + dt * 1.2);
      }

      // Movement input
      let moveX = 0;
      let moveY = 0;
      if (keys.w || keys.up) moveY -= 1;
      if (keys.s || keys.down) moveY += 1;
      if (keys.a || keys.left) moveX -= 1;
      if (keys.d || keys.right) moveX += 1;

      const isMoving = (moveX !== 0 || moveY !== 0);

      // Acceleration and Steering Physics
      const accel = 8.0;
      const maxSpeed = 3.4;
      const drag = 0.94;

      if (isMoving) {
        const targetAngle = Math.atan2(moveY, moveX);
        boat.targetAngle = targetAngle;

        // Smooth shortest angular interpolation
        let diff = boat.targetAngle - boat.currentAngle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        boat.currentAngle += diff * Math.min(1.0, dt * 7.0);

        // Apply thrust in heading direction
        boat.vx += Math.cos(boat.currentAngle) * accel * dt;
        boat.vy += Math.sin(boat.currentAngle) * accel * dt;
      }

      // Apply drag
      boat.vx *= Math.pow(drag, dt * 60);
      boat.vy *= Math.pow(drag, dt * 60);

      // Clamp speed
      boat.speed = Math.hypot(boat.vx, boat.vy);
      if (boat.speed > maxSpeed) {
        boat.vx = (boat.vx / boat.speed) * maxSpeed;
        boat.vy = (boat.vy / boat.speed) * maxSpeed;
        boat.speed = maxSpeed;
      }

      // Update position
      boat.x += boat.vx;
      boat.y += boat.vy;

      // Screen boundary wrap-around
      const margin = 35;
      if (boat.x < -margin) boat.x = window.innerWidth + margin - 5;
      else if (boat.x > window.innerWidth + margin) boat.x = -margin + 5;

      if (boat.y < -margin) boat.y = window.innerHeight + margin - 5;
      else if (boat.y > window.innerHeight + margin) boat.y = -margin + 5;

      // Determine 8-direction isometric heading
      boat.isoDir = getIsoDirection(boat.currentAngle);

      // Spawn wake foam & emit background WebGL ripples
      if (boat.speed > 0.35 && riseProgress > 0.4) {
        addFoam(boat.x, boat.y, boat.vx, boat.vy);

        if (now - boat.lastRippleTime > 120) {
          boat.lastRippleTime = now;
          if (window.addNebulaRipple) {
            const rippleStrength = Math.min(1.0, boat.speed / 2.5);
            window.addNebulaRipple(boat.x, boat.y, rippleStrength);
          }
        }
      }

      // Draw trailing foam particles
      for (let i = boat.foamParticles.length - 1; i >= 0; i--) {
        const p = boat.foamParticles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= p.decay;

        if (p.life <= 0) {
          boat.foamParticles.splice(i, 1);
          continue;
        }

        ctx.fillStyle = `rgba(127, 212, 138, ${p.life * 0.7})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw the sailboat
      drawSailboat(ctx, boat.x, boat.y, 1.35, boat.isoDir, boat.sailBillow, riseProgress, timeSec);

      ctx.restore();
    }

    requestAnimationFrame(gameLoop);
  }
})();
