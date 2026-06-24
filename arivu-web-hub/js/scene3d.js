// 3D scenes: hero terrain + interactive Saakshi→Padhavi→Kaalam pipeline.
(function (global) {
  if (!global.THREE) return;

  const T = global.THREE;
  const LAYERS = {
    saakshi: { color: 0x1b6b47, label: "SAAKSHI", pos: [-3.2, 0, 0] },
    padhavi: { color: 0xe0a92e, label: "PADHAVI", pos: [0, 0, 0] },
    kaalam: { color: 0xc2402b, label: "KAALAM", pos: [3.2, 0, 0] },
  };

  let heroScene, heroCamera, heroRenderer, heroAnimId;
  let pipeScene, pipeCamera, pipeRenderer, pipeAnimId;
  let pipeNodes = {};
  let flowParticles = [];
  let activeGlow = null;
  let mouseX = 0, mouseY = 0;

  // ---- shared helpers ----
  function makeRenderer(canvas, alpha) {
    const r = new T.WebGLRenderer({ canvas, antialias: true, alpha: !!alpha });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.setClearColor(0x0e3d29, alpha ? 0 : 1);
    return r;
  }

  function resize(canvas, renderer, camera, aspectFix) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (aspectFix) aspectFix(w, h);
  }

  // ---- HERO: Western Ghats terrain + knowledge particles ----
  function initHero() {
    const canvas = document.getElementById("heroCanvas");
    if (!canvas) return;

    heroScene = new T.Scene();
    heroScene.fog = new T.FogExp2(0x0e3d29, 0.04);

    heroCamera = new T.PerspectiveCamera(55, 1, 0.1, 100);
    heroCamera.position.set(0, 4.5, 9);
    heroCamera.lookAt(0, 0, 0);

    heroRenderer = makeRenderer(canvas, true);

    const geo = new T.PlaneGeometry(24, 14, 64, 40);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const h =
        Math.sin(x * 0.35) * 0.9 +
        Math.cos(y * 0.28) * 0.7 +
        Math.sin((x + y) * 0.18) * 1.1 +
        Math.exp(-((x * x) / 30 + (y - 2) * (y - 2) / 8)) * 2.2;
      pos.setZ(i, h);
    }
    geo.computeVertexNormals();

    const terrain = new T.Mesh(
      geo,
      new T.MeshStandardMaterial({
        color: 0x1b6b47,
        emissive: 0x0e3d29,
        emissiveIntensity: 0.25,
        roughness: 0.7,
        metalness: 0.15,
        flatShading: true,
        side: T.DoubleSide,
      })
    );
    terrain.rotation.x = -Math.PI / 2.2;
    terrain.position.y = -1.8;
    heroScene.add(terrain);

    const wire = new T.Mesh(
      geo.clone(),
      new T.MeshBasicMaterial({ color: 0xe0a92e, wireframe: true, transparent: true, opacity: 0.1 })
    );
    wire.rotation.copy(terrain.rotation);
    wire.position.copy(terrain.position);
    heroScene.add(wire);

    heroScene.add(new T.AmbientLight(0x8fb9a0, 0.4));
    const sun = new T.DirectionalLight(0xe0a92e, 1.1);
    sun.position.set(5, 8, 4);
    heroScene.add(sun);
    const rim = new T.PointLight(0xe0a92e, 0.7, 22);
    rim.position.set(-4, 3, -2);
    heroScene.add(rim);

    const particleGeo = new T.BufferGeometry();
    const count = 180;
    const pPos = new Float32Array(count * 3);
    const pVel = [];
    for (let i = 0; i < count; i++) {
      pPos[i * 3] = (Math.random() - 0.5) * 18;
      pPos[i * 3 + 1] = Math.random() * 5 + 0.5;
      pPos[i * 3 + 2] = (Math.random() - 0.5) * 10;
      pVel.push({ dx: (Math.random() - 0.5) * 0.008, dy: Math.random() * 0.006 + 0.002, dz: (Math.random() - 0.5) * 0.008 });
    }
    particleGeo.setAttribute("position", new T.BufferAttribute(pPos, 3));
    const particles = new T.Points(
      particleGeo,
      new T.PointsMaterial({ color: 0xe0a92e, size: 0.08, transparent: true, opacity: 0.8, sizeAttenuation: true })
    );
    heroScene.add(particles);

    const groveMarkers = [
      [-3, 1.2, -1], [2, 1.8, 0.5], [-1, 2.4, 2], [4, 1.5, -2], [-5, 1, 1.5],
    ];
    groveMarkers.forEach(([x, y, z], i) => {
      const glow = new T.Mesh(
        new T.SphereGeometry(0.12, 12, 12),
        new T.MeshBasicMaterial({ color: i % 3 === 0 ? 0x1b6b47 : i % 3 === 1 ? 0xe0a92e : 0xc2402b, transparent: true, opacity: 0.85 })
      );
      glow.position.set(x, y, z);
      heroScene.add(glow);
    });

    function animateHero(t) {
      heroAnimId = requestAnimationFrame(animateHero);
      const time = t * 0.001;
      heroCamera.position.x = Math.sin(time * 0.15) * 1.2 + mouseX * 0.4;
      heroCamera.position.y = 4.2 + mouseY * 0.3;
      heroCamera.lookAt(0, 0.5, 0);

      const arr = particleGeo.attributes.position.array;
      for (let i = 0; i < count; i++) {
        arr[i * 3] += pVel[i].dx;
        arr[i * 3 + 1] += pVel[i].dy;
        arr[i * 3 + 2] += pVel[i].dz;
        if (arr[i * 3 + 1] > 6) arr[i * 3 + 1] = 0.3;
        if (Math.abs(arr[i * 3]) > 9) pVel[i].dx *= -1;
        if (Math.abs(arr[i * 3 + 2]) > 5) pVel[i].dz *= -1;
      }
      particleGeo.attributes.position.needsUpdate = true;
      wire.rotation.z = Math.sin(time * 0.2) * 0.02;

      resize(canvas, heroRenderer, heroCamera);
      heroRenderer.render(heroScene, heroCamera);
    }
    animateHero(0);

    window.addEventListener("resize", () => resize(canvas, heroRenderer, heroCamera));
    document.addEventListener("mousemove", (e) => {
      mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
      mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    });
  }

  // ---- PIPELINE: three connected nodes with flowing data ----
  function makeNode(key, cfg) {
    const group = new T.Group();
    group.position.set(...cfg.pos);

    const core = new T.Mesh(
      new T.IcosahedronGeometry(0.55, 2),
      new T.MeshStandardMaterial({ color: cfg.color, roughness: 0.35, metalness: 0.4, emissive: cfg.color, emissiveIntensity: 0.15 })
    );
    group.add(core);

    const ring = new T.Mesh(
      new T.TorusGeometry(0.85, 0.03, 8, 48),
      new T.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.35 })
    );
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    const glow = new T.Mesh(
      new T.SphereGeometry(1.1, 16, 16),
      new T.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0, side: T.BackSide })
    );
    group.add(glow);

    pipeNodes[key] = { group, core, ring, glow, baseEmissive: 0.15 };
    pipeScene.add(group);
    return group;
  }

  function makeFlowLine(from, to, color) {
    const curve = new T.CatmullRomCurve3([
      new T.Vector3(...from),
      new T.Vector3((from[0] + to[0]) / 2, 0.6, 0),
      new T.Vector3(...to),
    ]);
    const tube = new T.Mesh(
      new T.TubeGeometry(curve, 40, 0.04, 8, false),
      new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.25 })
    );
    pipeScene.add(tube);

    const pCount = 24;
    const pts = [];
    for (let i = 0; i < pCount; i++) {
      const p = new T.Mesh(
        new T.SphereGeometry(0.06, 8, 8),
        new T.MeshBasicMaterial({ color: 0xf2f7f3, transparent: true, opacity: 0 })
      );
      p.userData = { curve, offset: i / pCount, speed: 0.003 + Math.random() * 0.002 };
      pipeScene.add(p);
      pts.push(p);
    }
    flowParticles.push(...pts);
  }

  function setActiveLayer(layer) {
    activeGlow = layer;
    Object.keys(pipeNodes).forEach((k) => {
      const n = pipeNodes[k];
      const on = k === layer;
      n.glow.material.opacity = on ? 0.22 : 0;
      n.core.material.emissiveIntensity = on ? 0.65 : n.baseEmissive;
      n.ring.material.opacity = on ? 0.7 : 0.35;
      n.group.scale.setScalar(on ? 1.12 : 1);
    });
  }

  function burstFlow(fromKey, toKey) {
    const from = LAYERS[fromKey].pos;
    const to = LAYERS[toKey].pos;
    const curve = new T.CatmullRomCurve3([
      new T.Vector3(...from),
      new T.Vector3((from[0] + to[0]) / 2, 1.2, 0.5),
      new T.Vector3(...to),
    ]);
    for (let i = 0; i < 12; i++) {
      const p = new T.Mesh(
        new T.SphereGeometry(0.07, 6, 6),
        new T.MeshBasicMaterial({ color: LAYERS[toKey].color, transparent: true, opacity: 0.9 })
      );
      p.userData = { curve, offset: i / 12, speed: 0.012, burst: true, life: 80 };
      pipeScene.add(p);
      flowParticles.push(p);
    }
  }

  function initPipeline() {
    const canvas = document.getElementById("pipelineCanvas");
    if (!canvas) return;

    pipeScene = new T.Scene();
    pipeCamera = new T.PerspectiveCamera(45, 1, 0.1, 50);
    pipeCamera.position.set(0, 1.5, 7);
    pipeCamera.lookAt(0, 0, 0);
    pipeRenderer = makeRenderer(canvas, false);

    pipeScene.add(new T.AmbientLight(0xf5efdc, 0.4));
    const key = new T.DirectionalLight(0xffffff, 0.9);
    key.position.set(2, 5, 4);
    pipeScene.add(key);

    Object.keys(LAYERS).forEach((k) => makeNode(k, LAYERS[k]));
    makeFlowLine(LAYERS.saakshi.pos, LAYERS.padhavi.pos, LAYERS.saakshi.color);
    makeFlowLine(LAYERS.padhavi.pos, LAYERS.kaalam.pos, LAYERS.padhavi.color);

    const grid = new T.GridHelper(12, 20, 0x1b6b47, 0x0e3d29);
    grid.position.y = -1.2;
    grid.material.opacity = 0.18;
    grid.material.transparent = true;
    pipeScene.add(grid);

    function animatePipe(t) {
      pipeAnimId = requestAnimationFrame(animatePipe);
      const time = t * 0.001;

      Object.values(pipeNodes).forEach((n) => {
        n.ring.rotation.z = time * 0.5;
        n.core.rotation.y = time * 0.3;
        n.core.rotation.x = Math.sin(time * 0.4) * 0.1;
      });

      flowParticles = flowParticles.filter((p) => {
        const d = p.userData;
        d.offset = (d.offset + d.speed) % 1;
        const pt = d.curve.getPoint(d.offset);
        p.position.copy(pt);
        if (d.burst) {
          d.life--;
          p.material.opacity = d.life / 80;
          if (d.life <= 0) { pipeScene.remove(p); return false; }
        } else {
          p.material.opacity = activeGlow ? 0.5 + Math.sin(time * 4 + d.offset * 10) * 0.3 : 0.08;
        }
        return true;
      });

      resize(canvas, pipeRenderer, pipeCamera);
      pipeRenderer.render(pipeScene, pipeCamera);
    }
    animatePipe(0);

    canvas.addEventListener("click", (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      if (x < -0.33) document.getElementById("saakshi")?.scrollIntoView({ behavior: "smooth" });
      else if (x < 0.33) document.getElementById("padhavi")?.scrollIntoView({ behavior: "smooth" });
      else document.getElementById("kaalam")?.scrollIntoView({ behavior: "smooth" });
    });

    window.addEventListener("resize", () => resize(canvas, pipeRenderer, pipeCamera));
  }

  // ---- wire to state bus ----
  function bindState() {
    const S = global.ArivuState;
    if (!S) return;

    S.on("teach:start", () => setActiveLayer("saakshi"));
    S.on("teach:structured", () => { setActiveLayer("padhavi"); burstFlow("saakshi", "padhavi"); });
    S.on("validate:complete", () => { setActiveLayer("kaalam"); burstFlow("padhavi", "kaalam"); });
    S.on("ask:complete", () => setActiveLayer("saakshi"));
    S.on("entry:select", () => setActiveLayer("padhavi"));
    S.on("change", (partial) => {
      if (partial.activeLayer === "idle") setActiveLayer(null);
    });
  }

  function init() {
    initHero();
    initPipeline();
    bindState();
  }

  global.Arivu3D = { init, setActiveLayer, burstFlow };
  document.addEventListener("DOMContentLoaded", init);
})(window);
