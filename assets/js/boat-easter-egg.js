/**
 * eboshii space sailboat easter egg
 * Controlled via WASD or Arrow keys on the homepage.
 * Features:
 * - Ultra-tight, responsive 8-direction steering controls
 * - 3px pixelation and 4x4 Bayer ordered dithering matching the WebGL nebula background
 * - Two-part sail model with dynamic wind billow
 * - Screen boundary wrap-around
 * - Background WebGL cosmic wake ripples
 */
(function () {
  // Only active on the homepage
  function isHomePage() {
    const p = window.location.pathname.replace(/^\/eboshii\.github\.io/, '').replace(/\/+$/, '');
    return p === '' || p === '/index.html';
  }

  let boatCanvas, ctx;
  let offscreenCanvas, offCtx;
  let isInitialized = false;
  let isRevealed = false;
  let riseProgress = 0.0;

  const PIXEL_SCALE = 3.0; // Exact 3px cell size matching the WebGL shader

  // Standard 4x4 Bayer Matrix
  const BAYER_4X4 = [
    [-0.5000,  0.0000, -0.3750,  0.1250],
    [ 0.2500, -0.2500,  0.3750, -0.1250],
    [-0.3125,  0.1875, -0.4375,  0.0625],
    [ 0.4375, -0.0625,  0.3125, -0.1875]
  ];

  // Boat state
  const boat = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    speed: 0,
    targetAngle: -Math.PI / 4,
    currentAngle: -Math.PI / 4,
    isoDir: 1, // 0: N, 1: NE, 2: E, 3: SE, 4: S, 5: SW, 6: W, 7: NW
    sailBillow: 0,
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
    boatCanvas.style.zIndex = '-1';
    boatCanvas.style.opacity = '0';
    boatCanvas.style.transition = 'opacity 0.4s ease';
    document.body.appendChild(boatCanvas);

    ctx = boatCanvas.getContext('2d');

    // Low-resolution offscreen buffer for pixelation & dithering
    offscreenCanvas = document.createElement('canvas');
    offCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });

    function resize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      boatCanvas.width = w;
      boatCanvas.height = h;

      offscreenCanvas.width = Math.ceil(w / PIXEL_SCALE);
      offscreenCanvas.height = Math.ceil(h / PIXEL_SCALE);

      ctx.imageSmoothingEnabled = false;
      offCtx.imageSmoothingEnabled = false;
    }
    window.addEventListener('resize', resize);
    resize();

    // Default spawn coordinates
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
    let a = (angle % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const sector = Math.PI / 4;
    const idx = Math.floor((a + sector / 2) / sector) % 8;
    const mapping = [2, 3, 4, 5, 6, 7, 0, 1];
    return mapping[idx];
  }

  // Draw 8-Direction Isometric Sailboat Sprite onto low-res canvas
  function drawSailboatLowRes(oCtx, lx, ly, isoDir, billow, rise, time) {
    oCtx.save();
    oCtx.translate(lx, ly);

    // Wave bobbing & buoyancy rocking
    const bob = Math.sin(time * 3.6) * 0.8;
    const rock = Math.sin(time * 2.4) * 0.04;
    oCtx.translate(0, bob);
    oCtx.rotate(rock);

    // Elevation rise progress
    const riseY = (1.0 - rise) * 12;
    oCtx.translate(0, riseY);

    // Color Palette
    const woodDark  = '#26140b';
    const woodMid   = '#693816';
    const woodLight = '#a66230';
    const woodDeck  = '#d6945a';
    const mastColor = '#e0a96d';
    const sailLit   = '#fffaf0';
    const sailMid   = '#e5d7c0';
    const sailShade = '#a89478';
    const foamColor = '#7fd48a';

    let flipX = 1;
    let dirKey = isoDir;
    if (isoDir === 5) { dirKey = 3; flipX = -1; }
    else if (isoDir === 6) { dirKey = 2; flipX = -1; }
    else if (isoDir === 7) { dirKey = 1; flipX = -1; }

    oCtx.scale(flipX, 1);

    // --- Slim Curved Hydrodynamic Hull Base ---
    oCtx.fillStyle = woodMid;
    oCtx.strokeStyle = woodDark;
    oCtx.lineWidth = 0.8;

    oCtx.beginPath();
    if (dirKey === 1) {
      // NE (Slender quarter-angle bow pointing up-right)
      oCtx.moveTo(-11, 4);
      oCtx.quadraticCurveTo(1, 0, 14, -6);
      oCtx.quadraticCurveTo(15.5, -5, 13.5, -3.8);
      oCtx.quadraticCurveTo(2, 4.2, -8, 6.2);
      oCtx.quadraticCurveTo(-11.8, 5.8, -11, 4);
    } else if (dirKey === 2) {
      // E (Streamlined sleek profile heading right)
      oCtx.moveTo(-13, 2.5);
      oCtx.quadraticCurveTo(0, 2.8, 15, 2.5);
      oCtx.quadraticCurveTo(15.8, 3.5, 13.5, 4.8);
      oCtx.quadraticCurveTo(0, 6.2, -11.5, 5.0);
      oCtx.quadraticCurveTo(-13.8, 4.0, -13, 2.5);
    } else if (dirKey === 3) {
      // SE (Sleek quarter-angle bow pointing down-right)
      oCtx.moveTo(-12, -3.5);
      oCtx.quadraticCurveTo(0, 2.0, 14, 7.5);
      oCtx.quadraticCurveTo(13.8, 8.8, 11.5, 8.5);
      oCtx.quadraticCurveTo(-1, 6.5, -13, -1.0);
      oCtx.quadraticCurveTo(-13.5, -2.8, -12, -3.5);
    } else if (dirKey === 4) {
      // S (Fine-entry bow heading down toward viewer)
      oCtx.moveTo(0, 10.5);
      oCtx.quadraticCurveTo(-3.8, 4.5, -4.5, -2.0);
      oCtx.quadraticCurveTo(0, -3.8, 4.5, -2.0);
      oCtx.quadraticCurveTo(3.8, 4.5, 0, 10.5);
    } else {
      // N (Slender hull heading up away from viewer)
      oCtx.moveTo(0, -9.5);
      oCtx.quadraticCurveTo(-3.8, -3.5, -4.5, 2.5);
      oCtx.quadraticCurveTo(0, 4.0, 4.5, 2.5);
      oCtx.quadraticCurveTo(3.8, -3.5, 0, -9.5);
    }
    oCtx.closePath();
    oCtx.fill();
    oCtx.stroke();

    // --- Slim Curved Inner Deck Planking ---
    oCtx.fillStyle = woodDeck;
    oCtx.beginPath();
    if (dirKey === 1) {
      oCtx.moveTo(-9.5, 3.5);
      oCtx.quadraticCurveTo(1, 0, 12.5, -5.2);
      oCtx.quadraticCurveTo(11.0, -4.0, -6.5, 4.8);
      oCtx.quadraticCurveTo(-9.8, 4.8, -9.5, 3.5);
    } else if (dirKey === 2) {
      oCtx.moveTo(-11.5, 2.8);
      oCtx.quadraticCurveTo(0, 3.0, 13.5, 2.8);
      oCtx.quadraticCurveTo(11.5, 4.2, -9.5, 4.2);
      oCtx.quadraticCurveTo(-11.8, 3.8, -11.5, 2.8);
    } else if (dirKey === 3) {
      oCtx.moveTo(-10.5, -2.8);
      oCtx.quadraticCurveTo(0, 2.0, 12.5, 6.8);
      oCtx.quadraticCurveTo(10.0, 7.2, -11.0, 0.2);
      oCtx.quadraticCurveTo(-11.5, -1.8, -10.5, -2.8);
    } else if (dirKey === 4) {
      oCtx.moveTo(0, 9.0);
      oCtx.quadraticCurveTo(-2.8, 3.5, -3.5, -1.2);
      oCtx.quadraticCurveTo(0, -2.2, 3.5, -1.2);
      oCtx.quadraticCurveTo(2.8, 3.5, 0, 9.0);
    } else {
      oCtx.moveTo(0, -8.0);
      oCtx.quadraticCurveTo(-2.8, -2.5, -3.5, 1.8);
      oCtx.quadraticCurveTo(0, 2.8, 3.5, 1.8);
      oCtx.quadraticCurveTo(2.8, -2.5, 0, -8.0);
    }
    oCtx.closePath();
    oCtx.fill();

    // --- Mast ---
    oCtx.strokeStyle = mastColor;
    oCtx.lineWidth = 1.0;
    oCtx.beginPath();
    oCtx.moveTo(0, 1);
    oCtx.lineTo(0, -17);
    oCtx.stroke();

    // --- Two-Part Sails with dynamic billow ---
    const b = Math.sin(time * 4.5 + billow) * 1.2;

    // 1. Mainsail
    oCtx.fillStyle = sailLit;
    oCtx.strokeStyle = sailShade;
    oCtx.lineWidth = 0.5;
    oCtx.beginPath();
    oCtx.moveTo(0, -15);
    if (dirKey === 1 || dirKey === 2 || dirKey === 3) {
      oCtx.quadraticCurveTo(-7 + b, -7, -9 + b * 0.8, -1);
      oCtx.lineTo(0, 1);
    } else if (dirKey === 4) {
      oCtx.quadraticCurveTo(-8 + b, -8, -8 + b, 0);
      oCtx.lineTo(0, 1);
    } else {
      oCtx.quadraticCurveTo(7 + b, -8, 8 + b, 0);
      oCtx.lineTo(0, 1);
    }
    oCtx.closePath();
    oCtx.fill();
    oCtx.stroke();

    // Mainsail shadow / inner fold
    oCtx.fillStyle = sailMid;
    oCtx.beginPath();
    oCtx.moveTo(0, -14);
    if (dirKey === 1 || dirKey === 2 || dirKey === 3) {
      oCtx.quadraticCurveTo(-4 + b * 0.5, -7, -6 + b * 0.5, 0);
      oCtx.lineTo(0, 1);
    } else {
      oCtx.quadraticCurveTo(4 + b * 0.5, -7, 5 + b * 0.5, 0);
      oCtx.lineTo(0, 1);
    }
    oCtx.closePath();
    oCtx.fill();

    // 2. Jib / Foresail
    oCtx.fillStyle = sailLit;
    oCtx.beginPath();
    oCtx.moveTo(0, -12);
    if (dirKey === 1) {
      oCtx.quadraticCurveTo(6 + b * 0.6, -6, 8, -4);
      oCtx.lineTo(1, 0);
    } else if (dirKey === 2) {
      oCtx.quadraticCurveTo(7 + b * 0.6, -5, 9, 2);
      oCtx.lineTo(1, 1);
    } else if (dirKey === 3) {
      oCtx.quadraticCurveTo(5 + b * 0.6, 0, 7, 4);
      oCtx.lineTo(1, 1);
    } else if (dirKey === 4) {
      oCtx.quadraticCurveTo(4 + b * 0.6, 1, 3, 6);
      oCtx.lineTo(0, 1);
    } else {
      oCtx.quadraticCurveTo(-4 + b * 0.6, -4, -3, -5);
      oCtx.lineTo(0, 1);
    }
    oCtx.closePath();
    oCtx.fill();

    // Waterline foam dots
    oCtx.fillStyle = foamColor;
    oCtx.fillRect(-7, 4, 2, 2);
    oCtx.fillRect(7, 4, 2, 2);
    oCtx.fillRect(0, 6, 2, 2);

    oCtx.restore();
  }

  // Foam Particle Trailing System
  function addFoam(lx, ly, vx, vy) {
    boat.foamParticles.push({
      x: lx + (Math.random() - 0.5) * 4,
      y: ly + (Math.random() - 0.5) * 3 + 3,
      vx: -vx * 0.25 + (Math.random() - 0.5) * 0.3,
      vy: -vy * 0.25 + (Math.random() - 0.5) * 0.3,
      size: 1.0 + Math.random() * 1.2,
      life: 1.0,
      decay: 0.03 + Math.random() * 0.02
    });
    if (boat.foamParticles.length > 40) {
      boat.foamParticles.shift();
    }
  }

  // Apply 4x4 Bayer ordered dithering & quantization to offscreen canvas region
  function applyBayerDither(oCtx, minX, minY, boxW, boxH) {
    minX = Math.max(0, Math.floor(minX));
    minY = Math.max(0, Math.floor(minY));
    boxW = Math.min(offscreenCanvas.width - minX, Math.ceil(boxW));
    boxH = Math.min(offscreenCanvas.height - minY, Math.ceil(boxH));

    if (boxW <= 0 || boxH <= 0) return;

    const imgData = oCtx.getImageData(minX, minY, boxW, boxH);
    const data = imgData.data;
    const levels = 14.0;
    const step = 255.0 / levels;

    for (let py = 0; py < boxH; py++) {
      const globalY = minY + py;
      const rowOffset = py * boxW;

      for (let px = 0; px < boxW; px++) {
        const globalX = minX + px;
        const idx = (rowOffset + px) * 4;
        const a = data[idx + 3];
        if (a < 10) continue;

        // Sample 4x4 Bayer Matrix
        const ditherVal = BAYER_4X4[globalY % 4][globalX % 4] * 0.085 * 255.0;

        for (let c = 0; c < 3; c++) {
          let v = data[idx + c] + ditherVal;
          v = Math.max(0, Math.min(255, v));
          data[idx + c] = Math.round(v / step) * step;
        }

        // Discrete pixel boundary
        data[idx + 3] = a > 140 ? 255 : (a > 30 ? 190 : 0);
      }
    }

    oCtx.putImageData(imgData, minX, minY);
  }

  let lastTime = performance.now();

  function gameLoop(now) {
    const dt = Math.min((now - lastTime) * 0.001, 0.05);
    lastTime = now;
    const timeSec = now * 0.001;

    if (isRevealed && isHomePage() && ctx && boatCanvas && offCtx && offscreenCanvas) {
      // Clear both canvases
      offCtx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
      ctx.clearRect(0, 0, boatCanvas.width, boatCanvas.height);

      // Rise animation
      if (riseProgress < 1.0) {
        riseProgress = Math.min(1.0, riseProgress + dt * 1.5);
      }

      // Movement input
      let moveX = 0;
      let moveY = 0;
      if (keys.w || keys.up) moveY -= 1;
      if (keys.s || keys.down) moveY += 1;
      if (keys.a || keys.left) moveX -= 1;
      if (keys.d || keys.right) moveX += 1;

      const isMoving = (moveX !== 0 || moveY !== 0);

      // Tight, responsive physics
      const accel = 26.0; // Snappy acceleration
      const maxSpeed = 4.4; // Crisp cruise speed
      const drag = 0.88; // Quick deceleration when keys released

      if (isMoving) {
        const targetAngle = Math.atan2(moveY, moveX);
        boat.targetAngle = targetAngle;

        // Fast angular steering interpolation
        let diff = boat.targetAngle - boat.currentAngle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        boat.currentAngle += diff * Math.min(1.0, dt * 18.0);

        boat.vx += Math.cos(boat.currentAngle) * accel * dt;
        boat.vy += Math.sin(boat.currentAngle) * accel * dt;
      }

      // Apply drag
      boat.vx *= Math.pow(drag, dt * 60);
      boat.vy *= Math.pow(drag, dt * 60);

      boat.speed = Math.hypot(boat.vx, boat.vy);
      if (boat.speed > maxSpeed) {
        boat.vx = (boat.vx / boat.speed) * maxSpeed;
        boat.vy = (boat.vy / boat.speed) * maxSpeed;
        boat.speed = maxSpeed;
      }

      boat.x += boat.vx;
      boat.y += boat.vy;

      // Screen boundary wrap-around
      const margin = 35;
      if (boat.x < -margin) boat.x = window.innerWidth + margin - 5;
      else if (boat.x > window.innerWidth + margin) boat.x = -margin + 5;

      if (boat.y < -margin) boat.y = window.innerHeight + margin - 5;
      else if (boat.y > window.innerHeight + margin) boat.y = -margin + 5;

      boat.isoDir = getIsoDirection(boat.currentAngle);

      // Low-res boat coordinates
      const lx = boat.x / PIXEL_SCALE;
      const ly = boat.y / PIXEL_SCALE;

      // Update background WebGL 2.5D Kelvin wake hydrodynamics
      if (window.updateBoatHydrodynamics) {
        const activeSpeed = riseProgress > 0.4 ? boat.speed : 0;
        window.updateBoatHydrodynamics(boat.x, boat.y, boat.currentAngle, activeSpeed);
      }

      // Spawn trailing wake nodes for dispersive expanding ripples
      if (boat.speed > 0.35 && riseProgress > 0.4) {
        addFoam(lx, ly, boat.vx / PIXEL_SCALE, boat.vy / PIXEL_SCALE);

        if (now - boat.lastRippleTime > 140) {
          boat.lastRippleTime = now;
          if (window.addBoatWakeNode) {
            window.addBoatWakeNode(boat.x, boat.y, boat.currentAngle);
          }
        }
      }

      // Draw trailing foam particles on low-res buffer
      for (let i = boat.foamParticles.length - 1; i >= 0; i--) {
        const p = boat.foamParticles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= p.decay;

        if (p.life <= 0) {
          boat.foamParticles.splice(i, 1);
          continue;
        }

        offCtx.fillStyle = `rgba(127, 212, 138, ${p.life * 0.8})`;
        offCtx.fillRect(Math.floor(p.x), Math.floor(p.y), Math.max(1, Math.floor(p.size)), Math.max(1, Math.floor(p.size)));
      }

      // Draw sailboat onto low-res buffer
      drawSailboatLowRes(offCtx, lx, ly, boat.isoDir, boat.sailBillow, riseProgress, timeSec);

      // Apply 4x4 Bayer dithering & color quantization to the active boat area
      const boxPad = 25;
      applyBayerDither(offCtx, lx - boxPad, ly - boxPad, boxPad * 2, boxPad * 2);

      // Blit pixelated & dithered buffer onto main screen canvas
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        offscreenCanvas,
        0, 0, offscreenCanvas.width, offscreenCanvas.height,
        0, 0, boatCanvas.width, boatCanvas.height
      );
    }

    requestAnimationFrame(gameLoop);
  }
})();
