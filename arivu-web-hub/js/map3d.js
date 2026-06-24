// 3D Western Ghats terrain map — corpus + sentinel markers with tribe colours.
(function (global) {
  const T = global.THREE;
  if (!T) {
    console.error("ArivuMap3D: THREE.js not loaded");
    return;
  }

  let scene, camera, renderer, animId, markerGroup, terrain;
  let canvasEl = null;
  let dragging = false;
  let lastX = 0, lastY = 0;
  let rotY = 0.5, rotX = 0.65, zoom = 16;
  let data = { corpus: [], sentinels: [] };
  let ready = false;

  const TRIBE_COLORS = [
    0x3dd68c, 0x6eb5ff, 0xe0a92e, 0xf07167, 0xc084fc, 0x38bdf8, 0xfbbf24,
  ];

  function tribeColor(name) {
    if (!name) return TRIBE_COLORS[0];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return TRIBE_COLORS[h % TRIBE_COLORS.length];
  }

  function project(lat, lng, center) {
    const scale = 380;
    const x = (lng - center.lng) * scale * Math.cos((center.lat * Math.PI) / 180);
    const z = -(lat - center.lat) * scale;
    return { x, z };
  }

  function terrainHeight(x, z) {
    return (
      Math.sin(x * 0.12) * 0.6 +
      Math.cos(z * 0.1) * 0.5 +
      Math.sin((x + z) * 0.08) * 0.8 +
      Math.exp(-((x * x) / 80 + (z + 2) * (z + 2) / 40)) * 1.8
    );
  }

  function getCenter(points) {
    if (!points.length) return { lat: 11.6854, lng: 76.132 };
    return {
      lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
      lng: points.reduce((s, p) => s + p.lng, 0) / points.length,
    };
  }

  function validCoord(lat, lng) {
    return lat != null && lng != null && !(lat === 0 && lng === 0) &&
      lat >= 8 && lat <= 35 && lng >= 68 && lng <= 98;
  }

  function buildScene() {
    scene = new T.Scene();
    scene.background = new T.Color(0x0a0e0c);
    scene.fog = new T.FogExp2(0x0a0e0c, 0.028);

    camera = new T.PerspectiveCamera(50, 1, 0.1, 300);

    const dir = new T.DirectionalLight(0xffffff, 1.2);
    dir.position.set(8, 14, 10);
    scene.add(dir);
    scene.add(new T.AmbientLight(0x4a6b55, 0.65));

    const geo = new T.PlaneGeometry(30, 22, 72, 52);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      pos.setZ(i, terrainHeight(x, y));
    }
    geo.computeVertexNormals();

    terrain = new T.Mesh(
      geo,
      new T.MeshStandardMaterial({
        color: 0x1a5c38,
        emissive: 0x0c2818,
        emissiveIntensity: 0.35,
        roughness: 0.82,
        flatShading: true,
      })
    );
    terrain.rotation.x = -Math.PI / 2;
    terrain.position.y = -0.6;
    scene.add(terrain);

    const grid = new T.GridHelper(30, 30, 0x2a4034, 0x1a2820);
    grid.position.y = -0.58;
    scene.add(grid);

    markerGroup = new T.Group();
    scene.add(markerGroup);
  }

  function addMarker(group, x, y, z, color, h) {
    const mesh = new T.Mesh(
      new T.CylinderGeometry(0.14, 0.2, h, 10),
      new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.45 })
    );
    mesh.position.set(x, y + h / 2, z);
    group.add(mesh);
  }

  function addSentinel(group, x, y, z) {
    const box = new T.Mesh(
      new T.BoxGeometry(0.4, 0.55, 0.4),
      new T.MeshStandardMaterial({ color: 0xe0a92e, emissive: 0x604000, emissiveIntensity: 0.5 })
    );
    box.position.set(x, y + 0.4, z);
    group.add(box);
  }

  function rebuildMarkers() {
    if (!markerGroup) return;
    while (markerGroup.children.length) markerGroup.remove(markerGroup.children[0]);

    const pts = [];
    data.corpus.forEach((e) => {
      const lat = e.lat != null ? e.lat : e.latitude;
      const lng = e.lng != null ? e.lng : e.longitude;
      if (validCoord(lat, lng)) pts.push({ lat, lng });
    });
    data.sentinels.forEach((s) => {
      if (validCoord(s.lat, s.lng)) pts.push({ lat: s.lat, lng: s.lng });
    });

    const center = getCenter(pts.length ? pts : [{ lat: 11.6854, lng: 76.132 }]);

    data.corpus.forEach((e) => {
      const lat = e.lat != null ? e.lat : e.latitude;
      const lng = e.lng != null ? e.lng : e.longitude;
      if (!validCoord(lat, lng)) return;
      const { x, z } = project(lat, lng, center);
      const y = terrainHeight(x, z);
      addMarker(markerGroup, x, y, z, tribeColor(e.tribe), 0.7);
    });

    data.sentinels.forEach((s) => {
      if (!validCoord(s.lat, s.lng)) return;
      const { x, z } = project(s.lat, s.lng, center);
      const y = terrainHeight(x, z);
      addSentinel(markerGroup, x, y, z);
    });
  }

  function getSize(canvas) {
    const parent = canvas.parentElement;
    let w = parent ? parent.clientWidth : 800;
    let h = parent ? parent.clientHeight : 520;
    if (h < 200) h = Math.max(480, window.innerHeight - 220);
    if (w < 200) w = parent ? parent.offsetWidth : 800;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    return { w, h };
  }

  function bindControls(canvas) {
    if (canvas._arivuBound) return;
    canvas._arivuBound = true;
    canvas.addEventListener("mousedown", (e) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    });
    window.addEventListener("mouseup", () => { dragging = false; });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      rotY += (e.clientX - lastX) * 0.006;
      rotX = Math.max(0.25, Math.min(1.3, rotX + (e.clientY - lastY) * 0.005));
      lastX = e.clientX;
      lastY = e.clientY;
    });
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      zoom = Math.max(8, Math.min(28, zoom + e.deltaY * 0.025));
    }, { passive: false });
  }

  function resize(canvas) {
    if (!canvas || !renderer || !camera) return false;
    const { w, h } = getSize(canvas);
    if (w < 50 || h < 50) return false;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    return true;
  }

  function animate() {
    if (animId) cancelAnimationFrame(animId);
    const loop = () => {
      animId = requestAnimationFrame(loop);
      if (!camera || !renderer || !scene) return;
      camera.position.x = Math.sin(rotY) * zoom;
      camera.position.z = Math.cos(rotY) * zoom;
      camera.position.y = Math.sin(rotX) * zoom;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    };
    loop();
  }

  function init(canvas) {
    if (!canvas) return false;
    canvasEl = canvas;

    if (!ready) {
      try {
        buildScene();
        renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
        bindControls(canvas);
        ready = true;
      } catch (err) {
        console.error("ArivuMap3D WebGL failed:", err);
        return false;
      }
      animate();
    }

    return resize(canvas);
  }

  function show(canvas) {
    if (!init(canvas)) {
      requestAnimationFrame(() => {
        init(canvas);
        update(data.corpus, data.sentinels);
      });
      return;
    }
    update(data.corpus, data.sentinels);
    setTimeout(() => resize(canvas), 50);
    setTimeout(() => resize(canvas), 200);
  }

  function update(corpus, sentinels) {
    data.corpus = corpus || [];
    data.sentinels = sentinels || [];
    if (ready) rebuildMarkers();
  }

  global.ArivuMap3D = { init, show, update, resize, ready: () => ready };
})(window);
