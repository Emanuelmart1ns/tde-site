/* ==========================================================================
   TDE — JS partilhado: navegação, cursor, reveal, contadores, manifesto,
   carril de produtos, lista de serviços, formulário.
   ========================================================================== */

(function () {
  "use strict";

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;

  /* --- Cabeçalho: esconde ao descer, mostra ao subir --- */
  const header = document.querySelector(".site-header");
  let lastY = window.scrollY;
  const onScroll = () => {
    const y = window.scrollY;
    if (header) {
      const down = y > lastY && y > 140;
      header.classList.toggle("hidden", down && !document.body.classList.contains("nav-open"));
    }
    lastY = y;
  };
  window.addEventListener("scroll", onScroll, { passive: true });

  /* --- Menu mobile --- */
  const toggle = document.querySelector(".nav-toggle");
  if (toggle) {
    toggle.addEventListener("click", () => {
      const open = document.body.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.querySelectorAll(".nav-pill a").forEach((a) =>
      a.addEventListener("click", () => document.body.classList.remove("nav-open"))
    );
  }

  /* --- Ligação activa --- */
  const page = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-pill a").forEach((a) => {
    if (a.getAttribute("href") === page) a.classList.add("active");
  });

  /* --- Cursor personalizado --- */
  if (finePointer && !reduced) {
    const dot = document.createElement("div");
    dot.className = "cursor";
    const ring = document.createElement("div");
    ring.className = "cursor-ring";
    document.body.append(dot, ring);
    let rx = 0, ry = 0, tx = 0, ty = 0;
    window.addEventListener("pointermove", (e) => {
      tx = e.clientX; ty = e.clientY;
      dot.style.transform = `translate(${tx}px, ${ty}px)`;
      document.body.classList.add("has-cursor");
      const hot = e.target.closest("a, button, [data-hover], input, textarea, .rail");
      document.body.classList.toggle("cursor-hover", !!hot);
    }, { passive: true });
    document.addEventListener("mouseleave", () => document.body.classList.remove("has-cursor"));
    (function follow() {
      rx += (tx - rx) * 0.18;
      ry += (ty - ry) * 0.18;
      ring.style.transform = `translate(${rx}px, ${ry}px)`;
      requestAnimationFrame(follow);
    })();
  }

  /* --- Scroll-reveal com stagger --- */
  document.querySelectorAll("[data-stagger]").forEach((group) => {
    Array.from(group.querySelectorAll(".reveal")).forEach((el, i) => {
      el.style.setProperty("--rd", (i * 0.08).toFixed(2) + "s");
    });
  });
  const revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduced) {
    const ro = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("in"); ro.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    revealEls.forEach((el) => ro.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("in"));
  }

  /* --- Contadores --- */
  const counters = document.querySelectorAll("[data-count]");
  if (counters.length && "IntersectionObserver" in window) {
    const co = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        co.unobserve(e.target);
        const el = e.target;
        const target = parseFloat(el.dataset.count);
        const suffix = el.dataset.suffix || "";
        if (reduced) { el.textContent = target + suffix; return; }
        const t0 = performance.now();
        const tick = (now) => {
          const p = Math.min(1, (now - t0) / 1600);
          const eased = 1 - Math.pow(1 - p, 3);
          el.textContent = Math.round(target * eased) + (p === 1 ? suffix : "");
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.5 });
    counters.forEach((el) => co.observe(el));
  }

  /* --- Manifesto: palavras acendem com o scroll --- */
  document.querySelectorAll(".word-reveal").forEach((block) => {
    const words = block.textContent.trim().split(/\s+/);
    block.innerHTML = words.map((w) => {
      const accent = w.startsWith("*");
      const clean = w.replace(/^\*/, "");
      return `<span class="w${accent ? " accent" : ""}">${clean}</span>`;
    }).join(" ");
    const spans = block.querySelectorAll(".w");
    if (reduced) { spans.forEach((s) => s.classList.add("on")); return; }
    const update = () => {
      const r = block.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = (vh * 0.85 - r.top) / (r.height + vh * 0.35);
      const n = Math.round(Math.max(0, Math.min(1, p)) * spans.length);
      spans.forEach((s, i) => s.classList.toggle("on", i < n));
    };
    window.addEventListener("scroll", update, { passive: true });
    update();
  });

  /* --- Brilho que segue o rato (tiles, botões, vidro) --- */
  if (finePointer) {
    document.querySelectorAll(".tile, .btn, .glass").forEach((el) => {
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", ((e.clientX - r.left) / r.width) * 100 + "%");
        el.style.setProperty("--my", ((e.clientY - r.top) / r.height) * 100 + "%");
      }, { passive: true });
    });
    /* Botões magnéticos */
    if (!reduced) {
      document.querySelectorAll(".btn").forEach((btn) => {
        btn.addEventListener("pointermove", (e) => {
          const r = btn.getBoundingClientRect();
          const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
          const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
          btn.style.transform = `translate(${dx * 8}px, ${dy * 8}px)`;
        }, { passive: true });
        btn.addEventListener("pointerleave", () => { btn.style.transform = ""; });
      });
    }
  }

  /* --- Carril de produtos --- */
  document.querySelectorAll("[data-rail]").forEach((wrap) => {
    const rail = wrap.querySelector(".rail");
    const step = () => (rail.firstElementChild ? rail.firstElementChild.getBoundingClientRect().width + 16 : 320);
    wrap.querySelector("[data-rail-prev]")?.addEventListener("click", () => rail.scrollBy({ left: -step(), behavior: "smooth" }));
    wrap.querySelector("[data-rail-next]")?.addEventListener("click", () => rail.scrollBy({ left: step(), behavior: "smooth" }));
  });

  /* --- Serviços: lista + painel --- */
  const svcItems = document.querySelectorAll(".svc-item");
  const panel = document.querySelector(".svc-panel");
  if (svcItems.length && panel) {
    const pIcon = panel.querySelector(".icon-big");
    const pTitle = panel.querySelector("h3");
    const pText = panel.querySelector("p");
    const pFacts = panel.querySelector(".facts");
    const show = (item) => {
      svcItems.forEach((i) => { i.classList.toggle("open", i === item); i.setAttribute("aria-expanded", i === item ? "true" : "false"); });
      pIcon.innerHTML = item.querySelector(".svc-icon-src").innerHTML;
      pTitle.textContent = item.querySelector("h3").textContent;
      pText.textContent = item.querySelector(".body p").textContent;
      pFacts.innerHTML = (item.dataset.facts || "").split("|").filter(Boolean).map((f) => `<span>${f.trim()}</span>`).join("");
      [pIcon, pTitle, pText, pFacts].forEach((el) => { el.classList.remove("swap"); void el.offsetWidth; el.classList.add("swap"); });
    };
    svcItems.forEach((item) => {
      item.addEventListener("click", () => show(item));
      item.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); show(item); } });
    });
    show(svcItems[0]);
  }

  /* --- Formulário de contacto (mailto, sem backend) --- */
  const form = document.getElementById("contact-form");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const nome = form.nome.value.trim();
      const email = form.email.value.trim();
      const contacto = form.contacto.value.trim();
      const mensagem = form.mensagem.value.trim();
      const subject = encodeURIComponent("Contacto via site TDE — " + nome);
      const body = encodeURIComponent("Nome: " + nome + "\nEmail: " + email + "\nContacto: " + contacto + "\n\n" + mensagem);
      window.location.href = "mailto:geral@tde.com.pt?subject=" + subject + "&body=" + body;
    });
  }
})();
