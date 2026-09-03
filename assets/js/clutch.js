/* ==========================================================================
   TDE — Embraiagem 3D (modelo Blender: assets/models/clutch.glb)
   - Hero (data-clutch-mode="hero"): explode fixado ao scroll (pin 350vh),
     rotação por arrasto com inércia, roda-durante-arrasto, etiquetas
     projectadas e ficha de função ao pairar sobre cada peça (explodido).
   - Ambiente (data-clutch-mode="ambient"): montada, auto-rotação lenta.
   GLB Y-up: eixo da pilha = +Y; origens das peças em Y = 0 / 0.5 / 0.7 / 0.85.
   ========================================================================== */

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const MODEL_URL = "assets/models/clutch.glb";
const PART_NAMES = ["part_z0_disc", "part_z1_housing", "part_z2_diaphragm", "part_z3_cover"];
const PART_Y = [0, 0.5, 0.7, 0.85];          // origens no GLB (montado)
const EXPLODE_OFF = [0, 0.45, 0.95, 1.55];   // afastamento ao desmontar
const PART_R = [0.95, 1.0, 0.42, 0.74];      // raios exteriores (metade do diâmetro)
const CAM_Z = 6.4;

/* Etiquetas (hero): camada, ângulo/comprimento da linha-guia, âncora no
   espaço local da peça (Y = eixo da pilha; XZ = plano radial). */
const LABELS = [
  { sel: '[data-part="z3"]', layer: 3, angle: -115, len: 100, anchor: [0.55, 0, 0.45] },
  { sel: '[data-part="z2"]', layer: 2, angle: 30, len: 86, anchor: [0.34, 0, -0.28] },
  { sel: '[data-part="z1"]', layer: 1, angle: 208, len: 86, anchor: [-0.75, 0, 0.3] },
  { sel: '[data-part="z0"]', layer: 0, angle: 152, len: 92, anchor: [-0.68, 0, -0.45] },
];

