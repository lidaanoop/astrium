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

/* Guest check-in modal — Aadhaar verification, validation and submission. */
(() => {
  const modal = document.getElementById("checkin-modal");
  if (!modal) return;

  const form = document.getElementById("checkin-form");
  const dialog = modal.querySelector(".modal__dialog");
  const successPanel = modal.querySelector("[data-success]");
  const submitBtn = form.querySelector("[data-submit]");
  const formError = modal.querySelector("[data-form-error]");
  const staySummary = modal.querySelector("[data-stay-summary]");
  const aadhaarStatus = document.getElementById("aadhaar-status");
  const verifyBtn = document.getElementById("verify-aadhaar");
  const fileName = modal.querySelector("[data-file-name]");
  const fileDrop = modal.querySelector(".file-drop");

  const fields = {
    name: document.getElementById("checkin-name"),
    phone: document.getElementById("checkin-phone"),
    address: document.getElementById("checkin-address"),
    aadhaar: document.getElementById("checkin-aadhaar"),
    file: document.getElementById("checkin-aadhaar-file"),
    checkIn: document.getElementById("checkin-date"),
    checkOut: document.getElementById("checkout-date"),
  };

  /* ------------------------------------------------------- Aadhaar rules */

  const VERHOEFF_D = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
  ];
  const VERHOEFF_P = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
  ];

  function verhoeffValid(number) {
    let checksum = 0;
    const digits = number.split("").reverse();
    digits.forEach((digit, index) => {
      checksum = VERHOEFF_D[checksum][VERHOEFF_P[index % 8][Number(digit)]];
    });
    return checksum === 0;
  }

  const aadhaarDigits = () => fields.aadhaar.value.replace(/\D/g, "");

  function validateAadhaar() {
    const digits = aadhaarDigits();
    if (!digits) return "Enter your 12-digit Aadhaar number.";
    if (digits.length !== 12) return "Aadhaar number must be 12 digits.";
    if (digits[0] === "0" || digits[0] === "1")
      return "Aadhaar number cannot start with 0 or 1.";
    if (!verhoeffValid(digits))
      return "This Aadhaar number is invalid. Please check the digits.";
    return "";
  }

  let aadhaarVerified = false;

  function setVerifyStatus(message, state) {
    aadhaarStatus.textContent = message;
    aadhaarStatus.classList.toggle("is-valid", state === "valid");
    aadhaarStatus.classList.toggle("is-invalid", state === "invalid");
  }

  fields.aadhaar.addEventListener("input", () => {
    const digits = aadhaarDigits().slice(0, 12);
    fields.aadhaar.value = (digits.match(/.{1,4}/g) || []).join(" ");

    aadhaarVerified = false;
    setVerifyStatus("", "");
    clearError("aadhaar");
  });

  verifyBtn.addEventListener("click", () => {
    const problem = validateAadhaar();
    if (problem) {
      aadhaarVerified = false;
      setVerifyStatus(problem, "invalid");
      showError("aadhaar", problem);
      return;
    }

    verifyBtn.disabled = true;
    verifyBtn.textContent = "Checking…";
    setVerifyStatus("Verifying Aadhaar…", "");

    const pending = aadhaarDigits();

    // Simulated verification round-trip; the final check also runs server-side.
    window.setTimeout(() => {
      verifyBtn.disabled = false;

      if (aadhaarDigits() !== pending) {
        verifyBtn.textContent = "Verify";
        setVerifyStatus("Number changed — please verify again.", "invalid");
        return;
      }

      aadhaarVerified = true;
      verifyBtn.textContent = "Verified";
      setVerifyStatus("Aadhaar number verified ✓", "valid");
      clearError("aadhaar");
    }, 700);
  });

  /* ------------------------------------------------------------ file pick */

  fields.file.addEventListener("change", () => {
    const file = fields.file.files && fields.file.files[0];
    if (!file) {
      fileName.textContent = "Choose a file";
      fileDrop.classList.remove("is-invalid");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      fields.file.value = "";
      fileName.textContent = "Choose a file";
      fileDrop.classList.add("is-invalid");
      showError("aadhaar_file", "File is larger than 5 MB.");
      return;
    }

    fileDrop.classList.remove("is-invalid");
    clearError("aadhaar_file");
    fileName.textContent = file.name;
  });

  /* ---------------------------------------------------------- date limits */

  const isoDate = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
      date.getDate()
    ).padStart(2, "0")}`;

  const startOfToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  };

  function syncDateLimits() {
    const today = startOfToday();
    fields.checkIn.min = isoDate(today);

    const chosenIn = fields.checkIn.value
      ? new Date(`${fields.checkIn.value}T00:00:00`)
      : null;
    const earliestOut = chosenIn ? new Date(chosenIn.getTime() + 86400000) : new Date(today.getTime() + 86400000);
    fields.checkOut.min = isoDate(earliestOut);

    if (fields.checkOut.value && fields.checkOut.value < fields.checkOut.min) {
      fields.checkOut.value = "";
    }
  }

  function nightsBetween() {
    if (!fields.checkIn.value || !fields.checkOut.value) return 0;
    const start = new Date(`${fields.checkIn.value}T00:00:00`);
    const end = new Date(`${fields.checkOut.value}T00:00:00`);
    return Math.round((end - start) / 86400000);
  }

  function updateSummary() {
    const nights = nightsBetween();
    if (nights > 0) {
      staySummary.hidden = false;
      staySummary.textContent = `Stay length: ${nights} night${nights === 1 ? "" : "s"} — ${fields.checkIn.value} to ${fields.checkOut.value}`;
    } else {
      staySummary.hidden = true;
      staySummary.textContent = "";
    }
  }

  [fields.checkIn, fields.checkOut].forEach((input) => {
    input.addEventListener("change", () => {
      syncDateLimits();
      updateSummary();
      clearError("checkIn");
      clearError("checkOut");
    });
  });

  /* ----------------------------------------------------------- validation */

  function errorNode(key) {
    const map = { file: "aadhaar_file", checkIn: "check_in", checkOut: "check_out" };
    return modal.querySelector(`[data-error-for="${map[key] || key}"]`);
  }

  function showError(key, message) {
    const node = errorNode(key);
    if (node) node.textContent = message;

    const input = fields[key];
    if (input) input.classList.add("is-invalid");
    if (key === "phone") input.parentElement.classList.add("is-invalid");
  }

  function clearError(key) {
    const node = errorNode(key);
    if (node) node.textContent = "";

    const input = fields[key];
    if (input) input.classList.remove("is-invalid");
    if (key === "phone") input.parentElement.classList.remove("is-invalid");
  }

  function clearAllErrors() {
    Object.keys(fields).forEach(clearError);
    formError.hidden = true;
    formError.textContent = "";
  }

  function collectErrors() {
    const errors = {};

    if (fields.name.value.trim().length < 3) {
      errors.name = "Please enter your full name.";
    }

    const phone = fields.phone.value.replace(/\D/g, "");
    if (!/^[6-9]\d{9}$/.test(phone)) {
      errors.phone = "Enter a valid 10-digit mobile number.";
    }

    if (fields.address.value.trim().length < 10) {
      errors.address = "Please enter your full address (at least 10 characters).";
    }

    const aadhaarProblem = validateAadhaar();
    if (aadhaarProblem) {
      errors.aadhaar = aadhaarProblem;
    } else if (!aadhaarVerified) {
      errors.aadhaar = "Verify your Aadhaar number before checking in.";
    }

    const todayIso = isoDate(startOfToday());
    if (!fields.checkIn.value) {
      errors.checkIn = "Select a check-in date.";
    } else if (fields.checkIn.value < todayIso) {
      errors.checkIn = "Check-in date cannot be in the past.";
    }

    const nights = nightsBetween();
    if (!fields.checkOut.value) {
      errors.checkOut = "Select a check-out date.";
    } else if (nights <= 0) {
      errors.checkOut = "Check-out must be after check-in.";
    }

    return errors;
  }

  /* -------------------------------------------------------- open / close */

  let lastFocused = null;

  function resetForm() {
    form.reset();
    clearAllErrors();
    aadhaarVerified = false;
    verifyBtn.disabled = false;
    verifyBtn.textContent = "Verify";
    setVerifyStatus("", "");
    fileName.textContent = "Choose a file";
    fileDrop.classList.remove("is-invalid");
    staySummary.hidden = true;
    staySummary.textContent = "";
    form.hidden = false;
    successPanel.hidden = true;
    syncDateLimits();
  }

  function openModal() {
    lastFocused = document.activeElement;
    resetForm();
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    window.setTimeout(() => {
      if (fields.name) fields.name.focus();
    }, 80);
  }

  function closeModal() {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    if (lastFocused && typeof lastFocused.focus === "function") {
      lastFocused.focus();
    }
  }

  document.querySelectorAll("[data-open-checkin]").forEach((button) => {
    button.addEventListener("click", openModal);
  });

  modal.querySelectorAll("[data-close-checkin]").forEach((element) => {
    element.addEventListener("click", closeModal);
  });

  document.addEventListener("keydown", (event) => {
    if (!modal.classList.contains("is-open")) return;

    if (event.key === "Escape") {
      event.preventDefault();
      closeModal();
      return;
    }

    if (event.key === "Tab") {
      const focusable = Array.from(
        dialog.querySelectorAll(
          'button, input, textarea, a[href], [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => !element.disabled && element.offsetParent !== null);

      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  /* ----------------------------------------------------------- submission */

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearAllErrors();

    const errors = collectErrors();
    const keys = Object.keys(errors);

    if (keys.length) {
      keys.forEach((key) => showError(key, errors[key]));
      const firstInput = fields[keys[0]];
      if (firstInput) {
        firstInput.focus({ preventScroll: true });
        firstInput.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      return;
    }

    const payload = {
      name: fields.name.value.trim(),
      phone: fields.phone.value.replace(/\D/g, ""),
      address: fields.address.value.trim(),
      aadhaar: aadhaarDigits(),
      check_in: fields.checkIn.value,
      check_out: fields.checkOut.value,
      aadhaar_file_name: fields.file.files[0] ? fields.file.files[0].name : "",
    };

    submitBtn.disabled = true;
    submitBtn.textContent = "Checking in…";

    try {
      const response = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.ok) {
        const serverErrors = data.errors || {};
        const keyMap = { check_in: "checkIn", check_out: "checkOut" };
        const serverKeys = Object.keys(serverErrors);

        if (serverKeys.length) {
          serverKeys.forEach((key) => {
            const fieldKey = keyMap[key] || key;
            if (fields[fieldKey]) showError(fieldKey, serverErrors[key]);
          });
        } else {
          formError.hidden = false;
          formError.textContent =
            data.message || "We could not complete your check-in. Please try again.";
        }
        return;
      }

      modal.querySelector("[data-ref]").textContent = data.reference || "—";
      form.hidden = true;
      successPanel.hidden = false;
      successPanel.querySelector("button").focus();
    } catch (error) {
      formError.hidden = false;
      formError.textContent =
        "Network error — please check your connection and try again.";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Complete check-in";
    }
  });

  syncDateLimits();
})();
