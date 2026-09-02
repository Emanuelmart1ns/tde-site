/* ==========================================================================
   TDE — JS partilhado: navegação, reveal, contadores, formulário.
   ========================================================================== */

(function () {
  "use strict";

  /* --- Estado do cabeçalho ao fazer scroll --- */
  const header = document.querySelector(".site-header");
  const onScroll = () => {
    if (header) header.classList.toggle("scrolled", window.scrollY > 24);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* --- Menu mobile --- */
  const toggle = document.querySelector(".nav-toggle");
  if (toggle) {
    toggle.addEventListener("click", () => {
      const open = document.body.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.querySelectorAll(".nav-links a").forEach((a) =>
      a.addEventListener("click", () => document.body.classList.remove("nav-open"))
    );
  }

  /* --- Ligação activa na navegação --- */
  const page = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-links a").forEach((a) => {
    const href = a.getAttribute("href");
    if (href === page) a.classList.add("active");
  });

  /* --- Scroll-reveal com stagger --- */
  const revealEls = document.querySelectorAll(".reveal");
  document.querySelectorAll("[data-stagger]").forEach((group) => {
    Array.from(group.querySelectorAll(".reveal")).forEach((el, i) => {
      el.style.setProperty("--rd", (i * 0.09).toFixed(2) + "s");
    });
  });
  if ("IntersectionObserver" in window) {
    const ro = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            ro.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    revealEls.forEach((el) => ro.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("in"));
  }

  /* --- Contadores animados (faixa de estatísticas) --- */
  const counters = document.querySelectorAll("[data-count]");
  if (counters.length && "IntersectionObserver" in window) {
    const co = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          co.unobserve(e.target);
          const el = e.target;
          const target = parseFloat(el.dataset.count);
          const suffix = el.dataset.suffix || "";
          const dur = 1500;
          const t0 = performance.now();
          const tick = (now) => {
            const p = Math.min(1, (now - t0) / dur);
            const eased = 1 - Math.pow(1 - p, 3);
            el.firstChild.nodeValue = Math.round(target * eased);
            if (p < 1) requestAnimationFrame(tick);
            else el.firstChild.nodeValue = target + suffix;
          };
          el.firstChild.nodeValue = "0";
          requestAnimationFrame(tick);
        });
      },
      { threshold: 0.4 }
    );
    counters.forEach((el) => co.observe(el));
  }

  /* --- Brilho que segue o rato nos cartões --- */
  document.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", ((e.clientX - r.left) / r.width) * 100 + "%");
      card.style.setProperty("--my", ((e.clientY - r.top) / r.height) * 100 + "%");
    });
  });

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
      const body = encodeURIComponent(
        "Nome: " + nome + "\n" +
        "Email: " + email + "\n" +
        "Contacto: " + contacto + "\n\n" +
        mensagem
      );
      window.location.href =
        "mailto:geral@tde.com.pt?subject=" + subject + "&body=" + body;
    });
  }
})();
