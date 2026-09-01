/**
 * eboshii space sailboat easter egg
 * Controlled via WASD or Arrow keys on the homepage.
 * Features:
 * - Snappy game feel: short punchy acceleration with instant crisp stop on release
 * - Directional Squash & Stretch spring deformation along heading axis
 * - Elastic settling bounce-back on stop
 * - Turn-leaning / heel dynamics
 * - 3px pixelation and 4x4 Bayer ordered dithering matching the WebGL nebula background
 * - 2.5D Kelvin wake hydrodynamics and pure refraction
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

  // Boat state with game-feel dynamics
  const boat = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    speed: 0,
    targetAngle: -Math.PI / 4,
    currentAngle: -Math.PI / 4,
    isoDir: 1, // 0: N, 1: NE, 2: E, 3: SE, 4: S, 5: SW, 6: W, 7: NW
    wasMoving: false,
    stretch: 1.0,      // Squash & stretch length factor
    stretchVel: 0.0,   // Spring velocity for elastic bounce
    heelAngle: 0.0,    // Leaning tilt during turns
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

  function getIsoDirection(angle) {
    let a = (angle % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const sector = Math.PI / 4;
    const idx = Math.floor((a + sector / 2) / sector) % 8;
    const mapping = [2, 3, 4, 5, 6, 7, 0, 1];
    return mapping[idx];
  }

  // Draw 8-Direction Isometric Sailboat Sprite with Squash & Stretch + Heel tilt
  function drawSailboatLowRes(oCtx, lx, ly, isoDir, stretch, heel, rise, time) {
    oCtx.save();
    oCtx.translate(lx, ly);

    // Wave bobbing & buoyancy (slower, gentle ocean motion)
    const bob = Math.sin(time * 2.0) * 0.7;
    oCtx.translate(0, bob);

    // Turn lean / heel tilt
    oCtx.rotate(heel);

    // Directional Squash & Stretch along boat heading frame
    const lenScale = Math.max(0.75, Math.min(1.35, stretch));
    const widthScale = 1.0 / Math.sqrt(lenScale); // Preserve volume

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

    let flipX = 1;
    let dirKey = isoDir;
    if (isoDir === 5) { dirKey = 3; flipX = -1; }
    else if (isoDir === 6) { dirKey = 2; flipX = -1; }
    else if (isoDir === 7) { dirKey = 1; flipX = -1; }

    oCtx.scale(flipX * widthScale, lenScale);

    // --- Slim Curved Hydrodynamic Hull Base ---
    oCtx.fillStyle = woodMid;
    oCtx.strokeStyle = woodDark;
    oCtx.lineWidth = 0.8;

    oCtx.beginPath();
    if (dirKey === 1) {
      // NE
      oCtx.moveTo(-11, 4);
      oCtx.quadraticCurveTo(1, 0, 14, -6);
      oCtx.quadraticCurveTo(15.5, -5, 13.5, -3.8);
      oCtx.quadraticCurveTo(2, 4.2, -8, 6.2);
      oCtx.quadraticCurveTo(-11.8, 5.8, -11, 4);
    } else if (dirKey === 2) {
      // E
      oCtx.moveTo(-13, 2.5);
      oCtx.quadraticCurveTo(0, 2.8, 15, 2.5);
      oCtx.quadraticCurveTo(15.8, 3.5, 13.5, 4.8);
      oCtx.quadraticCurveTo(0, 6.2, -11.5, 5.0);
      oCtx.quadraticCurveTo(-13.8, 4.0, -13, 2.5);
    } else if (dirKey === 3) {
      // SE
      oCtx.moveTo(-12, -3.5);
      oCtx.quadraticCurveTo(0, 2.0, 14, 7.5);
      oCtx.quadraticCurveTo(13.8, 8.8, 11.5, 8.5);
      oCtx.quadraticCurveTo(-1, 6.5, -13, -1.0);
      oCtx.quadraticCurveTo(-13.5, -2.8, -12, -3.5);
    } else if (dirKey === 4) {
      // S
      oCtx.moveTo(0, 10.5);
      oCtx.quadraticCurveTo(-3.8, 4.5, -4.5, -2.0);
      oCtx.quadraticCurveTo(0, -3.8, 4.5, -2.0);
      oCtx.quadraticCurveTo(3.8, 4.5, 0, 10.5);
    } else {
      // N
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

    // --- Dynamic Sail Catch with Wind Billow (Gentle pace) ---
    const windPop = (stretch - 1.0) * 2.0;
    const b = Math.sin(time * 2.4) * 0.9 + windPop;

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

    oCtx.restore();
  }

  function addFoam(lx, ly, vx, vy, count = 1) {
    for (let i = 0; i < count; i++) {
      boat.foamParticles.push({
        x: lx + (Math.random() - 0.5) * 4,
        y: ly + (Math.random() - 0.5) * 3 + 3,
        vx: -vx * 0.25 + (Math.random() - 0.5) * 0.4,
        vy: -vy * 0.25 + (Math.random() - 0.5) * 0.4,
        size: 1.0 + Math.random() * 1.3,
        life: 1.0,
        decay: 0.025 + Math.random() * 0.02
      });
    }
    if (boat.foamParticles.length > 50) {
      boat.foamParticles.splice(0, boat.foamParticles.length - 50);
    }
  }

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

        const ditherVal = BAYER_4X4[globalY % 4][globalX % 4] * 0.085 * 255.0;

        for (let c = 0; c < 3; c++) {
          let v = data[idx + c] + ditherVal;
          v = Math.max(0, Math.min(255, v));
          data[idx + c] = Math.round(v / step) * step;
        }

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
      offCtx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
      ctx.clearRect(0, 0, boatCanvas.width, boatCanvas.height);

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

      // --- Snappy Game Handling & Kinematics ---
      const maxSpeed = 3.2; // Graceful, controlled cruising pace
      const accelRate = 24.0; // Responsive acceleration ramp

      let targetStretch = 1.0;
      let targetHeel = 0.0;

      if (isMoving) {
        // Initial acceleration punch / launch burst
        if (!boat.wasMoving) {
          boat.stretch = 1.18; // Forward elongation burst
          boat.stretchVel = 0.8;
          boat.strokeDist = 0.0; // Reset distance for new stroke
          addFoam(boat.x / PIXEL_SCALE, boat.y / PIXEL_SCALE, moveX, moveY, 5);
          if (window.addBoatWakeNode) {
            window.addBoatWakeNode(boat.x, boat.y, Math.atan2(moveY, moveX));
          }
        }

        const targetAngle = Math.atan2(moveY, moveX);
        boat.targetAngle = targetAngle;

        // Angular turning with heel tilt
        let diff = boat.targetAngle - boat.currentAngle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        
        boat.currentAngle += diff * Math.min(1.0, dt * 16.0);
        targetHeel = Math.max(-0.14, Math.min(0.14, diff * 0.22));

        // Accelerate along current heading
        boat.speed = Math.min(maxSpeed, boat.speed + accelRate * dt);
        boat.vx = Math.cos(boat.currentAngle) * boat.speed;
        boat.vy = Math.sin(boat.currentAngle) * boat.speed;

        // Accumulate distance traveled on current stroke leg
        boat.strokeDist = (boat.strokeDist || 0) + Math.hypot(boat.vx, boat.vy);

        // Cruise stretch factor
        targetStretch = 1.03 + (boat.speed / maxSpeed) * 0.05;
      } else {
        // --- Smooth Coastal Momentum Deceleration on Button Release ---
        if (boat.wasMoving) {
          boat.stretchVel = -1.4; // Soft recoil kickback
        }

        if (boat.speed > 0.05) {
          // Coast down smoothly over a short time
          const coastDrag = 0.89;
          boat.speed *= Math.pow(coastDrag, dt * 60);
          boat.vx = Math.cos(boat.currentAngle) * boat.speed;
          boat.vy = Math.sin(boat.currentAngle) * boat.speed;
          boat.strokeDist = (boat.strokeDist || 0) + Math.hypot(boat.vx, boat.vy);

          if (Math.random() < 0.35) {
            addFoam(boat.x / PIXEL_SCALE, boat.y / PIXEL_SCALE, boat.vx / PIXEL_SCALE, boat.vy / PIXEL_SCALE, 1);
          }
        } else {
          boat.speed = 0;
          boat.vx = 0;
          boat.vy = 0;
        }

        targetStretch = 1.0;
        targetHeel = 0.0;
      }

      boat.wasMoving = isMoving;

      // Update position
      boat.x += boat.vx;
      boat.y += boat.vy;

      // Slower, softer Spring-Damper System for Organic Bounce-back
      const springK = 75.0; // Slower, relaxed spring frequency
      const springDamp = 9.5; // Soft damping
      const springForce = -springK * (boat.stretch - targetStretch) - springDamp * boat.stretchVel;
      boat.stretchVel += springForce * dt;
      boat.stretch += boat.stretchVel * dt;

      // Smooth heel tilt
      boat.heelAngle += (targetHeel - boat.heelAngle) * Math.min(1.0, dt * 8.0);

      // Screen boundary wrap-around
      const margin = 35;
      if (boat.x < -margin) boat.x = window.innerWidth + margin - 5;
      else if (boat.x > window.innerWidth + margin) boat.x = -margin + 5;

      if (boat.y < -margin) boat.y = window.innerHeight + margin - 5;
      else if (boat.y > window.innerHeight + margin) boat.y = -margin + 5;

      boat.isoDir = getIsoDirection(boat.currentAngle);

      const lx = boat.x / PIXEL_SCALE;
      const ly = boat.y / PIXEL_SCALE;

      // Hydrodynamics update with stroke-bounded distance
      if (window.updateBoatHydrodynamics) {
        const minDim = Math.min(window.innerWidth, window.innerHeight);
        const strokeDistUv = (boat.strokeDist || 0) / minDim;
        const activeSpeed = riseProgress > 0.4 ? boat.speed : 0;
        window.updateBoatHydrodynamics(boat.x, boat.y, boat.currentAngle, activeSpeed, strokeDistUv);
      }

      if (boat.speed > 0.5 && riseProgress > 0.4) {
        addFoam(lx, ly, boat.vx / PIXEL_SCALE, boat.vy / PIXEL_SCALE);

        if (now - boat.lastRippleTime > 130) {
          boat.lastRippleTime = now;
          if (window.addBoatWakeNode) {
            window.addBoatWakeNode(boat.x, boat.y, boat.currentAngle);
          }
        }
      }

      // Draw trailing foam
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

      // Draw sailboat with squash & stretch + heel lean
      drawSailboatLowRes(offCtx, lx, ly, boat.isoDir, boat.stretch, boat.heelAngle, riseProgress, timeSec);

      // Apply 4x4 Bayer dithering
      const boxPad = 26;
      applyBayerDither(offCtx, lx - boxPad, ly - boxPad, boxPad * 2, boxPad * 2);

      // Blit to screen canvas
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
