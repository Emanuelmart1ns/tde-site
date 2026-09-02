/* ==========================================================================
   TDE — Embraiagem 3D (assemblagem real com espessura)
   - Hero (data-clutch-mode="hero"): explode fixado ao scroll (pin 350vh),
     rotação por arrasto com inércia, etiquetas projectadas.
   - Ambiente (data-clutch-mode="ambient"): montada, auto-rotação lenta.
   ========================================================================== */

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/* Cada camada: textura (face frontal) + corpo cilíndrico cromado.
   Texturas "-flat": rectificadas para vista PURAMENTE FRONTAL, centradas em
   512,512 no canvas 1024². Raios dos corpos = raio real da textura:
   z0 397px, z1 422px, z2 175px, z3 313px (z1 = unidade 1.0).
   d = espessura, rBack = raio traseiro (cone suave). */
const PARTS = [
  { tex: "assets/img/layer-z0-flat.png", r: 0.94, d: 0.55, rBack: 0.94 },  // disco base
  { tex: "assets/img/layer-z1-flat.png", r: 1.0, d: 0.35, rBack: 1.0 },
  { tex: "assets/img/layer-z2-flat.png", r: 0.415, d: 0.25, rBack: 0.5 },
  { tex: "assets/img/layer-z3-flat.png", r: 0.74, d: 0.2, rBack: 0.74 },
];
/* Plano da face: textura 1024² completa, de extremo a extremo — preserva o
   alinhamento entre camadas. Metade do plano = 512px equivale ao raio de z1. */
const FACE_SIZE = 2 * (512 / 422);
const ASSEMBLE_STEP = 0.035; // folga mínima quando montado
const EXPLODE_GAP = 1.05;    // afastamento por camada ao desmontar
const CAM_Z = 6.4;

