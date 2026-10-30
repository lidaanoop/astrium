/* Hero video carousel — autoplay, arrows, dots, swipe, keyboard and progress bar. */
(() => {
  const hero = document.querySelector(".hero");
  if (!hero) return;

  const slides = Array.from(hero.querySelectorAll(".hero-slide"));
  if (!slides.length) return;

  const videos = slides.map((slide) => slide.querySelector("video"));
  const dots = Array.from(hero.querySelectorAll(".hero-dot"));
  const prevBtn = hero.querySelector('[data-dir="prev"]');
  const nextBtn = hero.querySelector('[data-dir="next"]');
  const toggleBtn = hero.querySelector(".hero-toggle");
  const counter = hero.querySelector("[data-current]");

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const DURATION = 9000;

  let index = 0;
  let timer = null;
  let userPaused = false;
  let inView = true;

  const pad = (value) => String(value).padStart(2, "0");

  function playVideo(video) {
    if (!video) return;
    const attempt = video.play();
    if (attempt && typeof attempt.catch === "function") {
      attempt.catch(() => {
        /* Autoplay can be blocked — the poster frame stays visible. */
      });
    }
  }

  function resetVideo(video) {
    if (!video) return;
    video.pause();
    try {
      video.currentTime = 0;
    } catch (error) {
      /* Ignore seek errors on media that has not loaded yet. */
    }
  }

  function shouldPlayVideo() {
    return !userPaused && !reduceMotion.matches && inView && !document.hidden;
  }

  function syncPlayback() {
    const video = videos[index];
    if (!video) return;
    if (shouldPlayVideo()) {
      playVideo(video);
    } else {
      video.pause();
    }
  }

  function syncToggle() {
    if (!toggleBtn) return;
    toggleBtn.setAttribute("aria-pressed", String(userPaused));
    toggleBtn.setAttribute(
      "aria-label",
      userPaused ? "Play slideshow" : "Pause slideshow"
    );
    hero.classList.toggle("is-stopped", userPaused);
  }

  function stopTimer() {
    if (timer) window.clearTimeout(timer);
    timer = null;
    hero.classList.remove("is-playing");
  }

  function startTimer() {
    stopTimer();

    if (!shouldPlayVideo()) {
      if (userPaused) hero.classList.add("is-paused");
      return;
    }

    hero.classList.remove("is-paused");

    // Restart the progress-bar animation from zero.
    void hero.offsetWidth;
    hero.classList.add("is-playing");

    timer = window.setTimeout(() => {
      show(index + 1);
    }, DURATION);
  }

  function show(next) {
    index = (next + slides.length) % slides.length;

    slides.forEach((slide, i) => {
      const active = i === index;
      slide.classList.toggle("is-active", active);
      slide.setAttribute("aria-hidden", String(!active));
      slide.inert = !active;
      if (active) {
        playVideo(videos[i]);
      } else {
        resetVideo(videos[i]);
      }
    });

    dots.forEach((dot, i) => {
      const active = i === index;
      dot.classList.toggle("is-active", active);
      dot.setAttribute("aria-selected", String(active));
    });

    if (counter) counter.textContent = pad(index + 1);

    syncPlayback();
    startTimer();
  }

  /* ---------------------------------------------------------------- controls */

  if (prevBtn) prevBtn.addEventListener("click", () => show(index - 1));
  if (nextBtn) nextBtn.addEventListener("click", () => show(index + 1));

  dots.forEach((dot, i) => {
    dot.addEventListener("click", () => {
      if (i !== index) show(i);
    });
  });

  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      userPaused = !userPaused;
      syncToggle();
      syncPlayback();
      if (userPaused) {
        stopTimer();
        hero.classList.add("is-paused");
      } else {
        startTimer();
      }
    });
  }

  hero.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      show(index - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      show(index + 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      show(0);
    } else if (event.key === "End") {
      event.preventDefault();
      show(slides.length - 1);
    }
  });

  /* ------------------------------------------------------------------ swipe */

  let pointerStart = null;

  hero.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button, a")) return;
    pointerStart = { x: event.clientX, y: event.clientY };
  });

  hero.addEventListener("pointerup", (event) => {
    if (!pointerStart) return;
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    pointerStart = null;
    if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy)) return;
    show(dx < 0 ? index + 1 : index - 1);
  });

  hero.addEventListener("pointercancel", () => {
    pointerStart = null;
  });

  /* -------------------------------------------------- pause when not visible */

  document.addEventListener("visibilitychange", () => {
    syncPlayback();
    if (document.hidden) stopTimer();
    else startTimer();
  });

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          inView = entry.isIntersecting;
          syncPlayback();
          if (inView) startTimer();
          else stopTimer();
        });
      },
      { threshold: 0.25 }
    );
    observer.observe(hero);
  }

  const onMotionPreferenceChange = () => {
    syncPlayback();
    startTimer();
  };

  if (typeof reduceMotion.addEventListener === "function") {
    reduceMotion.addEventListener("change", onMotionPreferenceChange);
  }

  // Browsers that block muted autoplay resume on the first interaction.
  document.addEventListener(
    "pointerdown",
    () => {
      if (shouldPlayVideo()) playVideo(videos[index]);
    },
    { once: true }
  );

  syncToggle();
  show(0);
})();
