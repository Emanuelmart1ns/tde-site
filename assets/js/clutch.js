/* ==========================================================================
   TDE — Embraiagem 3D (assets/models/clutch.glb, Draco)

   Hero (data-clutch-mode="hero") — coreografia fixada ao scroll (pin 520vh):
     00 Intro     texto à esquerda, conjunto à direita, montado
     01 Lock      a página rola sozinha, o texto sai, o conjunto centra e cresce
     02 360º      uma volta completa comandada pelo scroll (+ arrasto livre)
     03 Expandir  as peças afastam-se, etiquetas e fichas por peça
     04 Retrair   volta a montar
     05 Saída     encolhe e liberta a página
   Ao regressar de outra página do site não há pin: hero simples, botão
   Desmontar/Montar e arrasto.

   Ambient (data-clutch-mode="ambient") — montada, auto-rotação lenta.
   GLB Y-up: eixo da pilha = +Y; origens das peças em Y = 0 / 0.5 / 0.7 / 0.85.
   ========================================================================== */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

const MODEL_URL = "assets/models/clutch.glb";
const DRACO_PATH = "assets/vendor/three/libs/draco/";
const PART_NAMES = ["part_z0_disc", "part_z1_housing", "part_z2_diaphragm", "part_z3_cover"];
const PART_Y = [0, 0.5, 0.7, 0.85];          // origens no GLB (montado)
const EXPLODE_OFF = [0, 0.45, 0.95, 1.55];   // afastamento ao desmontar
const PART_R = [0.95, 1.0, 0.42, 0.74];      // raios exteriores para o proxy de hover
const CAM_Z = 6.4;

/* Fases da coreografia (progresso 0..1 dentro do pin) */
const PH = { lock: [0.08, 0.22], orbit: [0.22, 0.50], expand: [0.50, 0.68], hold: [0.68, 0.76], retract: [0.76, 0.90], exit: [0.90, 1.0] };
const LOCK_TARGET = 0.24; // onde o auto-scroll deixa a página (início do 360º)

/* Etiquetas (hero): camada, ângulo/comprimento da linha-guia, âncora local */
const LABELS = [
  { sel: '[data-part="z3"]', layer: 3, angle: -115, len: 100, anchor: [0.55, 0, 0.45] },
  { sel: '[data-part="z2"]', layer: 2, angle: 30, len: 86, anchor: [0.34, 0, -0.28] },
  { sel: '[data-part="z1"]', layer: 1, angle: 208, len: 86, anchor: [-0.75, 0, 0.3] },
  { sel: '[data-part="z0"]', layer: 0, angle: 152, len: 92, anchor: [-0.68, 0, -0.45] },
];