/* Etiquetas (hero): camada, ângulo/comprimento da linha-guia, âncora local. */
const LABELS = [
  { sel: '[data-part="z3"]', layer: 3, angle: -115, len: 100, anchor: [0.45, 0.78] },
  { sel: '[data-part="z2"]', layer: 2, angle: 30, len: 86, anchor: [0.85, -0.45] },
  { sel: '[data-part="z1"]', layer: 1, angle: 208, len: 86, anchor: [-0.85, 0.3] },
  { sel: '[data-part="z0"]', layer: 0, angle: 152, len: 92, anchor: [-0.72, -0.55] },
];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function createClutch(canvas) {
  const mode = canvas.dataset.clutchMode || "hero";
  const isHero = mode === "hero";

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (e) {
    canvas.style.display = "none";
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 60);
  camera.position.set(0, 0, CAM_Z);

  /* --- Ambiente (reflexos cromados) sem ficheiros externos --- */
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  /* Luzes subtis para modelar o cromado */
  const key = new THREE.DirectionalLight(0xffffff, 0.7);
  key.position.set(3, 4, 5);
  scene.add(key);
  const rim = new THREE.PointLight(0x22d3ee, 14, 30);
  rim.position.set(-4.5, 1.5, -2.5);
  scene.add(rim);

  const group = new THREE.Group();
  scene.add(group);

  /* --- Construir as 4 peças --- */
  const loader = new THREE.TextureLoader();
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xb9c0cb,
    metalness: 1,
    roughness: 0.22,
    envMapIntensity: 1.1,
    side: THREE.DoubleSide,
  });
  const parts = [];
  PARTS.forEach((cfg, i) => {
    const part = new THREE.Group();

    // Corpo: cilindro aberto com o eixo ao longo da vista (z) — as zonas
    // transparentes das faces deixam ver as camadas atrás (como no conjunto real)
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(cfg.r, cfg.rBack, cfg.d, 96, 1, true),
      chromeMat
    );
    body.rotation.x = Math.PI / 2;
    body.position.z = -(cfg.d / 2 + 0.004);
    part.add(body);

    // Face: plano com a textura fotográfica transparente (visível dos dois lados)
    const tex = loader.load(cfg.tex);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(FACE_SIZE, FACE_SIZE),
      new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        alphaTest: 0.02,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
      })
    );
    face.renderOrder = 10 + i;
    part.add(face);

    group.add(part);
    parts.push(part);
  });

  /* --- Anel cianeto + partículas para profundidade --- */
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.95, 0.006, 8, 160),
    new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: isHero ? 0.22 : 0.14,
    })
  );
  ring.position.z = -1.3;
  ring.rotation.x = Math.PI * 0.42;
  scene.add(ring);

  let particles = null;
  if (isHero) {
    const N = 160;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 1.7 + Math.random() * 2.4;
      const a = Math.random() * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = Math.sin(a) * r * 0.55;
      pos[i * 3 + 2] = -1 - Math.random() * 2.6;
    }
    const pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    particles = new THREE.Points(
      pgeo,
      new THREE.PointsMaterial({
        color: 0x22d3ee,
        size: 0.024,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    scene.add(particles);
  }

  /* --- Estado --- */
  let explode = 0;            // valor suavizado
  let scrollTarget = 0;       // função pura de scrollY (modo pin)
  let manualExplode = 0;      // alvo do botão no modo sem pin
  let wheelExplode = 0;       // alvo definido pela roda durante arrasto
  let wheelOverride = false;  // roda durante arrasto ignora o scroll

  /* A animação de pin corre na primeira chegada ao home e em reloads (F5 /
     hard refresh). Não corre quando se volta de outra página do site
     (referrer same-origin) ou via botão voltar/avançar. Sem sessionStorage:
     este sobrevive a hard refreshes e impedia a animação para sempre. */
  function shouldPin() {
    if (!isHero) return false;
    const navEntries = performance.getEntriesByType("navigation");
    const navType = navEntries.length ? navEntries[0].type : "navigate";
    if (navType === "reload") return true;
    if (navType === "back_forward") return false;
    try {
      return !(document.referrer &&
        new URL(document.referrer).origin === location.origin);
    } catch (e) { return true; }
  }
  const pinActive = shouldPin();

  const rot = { x: 0, y: 0 }; // pose de repouso frontal (texturas rectificadas)
  const vel = { x: 0, y: 0 };
  let dragging = false;
  let lastPointer = { x: 0, y: 0 };
  let lastInteract = -10;
  let running = true;
  let onScreen = true;
  const clock = new THREE.Clock();

  /* --- Etiquetas (hero) --- */
  const labelEls = isHero
    ? LABELS.map((cfg) => {
        const el = document.querySelector(cfg.sel);
        if (!el) return null;
        el.style.setProperty("--llen", cfg.len + "px");
        el.style.setProperty("--lang", cfg.angle + "deg");
        const chip = el.querySelector(".chip");
        const rad = (cfg.angle * Math.PI) / 180;
        chip.style.transform =
          `translate(${Math.cos(rad) * cfg.len}px, ${-Math.sin(rad) * cfg.len}px) translate(-50%, -50%)`;
        return { el, ...cfg };
      }).filter(Boolean)
    : [];

  /* --- Elementos do hero que reagem ao progresso --- */
  const heroPin = isHero ? canvas.closest(".hero-pin") : null;
  const heroContent = isHero ? document.querySelector(".hero-content") : null;
  const heroEl = isHero ? canvas.closest(".hero") : null;
  const scrollHint = isHero ? document.querySelector(".hero-scroll-hint") : null;
  const toggleBtn = isHero ? document.getElementById("explode-toggle") : null;
  const toggleTxt = toggleBtn ? toggleBtn.querySelector(".txt") : null;

  /* Modo sem pin (regresso de outra página do site): colapsar a zona de 350vh */
  if (isHero && !pinActive && heroPin) {
    heroPin.classList.add("no-pin");
    if (scrollHint) scrollHint.style.display = "none";
  }

  /* --- Explode fixado ao scroll (função pura de scrollY) --- */
  function pinProgress() {
    if (!heroPin || !pinActive) return 0;
    const range = heroPin.offsetHeight - window.innerHeight;
    if (range <= 0) return 0;
    return clamp((window.scrollY - heroPin.offsetTop) / range, 0, 1);
  }
  if (pinActive) {
    const onScroll = () => {
      scrollTarget = pinProgress();
      if (toggleTxt) toggleTxt.textContent = scrollTarget > 0.5 ? "Montar" : "Desmontar";
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* Botão: pin → atalho para início/fim da zona; sem pin → tween directo */
  if (toggleBtn && heroPin) {
    toggleBtn.addEventListener("click", () => {
      if (pinActive) {
        const end = heroPin.offsetTop + heroPin.offsetHeight - window.innerHeight;
        const dest = pinProgress() > 0.5 ? heroPin.offsetTop : end;
        window.scrollTo({ top: dest, behavior: "smooth" });
      } else {
        manualExplode = manualExplode > 0.5 ? 0 : 1;
        if (toggleTxt) toggleTxt.textContent = manualExplode > 0.5 ? "Montar" : "Desmontar";
      }
    });
  }

  /* --- Arrastar para rodar (não interfere com o scroll vertical) --- */
  if (isHero) {
    canvas.style.touchAction = "pan-y";
    canvas.style.cursor = "grab";
    canvas.addEventListener("pointerdown", (e) => {
      dragging = true;
      lastPointer = { x: e.clientX, y: e.clientY };
      vel.x = vel.y = 0;
      wheelOverride = false;
      wheelExplode = pinActive ? scrollTarget : manualExplode;
      canvas.style.cursor = "grabbing";
      canvas.setPointerCapture(e.pointerId);
      lastInteract = clock.getElapsedTime();
    });
    canvas.addEventListener("pointermove", (e) => {
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
    /* Durante o arrasto, a roda expande/recolhe a assemblagem directamente.
       Handler a nível da janela (capture): alguns eventos wheel durante um
       gesto activo não chegam ao canvas, mas têm de ser cancelados na mesma. */
    window.addEventListener(
      "wheel",
      (e) => {
        if (!dragging) return; // fora do arrasto, a página rola normalmente
        e.preventDefault();
        wheelOverride = true;
        wheelExplode = clamp(wheelExplode + e.deltaY * 0.0012, 0, 1);
        lastInteract = clock.getElapsedTime();
      },
      { passive: false, capture: true }
    );
    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      canvas.style.cursor = "grab";
      lastInteract = clock.getElapsedTime();
      /* Reconciliar ao largar: rolar a página para a posição correspondente
         ao explode definido pela roda (modo pin), para o estado ficar coerente */
      if (wheelOverride) {
        if (pinActive && heroPin) {
          const range = heroPin.offsetHeight - window.innerHeight;
          window.scrollTo({
            top: heroPin.offsetTop + wheelExplode * range,
            behavior: "smooth",
          });
        } else {
          manualExplode = wheelExplode;
          if (toggleTxt) toggleTxt.textContent = manualExplode > 0.5 ? "Montar" : "Desmontar";
        }
      }
      wheelOverride = false;
    };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
  }

  /* --- Pausar fora do ecrã / separador oculto --- */
  const io = new IntersectionObserver(
    (entries) => { onScreen = entries[0].isIntersecting; },
    { threshold: 0.02 }
  );
  io.observe(canvas);
  document.addEventListener("visibilitychange", () => {
    running = !document.hidden;
    if (running) clock.getDelta();
  });

  /* --- Redimensionamento --- */
  let baseX = 0;
  function resize() {
    const w = canvas.clientWidth || canvas.parentElement.clientWidth;
    const h = canvas.clientHeight || canvas.parentElement.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const halfW = Math.tan((camera.fov * Math.PI) / 360) * CAM_Z * camera.aspect;
    if (isHero) {
      const wide = camera.aspect > 1.02;
      baseX = wide ? halfW * 0.38 : 0;
      group.userData.baseY = wide ? 0 : 0.72;
      group.userData.baseScale = wide ? 1 : 0.72;
    } else {
      baseX = camera.aspect > 1.2 ? halfW * 0.5 : 0;
      group.userData.baseY = 0;
      group.userData.baseScale = 0.9;
    }
    group.position.x = baseX;
    ring.position.x = baseX;
  }
  window.addEventListener("resize", resize);
  resize();
  group.userData.baseY = group.userData.baseY || 0;
  group.userData.baseScale = group.userData.baseScale || 1;

  const v = new THREE.Vector3();

  function frame() {
    requestAnimationFrame(frame);
    if (!running || !onScreen) return;
    const t = clock.getElapsedTime();

    /* Explosão suavizada: roda-durante-arrasto > pin por scroll > botão */
    let target = 0;
    if (isHero) {
      if (wheelOverride) target = wheelExplode;
      else if (pinActive) target = scrollTarget;
      else target = manualExplode;
    }
    explode += (target - explode) * 0.14;
    canvas.dataset.explode = explode.toFixed(3);
    if (Math.abs(target - explode) < 0.0005) explode = target;

    parts.forEach((p, i) => {
      p.position.z = i * (ASSEMBLE_STEP + explode * EXPLODE_GAP);
    });
    // Recentrar o conjunto ao expandir
    group.position.z = -explode * (3 * EXPLODE_GAP) / 2;

    /* Rotação: arrasto + inércia; auto-rotação lenta em repouso */
    if (isHero) {
      if (!dragging) {
        const xClamp = 0.8 + explode * 0.35;
        rot.y += vel.y;
        rot.x = clamp(rot.x + vel.x, -xClamp, xClamp);
        vel.x *= 0.94;
        vel.y *= 0.94;
        if (t - lastInteract > 2.5) rot.y += 0.0018;
      }
    } else {
      rot.y += 0.0022;
      rot.x = Math.sin(t * 0.3) * 0.06; // oscilação suave centrada no frontal
    }
    group.rotation.x = rot.x;
    group.rotation.y = rot.y;

    /* Flutuação + "respiração" */
    group.position.y = group.userData.baseY + Math.sin(t * 0.75) * 0.05;
    group.scale.setScalar(group.userData.baseScale * (1 + Math.sin(t * 0.55) * 0.012));
    group.position.x = baseX - (isHero ? explode * 0.85 : 0);
    ring.position.x = group.position.x;

    ring.rotation.z = t * 0.12;
    if (particles) particles.rotation.z = t * 0.03;

    /* Conteúdo do hero esbate-se com o progresso */
    if (isHero) {
      const contentO = clamp(1 - explode * 1.9, 0, 1);
      if (heroContent) {
        heroContent.style.opacity = contentO.toFixed(3);
        heroContent.style.transform = `translateY(${(-explode * 46).toFixed(1)}px)`;
        heroContent.style.pointerEvents = contentO < 0.15 ? "none" : "";
      }
      if (heroEl) heroEl.style.setProperty("--veil-o", contentO.toFixed(3));
      if (scrollHint) scrollHint.style.opacity = clamp(1 - explode * 4, 0, 1).toFixed(3);
    }

    /* Etiquetas projectadas para o ecrã (escondidas quando a peça está de costas) */
    if (isHero && labelEls.length) {
      const w = renderer.domElement.clientWidth;
      const h = renderer.domElement.clientHeight;
      const labelAlpha = clamp((explode - 0.6) / 0.15, 0, 1);
      group.updateMatrixWorld();
      const facing = new THREE.Vector3();
      labelEls.forEach(({ el, layer, anchor }) => {
        const part = parts[layer];
        part.localToWorld(v.set(anchor[0], anchor[1], 0)).project(camera);
        const x = (v.x * 0.5 + 0.5) * w;
        const y = (-v.y * 0.5 + 0.5) * h;
        // 1 quando a face da peça aponta para a câmara
        facing.set(0, 0, 1).applyQuaternion(part.getWorldQuaternion(new THREE.Quaternion()));
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
