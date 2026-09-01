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
    uniform vec4 u_wake_nodes[20]; // x, y, birthTime, strength
    uniform vec4 u_kofi_box;      // x, y (center in screen pixels), half_w, half_h
    uniform float u_kofi_radius;
    uniform float u_kofi_fade;

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

      for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
          vec2 offset = vec2(float(x), float(y));
          vec2 cellId = id + offset;

          float prob = hash(cellId + 0.137);
          if (prob > threshold) {
            vec2 jitter = vec2(hash(cellId + 1.71), hash(cellId + 9.33)) - 0.5;
            vec2 starPos = offset + jitter * 0.70;
            float dist = length(gv - starPos);

            float starRadius = 0.015 + hash(cellId + 4.19) * 0.020;
            float core = smoothstep(starRadius, 0.0, dist);
            float glow = 0.0012 / (dist * dist + 0.0018);

            float freq = (1.0 + hash(cellId + 5.72) * 1.5) * speedFactor;
            float phase = hash(cellId + 8.29) * 6.28318;
            float twinkle = 0.55 + 0.45 * sin(time * freq + phase);

            float hueRnd = hash(cellId + 2.91);
            vec3 tint = vec3(1.0, 0.96, 0.92);
            if (hueRnd < 0.35) {
              tint = vec3(1.0, 0.82, 0.55);
            } else if (hueRnd < 0.65) {
              tint = vec3(0.72, 0.88, 1.0);
            }

            float intensity = (core * 1.0 + glow * 0.15) * twinkle * brightnessScale;
            totalStars += tint * intensity;
          }
        }
      }
      return totalStars;
    }

    // 2.5D Pure Physical Dispersive Wavefront Accumulation
    // The V-wake envelope naturally emerges from the superposition of historical expanding nodes!
    vec2 get25DWaveDistortion(vec2 rawUv, float time) {
      vec2 grad = vec2(0.0);

      for (int i = 0; i < 20; i++) {
        if (u_wake_nodes[i].z > 0.0001) {
          vec2 nodePos = u_wake_nodes[i].xy;
          float birth = u_wake_nodes[i].z;
          float strength = u_wake_nodes[i].w;
          float age = time - birth;

          if (age > 0.0 && age < 4.8) {
            vec2 d = rawUv - nodePos;
            // 2.5D Isometric perspective flattening
            d.y *= 1.75;

            float r = length(d);
            float waveFront = age * 0.14;
            float deltaR = r - waveFront;

            // Dispersive water wave packet envelope
            float envelope = exp(-abs(deltaR) * 22.0) * exp(-age * 0.55) * strength;
            float phase = deltaR * 48.0 - age * 4.0;
            float wave = sin(phase) * envelope;

            vec2 dir = normalize(vec2(d.x, d.y / 1.75) + 0.0001);
            grad += dir * wave * 0.038;
          }
        }
      }

      return grad;
    }

    void main() {
      // Retro pixelation (3.0 physical pixels per cell)
      float pixelSize = 3.0;
      vec2 gridCoord = floor(gl_FragCoord.xy / pixelSize);
      vec2 rawUv = (gridCoord * pixelSize - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

      // --- Pure 2.5D Wave Refraction Distortion ---
      vec2 waveDistort = get25DWaveDistortion(rawUv, u_time);

      // Computer clock seed spatial offset
      vec2 seedOffset = vec2(sin(u_seed * 7.13), cos(u_seed * 11.47)) * 8.0;
      vec2 uv = (rawUv + waveDistort) * 2.8 + seedOffset;

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

      // --- Dynamic Ko-fi Glow Halo with S-curve Falloff (Direct Background Render) ---
      if (u_kofi_box.z > 0.1) {
        vec2 p = gl_FragCoord.xy;
        vec2 dBox = abs(p - u_kofi_box.xy) - (u_kofi_box.zw - vec2(u_kofi_radius));
        float dist = length(max(dBox, 0.0)) + min(max(dBox.x, dBox.y), 0.0) - u_kofi_radius;

        if (dist > 0.0 && dist < u_kofi_fade) {
          float uNorm = dist / u_kofi_fade;
          float inv = 1.0 - uNorm;
          // S-curve sigmoid: stays high for first few pixels, drops steeply, lingers near transparent
          float sCurve = smoothstep(0.12, 0.88, inv);
          sCurve = sCurve * sCurve * (3.0 - 2.0 * sCurve);

          col = mix(col, vec3(1.0, 1.0, 1.0), sCurve);
        }
      }

      // ---------------------------------------------------------
      // Multi-Pass Poisson-Disk Starfield (Seeded continuous coordinate)
      // ---------------------------------------------------------
      vec2 starUv = (rawUv + waveDistort * 0.8) + seedOffset * 0.3;
      vec3 stars = vec3(0.0);
      stars += starLayer(starUv, 70.0, 0.20, 0.35, u_time, 0.8);
      stars += starLayer(starUv, 36.0, 0.35, 0.65, u_time, 1.0);
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
  const uWakeNodes = gl.getUniformLocation(program, 'u_wake_nodes[0]');
  const uKofiBox = gl.getUniformLocation(program, 'u_kofi_box');
  const uKofiRadius = gl.getUniformLocation(program, 'u_kofi_radius');
  const uKofiFade = gl.getUniformLocation(program, 'u_kofi_fade');

  // Session Anchor Time & Seed
  let sessionStartTime = parseFloat(sessionStorage.getItem('nebula_session_start'));
  let sessionSeed = parseFloat(sessionStorage.getItem('nebula_session_seed'));

  if (isNaN(sessionStartTime) || isNaN(sessionSeed)) {
    sessionStartTime = Date.now();
    sessionSeed = (sessionStartTime % 1000000) * 0.00137;
    sessionStorage.setItem('nebula_session_start', sessionStartTime.toString());
    sessionStorage.setItem('nebula_session_seed', sessionSeed.toString());
  }

  gl.uniform1f(uSeed, sessionSeed);

  // -------------------------------------------------------------
  // Dynamic Emergent Wake Trail Nodes (20-node ring buffer)
  // -------------------------------------------------------------
  const MAX_WAKE_NODES = 20;
  const wakeNodes = [];
  for (let i = 0; i < MAX_WAKE_NODES; i++) {
    wakeNodes.push({ x: 0, y: 0, birth: -999, strength: 0 });
  }
  let nextWakeIdx = 0;
  const flatWake = new Float32Array(MAX_WAKE_NODES * 4);

  function toNormUv(screenX, screenY) {
    const minDim = Math.min(window.innerWidth, window.innerHeight);
    return {
      x: (screenX - 0.5 * window.innerWidth) / minDim,
      y: ((window.innerHeight - screenY) - 0.5 * window.innerHeight) / minDim
    };
  }

  // Add an expanding wake node at the boat's current position
  window.addBoatWakeNode = function (screenX, screenY, strength = 1.0) {
    const uv = toNormUv(screenX, screenY);
    const node = wakeNodes[nextWakeIdx];
    node.x = uv.x;
    node.y = uv.y;
    node.birth = (Date.now() - sessionStartTime) * 0.001;
    node.strength = Math.max(0.2, Math.min(1.0, strength));
    nextWakeIdx = (nextWakeIdx + 1) % MAX_WAKE_NODES;
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

    const elapsed = (Date.now() - sessionStartTime) * 0.001;
    gl.uniform1f(uTime, elapsed);

    if (uWakeNodes) {
      for (let i = 0; i < MAX_WAKE_NODES; i++) {
        flatWake[i * 4 + 0] = wakeNodes[i].x;
        flatWake[i * 4 + 1] = wakeNodes[i].y;
        flatWake[i * 4 + 2] = wakeNodes[i].birth;
        flatWake[i * 4 + 3] = wakeNodes[i].strength;
      }
      gl.uniform4fv(uWakeNodes, flatWake);
    }

    if (uKofiBox) {
      const kofiWrapper = document.querySelector('.kofi-dither-wrapper');
      if (kofiWrapper && window.location.pathname.includes('/tip')) {
        const rect = kofiWrapper.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 1.0);
        const cx = (rect.left + rect.width * 0.5) * dpr;
        const cy = (window.innerHeight - (rect.top + rect.height * 0.5)) * dpr;
        const hw = (rect.width * 0.5) * dpr;
        const hh = (rect.height * 0.5) * dpr;
        gl.uniform4f(uKofiBox, cx, cy, hw, hh);
        gl.uniform1f(uKofiRadius, 8.0 * dpr);
        gl.uniform1f(uKofiFade, 36.0 * dpr); // 36px S-curve halo
      } else {
        gl.uniform4f(uKofiBox, -9999.0, -9999.0, 0.0, 0.0);
        gl.uniform1f(uKofiRadius, 0.0);
        gl.uniform1f(uKofiFade, 0.0);
      }
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
