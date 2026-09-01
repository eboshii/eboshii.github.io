(function () {
  const canvas = document.getElementById('nebula-bg');
  if (!canvas) return;

  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'low-power'
  });

  if (!gl) return;

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

    float bayer4x4(vec2 p) {
      vec2 b = floor(mod(p, 4.0));
      mat4 m = mat4(
         0.0, 12.0,  3.0, 15.0,
         8.0,  4.0, 11.0,  7.0,
         2.0, 14.0,  1.0, 13.0,
        10.0,  6.0,  9.0,  5.0
      );
      return (m[int(b.x)][int(b.y)] / 16.0) - 0.5;
    }

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

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

    void main() {
      float pixelSize = 3.0;
      vec2 gridCoord = floor(gl_FragCoord.xy / pixelSize);
      vec2 uv = (gridCoord * pixelSize - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

      float t = u_time * 0.07;

      // Layer 1: Far Gas (Slow drift, broad shapes)
      vec2 uvFar = uv * 1.3 + vec2(t * 0.08, t * 0.04);
      float swirlFar = fbm(uvFar * 0.35 + t * 0.15) * 6.28318;
      vec2 warpFar = vec2(
        fbm(uvFar + vec2(1.7, 9.2)),
        fbm(uvFar + vec2(8.3, 2.8))
      ) - 0.5;
      vec2 rWarpFar = vec2(
        warpFar.x * cos(swirlFar) - warpFar.y * sin(swirlFar),
        warpFar.x * sin(swirlFar) + warpFar.y * cos(swirlFar)
      );
      float dFar = fbm(uvFar + rWarpFar * 1.5);

      // Layer 2: Near Gas Filaments (Faster drift, sharper branches)
      vec2 uvNear = uv * 2.1 + vec2(-t * 0.14, t * 0.09);
      float swirlNear = fbm(uvNear * 0.45 - t * 0.22) * 6.28318;
      vec2 warpNear = vec2(
        fbm(uvNear + vec2(5.2, 1.3)),
        fbm(uvNear + vec2(3.1, 7.4))
      ) - 0.5;
      vec2 rWarpNear = vec2(
        warpNear.x * cos(swirlNear) - warpNear.y * sin(swirlNear),
        warpNear.x * sin(swirlNear) + warpNear.y * cos(swirlNear)
      );
      float dNear = fbm(uvNear + rWarpNear * 2.2);

      // Deep dark palette
      vec3 c_space    = vec3(0.0196, 0.0118, 0.0392); // #05030a
      vec3 c_far_gas  = vec3(0.0941, 0.0549, 0.1569); // #180e28
      vec3 c_teal     = vec3(0.0392, 0.1569, 0.2196); // #0a2838
      vec3 c_magenta  = vec3(0.2196, 0.0549, 0.1569); // #380e28
      vec3 c_amber    = vec3(0.4314, 0.2353, 0.0627); // #6e3c10

      vec3 col = c_space;

      float maskFar = smoothstep(0.22, 0.78, dFar);
      col = mix(col, c_far_gas, maskFar * 0.85);

      float filamentHue = noise(uv * 1.5 + t * 0.12);
      vec3 filamentCol = mix(c_teal, c_magenta, filamentHue);
      float maskNear = smoothstep(0.36, 0.82, dNear);
      col = mix(col, filamentCol, maskNear * 0.92);

      float intersection = smoothstep(0.62, 0.92, dNear) * smoothstep(0.42, 0.82, dFar);
      col = mix(col, c_amber, intersection * 0.85);

      // 4x4 Bayer Dithering + Animated Shadow Noise
      float dither = bayer4x4(gridCoord);
      float shadowNoise = (hash(gridCoord + fract(u_time * 0.25)) - 0.5) * 0.035;

      vec3 dithered = col + (dither * 0.085) + shadowNoise;

      float levels = 8.0;
      vec3 finalCol = floor(clamp(dithered, 0.0, 1.0) * levels + 0.5) / levels;

      gl_FragColor = vec4(finalCol, 1.0);
    }
  `;

  function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
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

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
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

  let startTime = performance.now();
  let isRunning = true;

  function render(now) {
    if (!isRunning) return;
    const elapsed = (now - startTime) * 0.001;
    gl.uniform1f(uTime, elapsed);
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