/* Fichas de função (hover) */
const PART_INFO = [
  { name: "Disco de Embraiagem", desc: "Transmite o binário do motor à caixa de velocidades. As molas de amortecimento absorvem as vibrações e protegem a transmissão." },
  { name: "Carcaça Cromada", desc: "Estrutura que une todo o conjunto ao volante do motor e aloja o círculo de parafusos de fixação." },
  { name: "Mola de Diafragma", desc: "Aplica a pressão que mantém o disco contra o volante. É ela que define o esforço do pedal de embraiagem." },
  { name: "Placa de Pressão — Race Pro 1000", desc: "Comprime o disco contra o volante para transmitir a potência. Afasta-se quando o pedal é pressionado." },
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
  renderer.toneMappingExposure = 1.25;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 60);
  camera.position.set(0, 0, CAM_Z);

  /* --- Ambiente de estúdio (reflexos cromados) sem ficheiros externos ---
     Softboxes brilhantes sobre fundo negro: são as riscas claras longas que
     fazem o cromado "de carro" estalar, em vez do cinza galvanizado. */
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x020204);
  const softbox = (w, h, x, y, z, ry, rx, intensity) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial()
    );
    m.material.color.setScalar(intensity); // HDR: >1 = reflexo estalante
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, 0);
    envScene.add(m);
  };
  softbox(5, 14, -9, 2, 0, Math.PI / 2, 0, 6);        // risca esquerda
  softbox(5, 14, 9, 2, 0, -Math.PI / 2, 0, 6);        // risca direita
  softbox(12, 7, 0, 9, 1, 0, -Math.PI / 2.2, 5);      // softbox superior
  softbox(11, 5, 0, -8, 4, 0, Math.PI / 3, 2.5);      // fill inferior
  softbox(4, 12, 0, 3, -10, 0, 0, 4);                 // risca traseira
  softbox(15, 10, 0, 1, 11, Math.PI, 0, 3.2);         // frontal (atrás da câmara)
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;

  /* Luzes subtis para modelar o cromado */
  const key = new THREE.DirectionalLight(0xffffff, 1.0);
  key.position.set(3, 4, 5);
  scene.add(key);
  const fill = new THREE.PointLight(0xeef2f8, 18, 30);
  fill.position.set(1.5, 2.5, 5.5);
  scene.add(fill);
  const rim = new THREE.PointLight(0x22d3ee, 5, 30);
  rim.position.set(-4.5, 1.5, -2.5);
  scene.add(rim);

  const group = new THREE.Group();        // interacção (rotação/posição)
  scene.add(group);
  const modelGroup = new THREE.Group();   // orientação do modelo: +Y → +Z
  modelGroup.rotation.x = Math.PI / 2;
  group.add(modelGroup);

  /* --- Estado de carregamento --- */
  const loadingEl = document.createElement("div");
  loadingEl.className = "clutch-loading";
  loadingEl.textContent = "A carregar 3D…";
  (canvas.parentElement || document.body).appendChild(loadingEl);

  /* --- Carregar o GLB --- */
  const parts = [];              // raízes part_z0..z3
  const partMats = [[], [], [], []]; // materiais clonados por peça (hover)
  const proxies = [];            // cilindros invisíveis para raycast
  let modelReady = false;

  new GLTFLoader().load(
    MODEL_URL,
    (gltf) => {
      const root = gltf.scene;
      modelGroup.add(root);

      PART_NAMES.forEach((name, i) => {
        const part = root.getObjectByName(name);
        if (!part) return;
        part.userData.spinV = 0;
        part.userData.lift = 1;
        // Clonar materiais por peça (o hover acende emissive só nessa peça)
        part.traverse((o) => {
          if (o.isMesh) {
            o.material = o.material.clone();
            /* Cromado espelho: placa frontal (z3) quase sem rugosidade,
               restantes metais com brilho alto */
            if (o.material.metalness > 0.85) {
              if (o.material.roughness > 0.05) o.material.roughness = 0.05;
              o.material.envMapIntensity = i === 3 ? 2.8 : 2.1;
            }
            partMats[i].push(o.material);
          }
        });
        // Proxy invisível para o raycast do hover (178k tris seriam caros)
        const proxy = new THREE.Mesh(
          new THREE.CylinderGeometry(PART_R[i], PART_R[i], 0.45, 24),
          new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true })
        );
        part.add(proxy);
        proxies.push(proxy);
        parts[i] = part;
      });

      modelReady = true;
      loadingEl.remove();
    },
    undefined,
    () => { loadingEl.textContent = "Modelo 3D indisponível"; }
  );

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

  const rot = { x: 0, y: 0 }; // pose de repouso frontal
  const vel = { x: 0, y: 0 };
  let dragging = false;
  let lastPointer = { x: 0, y: 0 };
  let lastInteract = -10;
  let running = true;
  let onScreen = true;
  const clock = new THREE.Clock();

  /* --- Hover por peça (hero, estado explodido) --- */
  const raycaster = new THREE.Raycaster();
  const pointerNDC = new THREE.Vector2();
  let pointerActive = false; // só fazer raycast depois de o rato entrar no canvas
  let hoverIdx = -1;       // rato
  let tapIdx = -1;         // toque (alterna)
  let downPos = null;      // para distinguir toque de arrasto
  const pointerClient = { x: 0, y: 0 };

  /* Ficha de função que segue o cursor */
  const card = isHero ? document.createElement("div") : null;
  if (card) {
    card.className = "part-card";
    card.innerHTML = '<span class="pc-name"></span><p class="pc-desc"></p>';
    (canvas.closest(".hero") || document.body).appendChild(card);
  }
  function setCard(i, x, y) {
    if (!card) return;
    if (i < 0) { card.classList.remove("on"); return; }
    card.querySelector(".pc-name").textContent = PART_INFO[i].name;
    card.querySelector(".pc-desc").textContent = PART_INFO[i].desc;
    card.style.left = Math.min(x + 22, window.innerWidth - 290) + "px";
    card.style.top = Math.max(y - 96, 12) + "px";
    card.classList.add("on");
  }

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

  /* --- Botão Continuar: salta o fim da expansão e larga o hero ---
     Sem lock à entrada: o scroll expande desde o primeiro momento. O botão
     fica visível enquanto o pin está ativo e a expansão não chegou ao fim;
     clicar leva a página ao fim da zona de pin (explode completo). */
  const continueBtn = isHero ? document.getElementById("hero-continue") : null;
  if (isHero && pinActive && continueBtn && heroPin) {
    continueBtn.hidden = false;
    continueBtn.addEventListener("click", () => {
      const range = heroPin.offsetHeight - window.innerHeight;
      window.scrollTo({ top: heroPin.offsetTop + range, behavior: "smooth" });
    });
  }

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
      wheelOverride = false;
      wheelExplode = pinActive ? scrollTarget : manualExplode;
      canvas.style.cursor = "grabbing";
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
    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      canvas.style.cursor = "grab";
      lastInteract = clock.getElapsedTime();
      /* Toque (sem arrastar): alternar a ficha da peça tocada */
      if (e && downPos && downPos.type === "touch" &&
          Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) < 10 &&
          explode > 0.6 && modelReady) {
        updateNDC(e);
        raycaster.setFromCamera(pointerNDC, camera);
        const hit = raycaster.intersectObjects(proxies, false)[0];
        tapIdx = hit ? proxies.indexOf(hit.object) : -1;
        if (tapIdx === -1) setCard(-1);
      }
      downPos = null;
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
    canvas.addEventListener("pointerleave", () => { pointerActive = false; hoverIdx = -1; if (tapIdx < 0) setCard(-1); });
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
  }
  window.addEventListener("resize", resize);
  resize();
  group.userData.baseY = group.userData.baseY || 0;
  group.userData.baseScale = group.userData.baseScale || 1;

  const v = new THREE.Vector3();

  function frame() {
    requestAnimationFrame(frame);
    if (!running || !onScreen) return;
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;

    /* Explosão suavizada (independente do frame-rate):
       roda-durante-arrasto > pin por scroll > botão */
    let target = 0;
    if (isHero) {
      if (wheelOverride) target = wheelExplode;
      else if (pinActive) target = scrollTarget;
      else target = manualExplode;
    }
    explode += (target - explode) * (1 - Math.exp(-dt * 9));
    canvas.dataset.explode = explode.toFixed(3);
    if (Math.abs(target - explode) < 0.0005) explode = target;

    if (modelReady) {
      parts.forEach((p, i) => {
        if (!p) return;
        p.position.y = PART_Y[i] + explode * EXPLODE_OFF[i];
      });
      // Recentrar o conjunto ao expandir (eixo local +Y = eixo da pilha)
      modelGroup.position.y = -(PART_Y[3] + explode * EXPLODE_OFF[3]) / 2;
    }

    /* Rotação: arrasto + inércia; auto-rotação lenta em repouso */
    if (isHero) {
      if (!dragging) {
        const xClamp = 0.8 + explode * 0.35;
        rot.y += vel.y;
        rot.x = clamp(rot.x + vel.x, -xClamp, xClamp);
        vel.x *= 0.94;
        vel.y *= 0.94;
        if (t - lastInteract > 2.5 && hoverIdx < 0 && tapIdx < 0) rot.y += 0.0018;
      }
    } else {
      rot.y += 0.0022;
      rot.x = Math.sin(t * 0.3) * 0.06; // oscilação suave centrada no frontal
    }
    /* Ao desmontar, inclinação extra para evidenciar a separação da pilha */
    group.rotation.x = rot.x + explode * 0.08;
    group.rotation.y = rot.y + explode * 0.42;

    /* Flutuação + "respiração"; ao desmontar, afastar/encolher ligeiramente
       para o conjunto expandido caber em ecrã */
    group.position.y = group.userData.baseY + Math.sin(t * 0.75) * 0.05
      + (isHero ? explode * 0.5 : 0);
    group.scale.setScalar(group.userData.baseScale * (1 + Math.sin(t * 0.55) * 0.012)
      * (isHero ? 1 - explode * 0.2 : 1));
    group.position.x = baseX - (isHero ? explode * 0.9 : 0);

    if (particles) particles.rotation.z = t * 0.03;

    /* Conteúdo do hero esbate-se com o progresso */
    if (isHero) {
      const contentO = clamp(1 - explode * 1.9, 0, 1);
      /* Continuar: visível enquanto a expansão não terminou */
      if (continueBtn && pinActive) continueBtn.hidden = explode > 0.98;
      if (heroContent) {
        heroContent.style.opacity = contentO.toFixed(3);
        heroContent.style.transform = `translateY(${(-explode * 46).toFixed(1)}px)`;
        heroContent.style.pointerEvents = contentO < 0.15 ? "none" : "";
      }
      if (heroEl) heroEl.style.setProperty("--veil-o", contentO.toFixed(3));
      if (scrollHint) scrollHint.style.opacity = clamp(1 - explode * 4, 0, 1).toFixed(3);
    }

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
          m.emissive.setHex(0x22d3ee);
          m.emissiveIntensity += (eTarget - m.emissiveIntensity) * 0.12;
        });
      });
      if (!dragging) canvas.style.cursor = selected >= 0 ? "pointer" : "grab";
      if (selected >= 0) setCard(selected, pointerClient.x, pointerClient.y);
      else if (tapIdx < 0) setCard(-1);
    } else if (isHero) {
      if (hoverIdx >= 0 || tapIdx >= 0) { hoverIdx = -1; tapIdx = -1; setCard(-1); }
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

    /* Etiquetas projectadas para o ecrã (escondidas quando a peça está de costas) */
    if (isHero && labelEls.length && modelReady) {
      const w = renderer.domElement.clientWidth;
      const h = renderer.domElement.clientHeight;
      const labelAlpha = clamp((explode - 0.6) / 0.15, 0, 1);
      group.updateMatrixWorld();
      const facing = new THREE.Vector3();
      labelEls.forEach(({ el, layer, anchor }) => {
        const part = parts[layer];
        if (!part) return;
        part.localToWorld(v.set(anchor[0], anchor[1], anchor[2])).project(camera);
        const x = (v.x * 0.5 + 0.5) * w;
        const y = (-v.y * 0.5 + 0.5) * h;
        // 1 quando a frente da peça (+Y local) aponta para a câmara
        facing.set(0, 1, 0).applyQuaternion(part.getWorldQuaternion(new THREE.Quaternion()));
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
