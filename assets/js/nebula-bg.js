(function () {
  const canvas = document.getElementById('nebula-bg');
  if (!canvas) return;

  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'low-power'
  }) || canvas.getContext('experimental-webgl');

  if (!gl) {
    console.warn('WebGL not supported for nebula background');
    return;
  }

  const vsSource = `
    attribute vec2 a_position;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const fsSource = `
    precision highp float;

    uniform vec2 u_resolution;
    uniform float u_time;
    uniform float u_seed;
    uniform vec4 u_ripples[6];

    // Standard 4x4 Bayer Matrix (100% WebGL 1.0 compliant)
    float bayer4x4(vec2 p) {
      vec2 b = mod(floor(p), 4.0);
      float x = b.x;
      float y = b.y;

      if (y < 0.5) {
        if (x < 0.5) return -0.5000;
        if (x < 1.5) return  0.0000;
        if (x < 2.5) return -0.3750;
        return  0.1250;
      } else if (y < 1.5) {
        if (x < 0.5) return  0.2500;
        if (x < 1.5) return -0.2500;
        if (x < 2.5) return  0.3750;
        return -0.1250;
      } else if (y < 2.5) {
        if (x < 0.5) return -0.3125;
        if (x < 1.5) return  0.1875;
        if (x < 2.5) return -0.4375;
        return  0.0625;
      } else {
        if (x < 0.5) return  0.4375;
        if (x < 1.5) return -0.0625;
        if (x < 2.5) return  0.3125;
        return -0.1875;
      }
    }

    // Fast 2D Hash
    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    // 2D Value Noise with Hermite Curve
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);

      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));

      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }

    // 3-Octave Lightweight FBM with Rotation
    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
      for (int i = 0; i < 3; i++) {
        v += a * noise(p);
        p = rot * p * 2.02;
        a *= 0.5;
      }
      return v;
    }

    // Poisson-Disk-Style Star Layer (Jittered Grid)
    vec3 starLayer(vec2 uv, float gridDensity, float threshold, float brightnessScale, float time, float speedFactor) {
      vec2 p = uv * gridDensity;
      vec2 id = floor(p);
      vec2 gv = fract(p) - 0.5;

      vec3 totalStars = vec3(0.0);

      // Check 3x3 neighborhood for border continuity
      for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
          vec2 offset = vec2(float(x), float(y));
          vec2 cellId = id + offset;

          float prob = hash(cellId + 0.137);
          if (prob > threshold) {
            vec2 jitter = vec2(hash(cellId + 1.71), hash(cellId + 9.33)) - 0.5;
            vec2 starPos = offset + jitter * 0.70;
            float dist = length(gv - starPos);

            // Delicate pinpoint star core
            float starRadius = 0.015 + hash(cellId + 4.19) * 0.020;
            float core = smoothstep(starRadius, 0.0, dist);
            float glow = 0.0012 / (dist * dist + 0.0018);

            // Gentle twinkle over a few seconds (period ~2-5s)
            float freq = (1.0 + hash(cellId + 5.72) * 1.5) * speedFactor;
            float phase = hash(cellId + 8.29) * 6.28318;
            float twinkle = 0.55 + 0.45 * sin(time * freq + phase);

            // Subtle color tint: warm amber, pale blue, soft white
            float hueRnd = hash(cellId + 2.91);
            vec3 tint = vec3(1.0, 0.96, 0.92);
            if (hueRnd < 0.35) {
              tint = vec3(1.0, 0.82, 0.55); // warm amber
            } else if (hueRnd < 0.65) {
              tint = vec3(0.72, 0.88, 1.0); // pale cyan-blue
            }

            float intensity = (core * 1.0 + glow * 0.15) * twinkle * brightnessScale;
            totalStars += tint * intensity;
          }
        }
      }
      return totalStars;
    }

    void main() {
      // Retro pixelation (3.0 physical pixels per cell)
      float pixelSize = 3.0;
      vec2 gridCoord = floor(gl_FragCoord.xy / pixelSize);
      vec2 rawUv = (gridCoord * pixelSize - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

      // --- Ripple Wake Displacement & Shimmering Crest ---
      vec2 rippleDisp = vec2(0.0);
      float rippleCrest = 0.0;

      for (int i = 0; i < 6; i++) {
        if (u_ripples[i].w > 0.001) {
          vec2 rPos = u_ripples[i].xy;
          float birth = u_ripples[i].z;
          float str = u_ripples[i].w;
          float age = u_time - birth;

          if (age > 0.0 && age < 3.2) {
            float waveRadius = age * 0.32;
            float dist = length(rawUv - rPos);
            float delta = dist - waveRadius;

            float envelope = exp(-abs(delta) * 16.0) * exp(-age * 1.1) * str;
            float wave = sin(delta * 45.0) * envelope;

            vec2 dir = normalize(rawUv - rPos + 0.0001);
            rippleDisp += dir * wave * 0.07;
            rippleCrest += smoothstep(0.035, 0.0, abs(delta)) * envelope * 0.55;
          }
        }
      }

      // Computer clock seed spatial offset
      vec2 seedOffset = vec2(sin(u_seed * 7.13), cos(u_seed * 11.47)) * 8.0;
      vec2 uv = (rawUv + rippleDisp) * 2.8 + seedOffset;

      float t = u_time * 0.05;

      // --- Layer 1: Far Cosmic Clouds (Muted violet & indigo) ---
      vec2 uvFar = uv * 1.1 + vec2(t * 0.05, t * 0.025);
      float swirlFar = fbm(uvFar * 0.3 + t * 0.1) * 6.28318;
      vec2 warpFar = vec2(
        fbm(uvFar + vec2(1.7, 9.2)),
        fbm(uvFar + vec2(8.3, 2.8))
      ) - 0.5;
      vec2 rWarpFar = vec2(
        warpFar.x * cos(swirlFar) - warpFar.y * sin(swirlFar),
        warpFar.x * sin(swirlFar) + warpFar.y * cos(swirlFar)
      );
      float dFar = fbm(uvFar + rWarpFar * 1.6);

      // --- Layer 2: Near Swirling Filaments (Teal, magenta, and amber) ---
      vec2 uvNear = uv * 1.8 + vec2(-t * 0.10, t * 0.07);
      float swirlNear = fbm(uvNear * 0.4 - t * 0.15) * 6.28318;
      vec2 warpNear = vec2(
        fbm(uvNear + vec2(5.2, 1.3)),
        fbm(uvNear + vec2(3.1, 7.4))
      ) - 0.5;
      vec2 rWarpNear = vec2(
        warpNear.x * cos(swirlNear) - warpNear.y * sin(swirlNear),
        warpNear.x * sin(swirlNear) + warpNear.y * cos(swirlNear)
      );
      float dNear = fbm(uvNear + rWarpNear * 2.0);

      // --- Color Palette ---
      vec3 c_space    = vec3(0.027, 0.015, 0.051); // #07040d Deep void
      vec3 c_far_gas  = vec3(0.125, 0.063, 0.220); // #201038 Deep violet cloud
      vec3 c_teal     = vec3(0.055, 0.247, 0.322); // #0e3f52 Glowing cyan filament
      vec3 c_magenta  = vec3(0.318, 0.086, 0.231); // #51163b Rose magenta filament
      vec3 c_amber    = vec3(0.682, 0.365, 0.114); // #ae5d1d Glowing stellar core

      // Base space
      vec3 col = c_space;

      // Far gas layer
      float maskFar = smoothstep(0.10, 0.58, dFar);
      col = mix(col, c_far_gas, maskFar * 0.95);

      // Near filament layer
      float filamentHue = noise(uv * 1.4 + t * 0.08);
      vec3 filamentCol  = mix(c_teal, c_magenta, filamentHue);
      float maskNear    = smoothstep(0.20, 0.65, dNear);
      col = mix(col, filamentCol, maskNear * 0.98);

      // Dense intersection highlights
      float intersection = smoothstep(0.42, 0.85, dNear) * smoothstep(0.26, 0.75, dFar);
      col = mix(col, c_amber, intersection * 0.92);

      // Luminous wake ripple crest tint (cyan-amber cosmic foam)
      col += vec3(0.25, 0.65, 0.85) * rippleCrest;

      // ---------------------------------------------------------
      // Multi-Pass Poisson-Disk Starfield (Seeded continuous coordinate)
      // ---------------------------------------------------------
      vec2 starUv = (rawUv + rippleDisp * 0.4) + seedOffset * 0.3;
      vec3 stars = vec3(0.0);
      // Pass 1: Faint background micro-pinpoints
      stars += starLayer(starUv, 70.0, 0.20, 0.35, u_time, 0.8);
      // Pass 2: Medium field stars
      stars += starLayer(starUv, 36.0, 0.35, 0.65, u_time, 1.0);
      // Pass 3: Prominent twinkling focal stars
      stars += starLayer(starUv, 18.0, 0.72, 0.95, u_time, 1.2);

      // 4x4 Ordered Bayer Dithering + Subtle Shadow Noise
      float dither = bayer4x4(gridCoord);
      float shadowNoise = (hash(gridCoord + fract(u_time * 0.2)) - 0.5) * 0.035;

      vec3 dithered = col + stars + (dither * 0.085) + shadowNoise;

      // Discrete retro quantization
      float levels = 14.0;
      vec3 finalCol = floor(clamp(dithered, 0.0, 1.0) * levels + 0.5) / levels;

      gl_FragColor = vec4(finalCol, 1.0);
    }
  `;

  function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
  if (!vertexShader || !fragmentShader) return;

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program));
    return;
  }
  gl.useProgram(program);

  const quadBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      -1.0, -1.0,
       1.0, -1.0,
      -1.0,  1.0,
      -1.0,  1.0,
       1.0, -1.0,
       1.0,  1.0,
    ]),
    gl.STATIC_DRAW
  );

  const aPosition = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(aPosition);
  gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

  const uResolution = gl.getUniformLocation(program, 'u_resolution');
  const uTime = gl.getUniformLocation(program, 'u_time');
  const uSeed = gl.getUniformLocation(program, 'u_seed');
  const uRipples = gl.getUniformLocation(program, 'u_ripples[0]');

  // -------------------------------------------------------------
  // Session Anchor Time & Seed (Persists seamlessly across tabs/pages)
  // -------------------------------------------------------------
  let sessionStartTime = parseFloat(sessionStorage.getItem('nebula_session_start'));
  let sessionSeed = parseFloat(sessionStorage.getItem('nebula_session_seed'));

  // If first visit in this tab, anchor with computer clock time
  if (isNaN(sessionStartTime) || isNaN(sessionSeed)) {
    sessionStartTime = Date.now();
    sessionSeed = (sessionStartTime % 1000000) * 0.00137;
    sessionStorage.setItem('nebula_session_start', sessionStartTime.toString());
    sessionStorage.setItem('nebula_session_seed', sessionSeed.toString());
  }

  gl.uniform1f(uSeed, sessionSeed);

  // -------------------------------------------------------------
  // Dynamic Ripple System
  // -------------------------------------------------------------
  const MAX_RIPPLES = 6;
  const ripples = [];
  for (let i = 0; i < MAX_RIPPLES; i++) {
    ripples.push({ x: 0, y: 0, birth: -999, strength: 0 });
  }
  let nextRippleIdx = 0;
  const flatRipples = new Float32Array(MAX_RIPPLES * 4);

  // Public ripple emitter (transforms screen px to normalized UV)
  window.addNebulaRipple = function (screenX, screenY, strength = 1.0) {
    const minDim = Math.min(window.innerWidth, window.innerHeight);
    const uvX = (screenX - 0.5 * window.innerWidth) / minDim;
    // WebGL fragCoord Y is flipped relative to screen Y
    const uvY = ((window.innerHeight - screenY) - 0.5 * window.innerHeight) / minDim;

    const r = ripples[nextRippleIdx];
    r.x = uvX;
    r.y = uvY;
    r.birth = (Date.now() - sessionStartTime) * 0.001;
    r.strength = strength;
    nextRippleIdx = (nextRippleIdx + 1) % MAX_RIPPLES;
  };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.0);
    const displayWidth = Math.floor(window.innerWidth * dpr);
    const displayHeight = Math.floor(window.innerHeight * dpr);

    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      canvas.width = displayWidth;
      canvas.height = displayHeight;
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform2f(uResolution, canvas.width, canvas.height);
    }
  }

  window.addEventListener('resize', resize);
  resize();

  let isRunning = true;

  function render() {
    if (!isRunning) return;

    // Continuous wall-clock time relative to the session start anchor
    const elapsed = (Date.now() - sessionStartTime) * 0.001;
    gl.uniform1f(uTime, elapsed);

    // Update ripples array
    if (uRipples) {
      for (let i = 0; i < MAX_RIPPLES; i++) {
        flatRipples[i * 4 + 0] = ripples[i].x;
        flatRipples[i * 4 + 1] = ripples[i].y;
        flatRipples[i * 4 + 2] = ripples[i].birth;
        flatRipples[i * 4 + 3] = ripples[i].strength;
      }
      gl.uniform4fv(uRipples, flatRipples);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    requestAnimationFrame(render);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      isRunning = false;
    } else {
      isRunning = true;
      requestAnimationFrame(render);
    }
  });

  requestAnimationFrame(render);
})();