const PART_INFO = [
  { name: "Disco de Embraiagem", desc: "Transmite o binário do motor à caixa de velocidades. As molas de amortecimento absorvem as vibrações e protegem a transmissão." },
  { name: "Carcaça Cromada", desc: "Estrutura que une todo o conjunto ao volante do motor e aloja o círculo de parafusos de fixação." },
  { name: "Mola de Diafragma", desc: "Aplica a pressão que mantém o disco contra o volante. É ela que define o esforço do pedal de embraiagem." },
  { name: "Placa de Pressão — Race Pro 1000", desc: "Comprime o disco contra o volante para transmitir a potência. Afasta-se quando o pedal é pressionado." },
];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
/* progresso 0..1 de p dentro do intervalo [a, b], com easing suave */
const span = (p, [a, b]) => clamp((p - a) / (b - a), 0, 1);
const smooth = (t) => t * t * (3 - 2 * t);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function createClutch(canvas) {
  const mode = canvas.dataset.clutchMode || "hero";
  const isHero = mode === "hero";

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (e) {
    canvas.style.display = "none";
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 60);
  camera.position.set(0, 0, CAM_Z);

  /* --- Estúdio de reflexos: softboxes HDR sobre negro (cromado "de carro") --- */
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x020204);
  const softbox = (w, h, x, y, z, ry, rx, intensity, tint = 0xffffff) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: tint }));
    m.material.color.multiplyScalar(intensity);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, 0);
    envScene.add(m);
  };
  softbox(5, 14, -9, 2, 0, Math.PI / 2, 0, 6);
  softbox(5, 14, 9, 2, 0, -Math.PI / 2, 0, 6);
  softbox(12, 7, 0, 9, 1, 0, -Math.PI / 2.2, 5);
  softbox(11, 5, 0, -8, 4, 0, Math.PI / 3, 2.2, 0xffd9c4);   // fill inferior, levemente quente
  softbox(4, 12, 0, 3, -10, 0, 0, 4, 0xcaf6ff);               // risca traseira, levemente fria
  softbox(15, 10, 0, 1, 11, Math.PI, 0, 3.2);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;
  pmrem.dispose();

  const key = new THREE.DirectionalLight(0xffffff, 1.0);
  key.position.set(3, 4, 5);
  scene.add(key);
  const fill = new THREE.PointLight(0xeef2f8, 18, 30);
  fill.position.set(1.5, 2.5, 5.5);
  scene.add(fill);
  const rim = new THREE.PointLight(0x35e0ff, 4, 30);
  rim.position.set(-4.5, 1.5, -2.5);
  scene.add(rim);
  const ember = new THREE.PointLight(0xff5a1f, 3, 24);
  ember.position.set(3.5, -3, -1.5);
  scene.add(ember);

  const group = new THREE.Group();        // interacção (rotação/posição/escala)
  scene.add(group);
  const modelGroup = new THREE.Group();   // orientação do modelo: +Y → +Z
  modelGroup.rotation.x = Math.PI / 2;
  group.add(modelGroup);

  const loadingEl = document.createElement("div");
  loadingEl.className = "clutch-loading";
  loadingEl.textContent = "A carregar 3D…";
  (canvas.parentElement || document.body).appendChild(loadingEl);

  /* --- Carregar o GLB --- */
  const parts = [];
  const partMats = [[], [], [], []];
  const proxies = [];
  const partMin = [];
  const partMax = [];
  let modelReady = false;
  const onReady = [];

  const draco = new DRACOLoader();
  draco.setDecoderPath(DRACO_PATH);
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  loader.load(
    MODEL_URL,
    (gltf) => {
      const root = gltf.scene;
      modelGroup.add(root);
      PART_NAMES.forEach((name, i) => {
        const part = root.getObjectByName(name);
        if (!part) return;
        part.userData.spinV = 0;
        part.userData.lift = 1;
        part.traverse((o) => {
          if (!o.isMesh) return;
          o.material = o.material.clone();
          o.material.emissiveIntensity = 0; // o hover acende a partir de zero
          if (o.material.metalness > 0.85) {
            if (o.material.roughness > 0.06) o.material.roughness = 0.06;
            o.material.envMapIntensity = i === 3 ? 2.8 : 2.1;
          }
          partMats[i].push(o.material);
        });
        const proxy = new THREE.Mesh(
          new THREE.CylinderGeometry(PART_R[i], PART_R[i], 0.45, 24),
          new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true })
        );
        part.add(proxy);
        proxies.push(proxy);
        parts[i] = part;
      });
      const bb = new THREE.Box3();
      parts.forEach((p, i) => {
        if (!p) return;
        bb.setFromObject(p);
        partMin[i] = bb.min.y - p.position.y;
        partMax[i] = bb.max.y - p.position.y;
      });
      modelReady = true;
      loadingEl.remove();
      onReady.forEach((fn) => fn());
    },
    undefined,
    () => { loadingEl.textContent = "Modelo 3D indisponível"; }
  );

  /* --- Partículas (hero) --- */
  let particles = null;
  if (isHero) {
    const N = 180;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 1.7 + Math.random() * 2.6;
      const a = Math.random() * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = Math.sin(a) * r * 0.6;
      pos[i * 3 + 2] = -1 - Math.random() * 2.6;
    }
    const pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    particles = new THREE.Points(pgeo, new THREE.PointsMaterial({
      color: 0x35e0ff, size: 0.024, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    scene.add(particles);
  }

  /* --- Elementos DOM do hero --- */
  const heroPin = isHero ? canvas.closest(".hero-pin") : null;
  const heroEl = isHero ? canvas.closest(".hero") : null;
  const q = (sel) => (heroEl ? heroEl.querySelector(sel) : null);
  const heroContent = q(".hero-content");
  const hud = q(".hero-hud");
  const hudStages = hud ? Array.from(hud.querySelectorAll(".hud-stages span")) : [];
  const readRot = q("[data-read='rot']");
  const readExp = q("[data-read='exp']");
  const caption = q(".hero-caption");
  const captionLabel = caption ? caption.querySelector(".mono") : null;
  const captionText = caption ? caption.querySelector("p") : null;
  const scrollHint = q(".hero-scroll-hint");
  const toggleBtn = q("#explode-toggle");
  const toggleTxt = toggleBtn ? toggleBtn.querySelector(".txt") : null;

  const CAPTIONS = [
    ["01 — Vista 360º", "Arraste para rodar. Cada peça é modelada em 3D real."],
    ["02 — Desmontagem", "Passe o rato sobre uma peça para conhecer a sua função."],
    ["03 — Montagem", "Recuperada, verificada e montada com garantia TDE."],
  ];

  /* A animação de pin corre na primeira chegada e em reloads; não corre ao
     voltar de outra página do site nem via botão voltar/avançar. */
  function shouldPin() {
    if (!isHero || !heroPin || reducedMotion) return false;
    const nav = performance.getEntriesByType("navigation")[0];
    const navType = nav ? nav.type : "navigate";
    if (navType === "reload") return true;
    if (navType === "back_forward") return false;
    try {
      return !(document.referrer && new URL(document.referrer).origin === location.origin);
    } catch (e) { return true; }
  }
  const pinActive = shouldPin();
  if (isHero && !pinActive && heroPin) {
    heroPin.classList.add("no-pin");
    if (scrollHint) scrollHint.style.display = "none";
  }

  /* --- Entrada de câmara (hero): plano picado e próximo que recua e
     endireita até à pose de repouso, nos primeiros ~2 s --- */
  const ENTRANCE_DUR = 2.1;
  let entranceT0 = -1;        // instante em que o modelo ficou pronto
  let entrance = (isHero && !reducedMotion) ? 0 : 1;
  const camTarget = new THREE.Vector3();
  if (isHero && !reducedMotion) onReady.push(() => { entranceT0 = clock.getElapsedTime(); });

  /* --- Estado --- */
  let progress = 0;           // progresso do pin (função pura do scrollY)
  let explode = 0;            // suavizado
  let manualExplode = 0;      // modo sem pin
  const rot = { x: 0, y: 0 }; // rotação do utilizador (arrasto)
  const vel = { x: 0, y: 0 };
  let dragging = false;
  let lastPointer = { x: 0, y: 0 };
  let lastInteract = -10;
  let running = true;
  let onScreen = true;
  const clock = new THREE.Clock();

  function pinProgress() {
    if (!heroPin || !pinActive) return 0;
    const range = heroPin.offsetHeight - window.innerHeight;
    if (range <= 0) return 0;
    return clamp((window.scrollY - heroPin.offsetTop) / range, 0, 1);
  }
  function scrollForProgress(p) {
    const range = heroPin.offsetHeight - window.innerHeight;
    return heroPin.offsetTop + p * range;
  }
  if (pinActive) {
    const onScroll = () => { progress = pinProgress(); };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* --- Auto-scroll de entrada: rola até ao início do 360º e "fixa" no objecto --- */
  let userScrolled = false;
  let autoTween = null;
  const cancelAuto = () => { userScrolled = true; autoTween = null; };
  if (pinActive) {
    ["wheel", "touchstart", "keydown", "pointerdown"].forEach((ev) =>
      window.addEventListener(ev, cancelAuto, { passive: true, once: true })
    );
    const startAuto = () => {
      if (userScrolled || window.scrollY > 40) return;
      const from = window.scrollY;
      const to = scrollForProgress(LOCK_TARGET);
      const t0 = performance.now();
      const dur = 2200;
      let lastSet = from;
      autoTween = (now) => {
        if (userScrolled) return;
        /* alguém (utilizador, browser) moveu a página entretanto: desistir */
        if (Math.abs(window.scrollY - lastSet) > 2) { cancelAuto(); return; }
        const t = clamp((now - t0) / dur, 0, 1);
        lastSet = lerp(from, to, easeInOut(t));
        window.scrollTo({ top: lastSet, behavior: "instant" });
        lastSet = window.scrollY;
        if (t < 1) requestAnimationFrame(autoTween);
        else autoTween = null;
      };
      requestAnimationFrame(autoTween);
    };
    let started = false;
    const kick = () => { if (started) return; started = true; setTimeout(startAuto, reducedMotion ? 600 : ENTRANCE_DUR * 1000 + 500); };
    onReady.push(kick);
    setTimeout(kick, 4000); // rede lenta: avança na mesma
  }

  /* Botão Desmontar/Montar */
  if (toggleBtn && heroPin) {
    toggleBtn.addEventListener("click", () => {
      cancelAuto();
      if (pinActive) {
        const dest = progress > PH.expand[0] && progress < PH.retract[1] ? scrollForProgress(PH.retract[1] + 0.02) : scrollForProgress(PH.hold[0] + 0.02);
        window.scrollTo({ top: dest, behavior: "smooth" });
      } else {
        manualExplode = manualExplode > 0.5 ? 0 : 1;
        if (toggleTxt) toggleTxt.textContent = manualExplode > 0.5 ? "Montar" : "Desmontar";
      }
    });
  }

  /* --- Hover por peça --- */
  const raycaster = new THREE.Raycaster();
  const pointerNDC = new THREE.Vector2();
  let pointerActive = false;
  let hoverIdx = -1;
  let tapIdx = -1;
  let downPos = null;
  const pointerClient = { x: 0, y: 0 };

  const card = isHero ? document.createElement("div") : null;
  if (card) {
    card.className = "part-card";
    card.innerHTML = '<span class="pc-name"></span><p class="pc-desc"></p>';
    (heroEl || document.body).appendChild(card);
  }
  function setCard(i, x, y) {
    if (!card) return;
    if (i < 0) { card.classList.remove("on"); return; }
    card.querySelector(".pc-name").textContent = PART_INFO[i].name;
    card.querySelector(".pc-desc").textContent = PART_INFO[i].desc;
    card.style.left = Math.min(x + 22, window.innerWidth - 300) + "px";
    card.style.top = Math.max(y - 96, 12) + "px";
    card.classList.add("on");
  }

  /* --- Etiquetas --- */
  const labelEls = isHero
    ? LABELS.map((cfg) => {
        const el = document.querySelector(cfg.sel);
        if (!el) return null;
        el.style.setProperty("--llen", cfg.len + "px");
        el.style.setProperty("--lang", cfg.angle + "deg");
        const chip = el.querySelector(".chip");
        const rad = (cfg.angle * Math.PI) / 180;
        chip.style.transform = `translate(${Math.cos(rad) * cfg.len}px, ${-Math.sin(rad) * cfg.len}px) translate(-50%, -50%)`;
        return { el, ...cfg };
      }).filter(Boolean)
    : [];

  /* --- Arrastar para rodar --- */
  if (isHero) {
    canvas.style.touchAction = "pan-y";
    canvas.style.cursor = "grab";
    const updateNDC = (e) => {
      pointerActive = true;
      const r = canvas.getBoundingClientRect();
      pointerNDC.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointerNDC.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      pointerClient.x = e.clientX;
      pointerClient.y = e.clientY;
    };
    canvas.addEventListener("pointerdown", (e) => {
      dragging = true;
      downPos = { x: e.clientX, y: e.clientY, type: e.pointerType };
      lastPointer = { x: e.clientX, y: e.clientY };
      vel.x = vel.y = 0;
      canvas.style.cursor = "grabbing";
      document.body.classList.add("cursor-drag");
      canvas.setPointerCapture(e.pointerId);
      lastInteract = clock.getElapsedTime();
      updateNDC(e);
    });
    canvas.addEventListener("pointermove", (e) => {
      updateNDC(e);
      if (!dragging) return;
      const dx = e.clientX - lastPointer.x;
      const dy = e.clientY - lastPointer.y;
      lastPointer = { x: e.clientX, y: e.clientY };
      const xClamp = 0.8 + explode * 0.35;
      rot.y += dx * 0.006;
      rot.x = clamp(rot.x + dy * 0.006, -xClamp, xClamp);
      vel.y = dx * 0.006;
      vel.x = dy * 0.006;
      lastInteract = clock.getElapsedTime();
    });
    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      canvas.style.cursor = "grab";
      document.body.classList.remove("cursor-drag");
      lastInteract = clock.getElapsedTime();
      if (e && downPos && downPos.type === "touch" &&
          Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) < 10 && explode > 0.6 && modelReady) {
        updateNDC(e);
        raycaster.setFromCamera(pointerNDC, camera);
        const hit = raycaster.intersectObjects(proxies, false)[0];
        tapIdx = hit ? proxies.indexOf(hit.object) : -1;
        if (tapIdx === -1) setCard(-1);
      }
      downPos = null;
    };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener("pointerleave", () => { pointerActive = false; hoverIdx = -1; if (tapIdx < 0) setCard(-1); });
  }

  /* --- Pausar fora do ecrã / separador oculto --- */
  new IntersectionObserver((entries) => { onScreen = entries[0].isIntersecting; }, { threshold: 0.02 }).observe(canvas);
  document.addEventListener("visibilitychange", () => {
    running = !document.hidden;
    if (running) clock.getDelta();
  });

  /* --- Redimensionamento --- */
  let baseX = 0;
  let baseY = 0;
  let baseScale = 1;
  let wide = true;
  function resize() {
    const w = canvas.clientWidth || canvas.parentElement.clientWidth;
    const h = canvas.clientHeight || canvas.parentElement.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const halfW = Math.tan((camera.fov * Math.PI) / 360) * CAM_Z * camera.aspect;
    wide = camera.aspect > 1.02;
    if (isHero) {
      baseX = wide ? halfW * 0.4 : 0;
      baseY = wide ? 0 : 1.3;      // estreito: acima do título
      baseScale = wide ? 1 : 0.55;
    } else {
      /* Cabeçalho interior: à direita em ecrãs largos; em ecrãs estreitos
         sobe para não ficar por baixo do título (alinhado ao fundo) */
      baseX = camera.aspect > 1.2 ? halfW * 0.48 : halfW * 0.3;
      baseY = camera.aspect > 1.2 ? 0 : 1.15;
      baseScale = camera.aspect > 1.2 ? 1.05 : 0.62;
    }
  }
  window.addEventListener("resize", resize);
  resize();

  const v = new THREE.Vector3();
  const facing = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  let lastStage = -1;
  let lastCaption = -1;

  function setVar(el, name, val) { if (el) el.style.setProperty(name, val); }
  function setStage(i) {
    if (i === lastStage) return;
    lastStage = i;
    hudStages.forEach((s, k) => s.classList.toggle("on", k === i));
  }
  function setCaption(i) {
    if (i === lastCaption) return;
    lastCaption = i;
    if (i >= 0 && captionLabel && captionText) {
      captionLabel.textContent = CAPTIONS[i][0];
      captionText.textContent = CAPTIONS[i][1];
    }
    setVar(heroEl, "--cap-o", i >= 0 ? "1" : "0");
  }

  /* --- Coreografia do hero: devolve o alvo de cada parâmetro para o progresso p --- */
  function choreo(p) {
    const lock = smooth(span(p, PH.lock));
    const orbit = span(p, PH.orbit);
    const expand = smooth(span(p, PH.expand));
    const retract = smooth(span(p, PH.retract));
    const exit = smooth(span(p, PH.exit));

    const explodeT = p < PH.retract[0] ? expand : 1 - retract;
    const centre = lock * (1 - exit);                  // 0 = lateral, 1 = centrado
    const scale = lerp(1, wide ? 1.32 : 1.15, lock) * lerp(1, 0.55, exit);
    const yaw = easeInOut(orbit) * Math.PI * 2;        // volta completa comandada pelo scroll
    const opacity = 1 - exit;
    const liftY = exit * 1.6;                          // sobe ao sair

    let stage = 0;
    if (p >= PH.exit[0]) stage = 3;
    else if (p >= PH.retract[0]) stage = 3;
    else if (p >= PH.expand[0]) stage = 2;
    else if (p >= PH.lock[1] - 0.04) stage = 1;

    let cap = -1;
    if (p > PH.orbit[0] + 0.02 && p < PH.orbit[1] - 0.04) cap = 0;
    else if (p > PH.expand[0] + 0.06 && p < PH.retract[0] + 0.02) cap = 1;
    else if (p > PH.retract[0] + 0.06 && p < PH.exit[0] + 0.02) cap = 2;

    return { explodeT, centre, scale, yaw, opacity, liftY, stage, cap, lock, orbit, exit };
  }

  function frame() {
    requestAnimationFrame(frame);
    if (!running || !onScreen) return;
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;

    /* Entrada: easing out-quint entre a pose de câmara inicial e a final */
    if (entrance < 1 && entranceT0 >= 0) {
      const e = clamp((t - entranceT0) / ENTRANCE_DUR, 0, 1);
      entrance = 1 - Math.pow(1 - e, 5);
    }
    const ent = 1 - entrance; // 1 no arranque, 0 em repouso
    camera.fov = lerp(35, 62, ent);
    camera.position.set(lerp(0, 2.6, ent), lerp(0, -1.9, ent), lerp(CAM_Z, 3.1, ent));
    camera.updateProjectionMatrix();
    camTarget.set(lerp(0, baseX, ent), lerp(0, baseY, ent), 0);
    camera.lookAt(camTarget);

    let target = 0;
    let c = null;
    if (isHero) {
      if (pinActive) { c = choreo(progress); target = c.explodeT; }
      else target = manualExplode;
    }
    explode += (target - explode) * (1 - Math.exp(-dt * 9));
    if (Math.abs(target - explode) < 0.0005) explode = target;
    canvas.dataset.explode = explode.toFixed(3);

    if (modelReady) {
      const lo = PART_Y[0] + explode * EXPLODE_OFF[0] + (partMin[0] || 0);
      const hi = PART_Y[3] + explode * EXPLODE_OFF[3] + (partMax[3] || 0);
      const mid = (lo + hi) / 2;
      parts.forEach((p, i) => { if (p) p.position.y = PART_Y[i] + explode * EXPLODE_OFF[i] - mid; });
    }

    /* Rotação do utilizador: arrasto + inércia; auto-rotação lenta em repouso */
    if (isHero) {
      if (!dragging) {
        const xClamp = 0.8 + explode * 0.35;
        rot.y += vel.y;
        rot.x = clamp(rot.x + vel.x, -xClamp, xClamp);
        vel.x *= 0.94;
        vel.y *= 0.94;
        const orbiting = c && c.orbit > 0 && c.orbit < 1;
        if (!orbiting && t - lastInteract > 2.5 && hoverIdx < 0 && tapIdx < 0) rot.y += 0.0018;
      }
    } else {
      rot.y += 0.0022;
      rot.x = Math.sin(t * 0.3) * 0.06;
    }

    if (c) {
      /* Coreografia por scroll */
      const pitchIntro = wide ? 0.32 : 0.2;       // vista 3/4 na intro; frontal no lock
      /* Desmontada: vista a ~50º para a pilha se ler de lado, e mais pequena
         para caber com as peças afastadas ao longo do eixo */
      group.rotation.x = lerp(pitchIntro, 0.06, c.lock) + rot.x + explode * 0.14 + Math.sin(c.orbit * Math.PI) * 0.35 + ent * 0.55;
      group.rotation.y = lerp(-0.55, 0, c.lock) + c.yaw + rot.y + explode * 0.9 - ent * 1.4;
      group.position.x = baseX * (1 - c.centre) + explode * (wide ? 0.25 : 0);
      group.position.y = baseY * (1 - c.centre) + Math.sin(t * 0.75) * 0.05 + c.liftY + explode * 0.12;
      group.scale.setScalar(baseScale * c.scale * (1 + Math.sin(t * 0.55) * 0.012) * (1 - explode * 0.4));
      canvas.style.opacity = c.opacity.toFixed(3);

      const contentO = clamp(1 - c.lock * 1.6, 0, 1);
      if (heroContent) {
        heroContent.style.opacity = contentO.toFixed(3);
        heroContent.style.transform = `translate3d(${(-c.lock * 60).toFixed(1)}px, 0, 0)`;
        heroContent.style.pointerEvents = contentO < 0.15 ? "none" : "";
      }
      setVar(heroEl, "--veil-o", contentO.toFixed(3));
      setVar(heroEl, "--ring-o", (c.lock * (1 - c.exit) * 0.9).toFixed(3));
      setVar(heroEl, "--ring-s", lerp(0.6, 1, c.lock).toFixed(3));
      setVar(heroEl, "--hud-o", (c.lock * (1 - c.exit)).toFixed(3));
      setVar(heroEl, "--hud-p", clamp((progress - PH.lock[1]) / (PH.exit[0] - PH.lock[1]), 0, 1).toFixed(3));
      setVar(heroEl, "--hint-o", clamp(1 - c.lock * 4, 0, 1).toFixed(3));
      setStage(c.lock > 0.5 ? c.stage : 0);
      setCaption(c.cap);
      if (readRot) {
        const deg = ((((group.rotation.y % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) * 180) / Math.PI;
        readRot.textContent = String(Math.round(deg)).padStart(3, "0") + "°";
      }
      if (readExp) readExp.textContent = String(Math.round(explode * 100)).padStart(3, "0") + "%";
      if (toggleTxt) toggleTxt.textContent = explode > 0.5 ? "Montar" : "Desmontar";
    } else if (isHero) {
      /* Sem pin: pose lateral estável, botão e arrasto */
      group.rotation.x = 0.28 + rot.x + explode * 0.08 + ent * 0.55;
      group.rotation.y = -0.5 + rot.y + explode * 0.42 - ent * 1.4;
      group.position.x = baseX * (1 - explode * 0.85);
      group.position.y = baseY + Math.sin(t * 0.75) * 0.05 + explode * 0.25;
      group.scale.setScalar(baseScale * (1 + Math.sin(t * 0.55) * 0.012) * (1 - explode * 0.2));
      const contentO = clamp(1 - explode * 1.9, 0, 1);
      if (heroContent) {
        heroContent.style.opacity = contentO.toFixed(3);
        heroContent.style.transform = `translate3d(${(-explode * 60).toFixed(1)}px, 0, 0)`;
        heroContent.style.pointerEvents = contentO < 0.15 ? "none" : "";
      }
      setVar(heroEl, "--veil-o", contentO.toFixed(3));
    } else {
      group.rotation.x = 0.18 + rot.x;
      group.rotation.y = rot.y;
      group.position.set(baseX, baseY + Math.sin(t * 0.75) * 0.05, 0);
      group.scale.setScalar(baseScale * (1 + Math.sin(t * 0.55) * 0.012));
    }

    if (particles) particles.rotation.z = t * 0.03;

    /* --- Hover por peça (explodido, sem arrastar) --- */
    let selected = -1;
    if (isHero && modelReady && explode > 0.6) {
      if (!dragging && pointerActive) {
        raycaster.setFromCamera(pointerNDC, camera);
        const hit = raycaster.intersectObjects(proxies, false)[0];
        hoverIdx = hit ? proxies.indexOf(hit.object) : -1;
      }
      selected = tapIdx >= 0 ? tapIdx : hoverIdx;
      parts.forEach((p, i) => {
        if (!p) return;
        const on = i === selected;
        p.userData.spinV += ((on ? 0.02 : 0) - p.userData.spinV) * 0.06;
        p.rotation.y += p.userData.spinV;
        p.userData.lift += ((on ? 1.05 : 1) - p.userData.lift) * 0.1;
        p.scale.setScalar(p.userData.lift);
        const eTarget = on ? 0.16 : 0;
        partMats[i].forEach((m) => {
          m.emissive.setHex(0x35e0ff);
          m.emissiveIntensity += (eTarget - m.emissiveIntensity) * 0.12;
        });
      });
      if (!dragging) canvas.style.cursor = selected >= 0 ? "pointer" : "grab";
      document.body.classList.toggle("cursor-hover", selected >= 0);
      if (selected >= 0) setCard(selected, pointerClient.x, pointerClient.y);
      else if (tapIdx < 0) setCard(-1);
    } else if (isHero) {
      if (hoverIdx >= 0 || tapIdx >= 0) { hoverIdx = -1; tapIdx = -1; setCard(-1); document.body.classList.remove("cursor-hover"); }
      if (modelReady) {
        parts.forEach((p, i) => {
          if (!p) return;
          p.userData.spinV += (0 - p.userData.spinV) * 0.06;
          p.rotation.y += p.userData.spinV;
          p.userData.lift += (1 - p.userData.lift) * 0.1;
          p.scale.setScalar(p.userData.lift);
          partMats[i].forEach((m) => { m.emissiveIntensity *= 0.9; });
        });
      }
    }

    /* Etiquetas projectadas (escondidas quando a peça está de costas) */
    if (isHero && labelEls.length && modelReady) {
      const w = renderer.domElement.clientWidth;
      const h = renderer.domElement.clientHeight;
      const labelAlpha = clamp((explode - 0.6) / 0.15, 0, 1) * (c ? c.opacity : 1);
      group.updateMatrixWorld();
      labelEls.forEach(({ el, layer, anchor }) => {
        const part = parts[layer];
        if (!part) return;
        part.localToWorld(v.set(anchor[0], anchor[1], anchor[2])).project(camera);
        const x = (v.x * 0.5 + 0.5) * w;
        const y = (-v.y * 0.5 + 0.5) * h;
        facing.set(0, 1, 0).applyQuaternion(part.getWorldQuaternion(quat));
        const front = clamp(facing.z * 1.6, 0, 1);
        el.style.transform = `translate(${x}px, ${y}px)`;
        el.style.opacity = (labelAlpha * front).toFixed(3);
      });
    }

    renderer.render(scene, camera);
  }
  frame();
}

document.querySelectorAll("canvas[data-clutch-mode]").forEach(createClutch);
