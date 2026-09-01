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
    uniform vec4 u_boat_state; // x, y, headingAngle, speed
    uniform vec4 u_wake[8];     // x, y, headingAngle, birthTime

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

    // 2.5D Isometric Kelvin Wake & Dispersive Ripple Distortion Field
    vec2 get25DWaveDistortion(vec2 rawUv, float time, out float waveCrest) {
      vec2 grad = vec2(0.0);
      waveCrest = 0.0;

      // 1. Dynamic Kelvin V-Wake from active boat movement
      if (u_boat_state.w > 0.05) {
        vec2 bPos = u_boat_state.xy;
        float bAngle = u_boat_state.z;
        float bSpeed = u_boat_state.w;

        vec2 delta = rawUv - bPos;
        // 2.5D Isometric vertical foreshortening
        delta.y *= 1.8;

        // Rotate into heading frame (parallel vs cross-track)
        float cosA = cos(-bAngle);
        float sinA = sin(-bAngle);
        vec2 local = vec2(
          delta.x * cosA - delta.y * sinA,
          delta.x * sinA + delta.y * cosA
        );

        // Wake forms behind the moving boat (local.x < 0)
        if (local.x < 0.04 && local.x > -0.85) {
          float distAlong = -local.x;
          float distCross = abs(local.y);

          // Kelvin wake envelope (tan ~ 0.36)
          float wakeArm = distAlong * 0.36 + 0.012;
          float armDist = abs(distCross - wakeArm);

          // Divergent bow waves (Kelvin V-crest)
          float bowWave = sin(distAlong * 55.0 - distCross * 105.0) * exp(-armDist * 38.0) * exp(-distAlong * 2.2);

          // Transverse stern oscillations
          float transWave = sin(distAlong * 70.0) * exp(-distCross * 30.0) * exp(-distAlong * 2.5);

          float wakeIntensity = (bowWave * 0.75 + transWave * 0.45) * clamp(bSpeed / 2.6, 0.0, 1.0);

          vec2 normDir = normalize(vec2(-local.x, local.y * 1.8) + 0.0001);
          grad += normDir * wakeIntensity * 0.058;

          // Delicate wave crest highlight along the sharpest peaks of the bow wave
          waveCrest += smoothstep(0.35, 0.90, bowWave) * exp(-armDist * 30.0) * exp(-distAlong * 1.8) * 0.35;
        }
      }

      // 2. Dispersive Isometric Expanding Wave Packets (Slower lingering fade)
      for (int i = 0; i < 8; i++) {
        if (u_wake[i].w > 0.0001) {
          vec2 nodePos = u_wake[i].xy;
          float birth = u_wake[i].w;
          float age = time - birth;

          if (age > 0.0 && age < 5.2) {
            vec2 d = rawUv - nodePos;
            // 2.5D perspective ellipse
            d.y *= 1.75;

            float r = length(d);
            float waveFront = age * 0.13;
            float deltaR = r - waveFront;

            // Dispersive water wave packet envelope with gentle lingering decay
            float envelope = exp(-abs(deltaR) * 18.0) * exp(-age * 0.55);
            float phase = deltaR * 46.0 - age * 3.8;
            float wave = sin(phase) * envelope;

            vec2 dir = normalize(vec2(d.x, d.y / 1.75) + 0.0001);
            grad += dir * wave * 0.042;

            // Subtle glistening wave crash highlight on the crest
            waveCrest += smoothstep(0.35, 0.85, wave) * envelope * 0.26;
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

      // --- 2.5D Wave Refraction Distortion & Delicate Crest Highlight ---
      float waveCrest = 0.0;
      vec2 waveDistort = get25DWaveDistortion(rawUv, u_time, waveCrest);

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

      // Subtle delicate wave crest sheen
      col += vec3(0.30, 0.68, 0.88) * waveCrest;

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
  const uBoatState = gl.getUniformLocation(program, 'u_boat_state');
  const uWake = gl.getUniformLocation(program, 'u_wake[0]');

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
  // 2.5D Boat Wake & Hydrodynamics State
  // -------------------------------------------------------------
  const boatState = { x: 0, y: 0, angle: 0, speed: 0 };
  const MAX_WAKE = 8;
  const wakeNodes = [];
  for (let i = 0; i < MAX_WAKE; i++) {
    wakeNodes.push({ x: 0, y: 0, angle: 0, birth: -999 });
  }
  let nextWakeIdx = 0;
  const flatWake = new Float32Array(MAX_WAKE * 4);

  // Convert screen pixels to normalized WebGL UV
  function toNormUv(screenX, screenY) {
    const minDim = Math.min(window.innerWidth, window.innerHeight);
    return {
      x: (screenX - 0.5 * window.innerWidth) / minDim,
      y: ((window.innerHeight - screenY) - 0.5 * window.innerHeight) / minDim
    };
  }

  // Public boat hydrodynamics hook
  window.updateBoatHydrodynamics = function (screenX, screenY, headingAngle, speed) {
    const uv = toNormUv(screenX, screenY);
    boatState.x = uv.x;
    boatState.y = uv.y;
    // Invert heading angle to match WebGL inverted Y
    boatState.angle = -headingAngle;
    boatState.speed = speed;
  };

  window.addBoatWakeNode = function (screenX, screenY, headingAngle) {
    const uv = toNormUv(screenX, screenY);
    const node = wakeNodes[nextWakeIdx];
    node.x = uv.x;
    node.y = uv.y;
    node.angle = -headingAngle;
    node.birth = (Date.now() - sessionStartTime) * 0.001;
    nextWakeIdx = (nextWakeIdx + 1) % MAX_WAKE;
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

    // Update boat active state uniform
    if (uBoatState) {
      gl.uniform4f(uBoatState, boatState.x, boatState.y, boatState.angle, boatState.speed);
    }

    // Update wake trail uniform
    if (uWake) {
      for (let i = 0; i < MAX_WAKE; i++) {
        flatWake[i * 4 + 0] = wakeNodes[i].x;
        flatWake[i * 4 + 1] = wakeNodes[i].y;
        flatWake[i * 4 + 2] = wakeNodes[i].angle;
        flatWake[i * 4 + 3] = wakeNodes[i].birth;
      }
      gl.uniform4fv(uWake, flatWake);
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
