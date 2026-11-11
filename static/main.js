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
  const sendOtpBtn = document.getElementById("send-otp");
  const otpPanel = document.getElementById("otp-panel");
  const otpInput = document.getElementById("checkin-otp");
  const otpStatus = document.getElementById("otp-status");
  const otpHint = document.getElementById("otp-hint");
  const demoOtp = modal.querySelector("[data-demo-otp]");
  const verifyOtpBtn = document.getElementById("verify-otp");
  const resendBtn = document.getElementById("resend-otp");

  const fields = {
    name: document.getElementById("checkin-name"),
    phone: document.getElementById("checkin-phone"),
    address: document.getElementById("checkin-address"),
    aadhaar: document.getElementById("checkin-aadhaar"),
    otp: otpInput,
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

  let otpRequestId = null;
  let aadhaarVerified = false;
  let verifiedAadhaar = "";
  let resendTimer = null;

  function setStatus(node, message, state) {
    if (!node) return;
    node.textContent = message;
    node.classList.toggle("is-valid", state === "valid");
    node.classList.toggle("is-invalid", state === "invalid");
  }

  const setVerifyStatus = (message, state) =>
    setStatus(aadhaarStatus, message, state);
  const setOtpStatus = (message, state) => setStatus(otpStatus, message, state);

  function stopResendTimer() {
    if (resendTimer) window.clearInterval(resendTimer);
    resendTimer = null;
  }

  function startResendTimer(seconds) {
    stopResendTimer();
    if (!resendBtn) return;

    let remaining = Math.max(1, Math.round(seconds || 30));

    const render = () => {
      if (remaining <= 0) {
        stopResendTimer();
        resendBtn.disabled = false;
        resendBtn.textContent = "Resend OTP";
        return;
      }

      resendBtn.disabled = true;
      resendBtn.textContent = `Resend OTP in ${remaining}s`;
      remaining -= 1;
    };

    render();
    resendTimer = window.setInterval(render, 1000);
  }

  function resetVerification() {
    aadhaarVerified = false;
    verifiedAadhaar = "";
    otpRequestId = null;

    stopResendTimer();

    if (otpPanel) otpPanel.hidden = true;
    if (otpInput) {
      otpInput.value = "";
      otpInput.disabled = false;
    }
    if (verifyOtpBtn) {
      verifyOtpBtn.disabled = false;
      verifyOtpBtn.textContent = "Verify OTP";
    }
    if (resendBtn) {
      resendBtn.hidden = false;
      resendBtn.disabled = true;
      resendBtn.textContent = "Resend OTP in 30s";
    }
    if (demoOtp) {
      demoOtp.hidden = true;
      demoOtp.textContent = "";
    }

    setOtpStatus("", "");
    clearError("otp");
  }

  fields.aadhaar.addEventListener("input", () => {
    const digits = aadhaarDigits().slice(0, 12);
    fields.aadhaar.value = (digits.match(/.{1,4}/g) || []).join(" ");

    resetVerification();
    setVerifyStatus("", "");
    clearError("aadhaar");
  });

  async function requestOtp({ resend = false } = {}) {
    const problem = validateAadhaar();
    if (problem) {
      setVerifyStatus(problem, "invalid");
      showError("aadhaar", problem);
      return;
    }

    const digits = aadhaarDigits();
    const trigger = resend ? resendBtn : sendOtpBtn;

    trigger.disabled = true;
    trigger.textContent = "Sending…";
    if (!resend) setVerifyStatus("Sending OTP…", "");
    setOtpStatus("Sending a new OTP…", "");

    try {
      const response = await fetch("/api/aadhaar/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aadhaar: digits }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.ok) {
        const fieldError = data.errors && data.errors.aadhaar;
        const message =
          fieldError ||
          data.message ||
          "We could not send the OTP. Please try again.";

        if (fieldError) {
          showError("aadhaar", fieldError);
          setVerifyStatus(fieldError, "invalid");
        } else {
          setOtpStatus(message, "invalid");
          // Never leave the Aadhaar row stuck on "Sending OTP…".
          setVerifyStatus(message, "invalid");
        }

        if (data.retry_after) startResendTimer(data.retry_after);
        return;
      }

      otpRequestId = data.request_id;
      aadhaarVerified = false;
      verifiedAadhaar = "";

      otpPanel.hidden = false;
      otpInput.disabled = false;
      otpInput.value = "";
      clearError("otp");
      verifyOtpBtn.disabled = false;
      verifyOtpBtn.textContent = "Verify OTP";
      resendBtn.hidden = false;

      setVerifyStatus(
        `OTP sent to the mobile linked with ${data.masked || "Aadhaar"}`,
        "valid"
      );
      setOtpStatus("", "");

      if (otpHint && data.expires_in) {
        otpHint.textContent = `Valid for ${Math.round(
          data.expires_in / 60
        )} minutes. Sent to the mobile number registered with Aadhaar.`;
      }

      if (data.demo_otp && demoOtp) {
        demoOtp.hidden = false;
        demoOtp.textContent = `Demo mode: your OTP is ${data.demo_otp}`;
      }

      startResendTimer(data.resend_in);
      otpInput.focus();
    } catch (error) {
      setVerifyStatus("Network error — please try again.", "invalid");
    } finally {
      if (!resend) {
        sendOtpBtn.disabled = false;
        sendOtpBtn.textContent = "Send OTP";
      } else if (!resendTimer) {
        resendBtn.disabled = false;
        resendBtn.textContent = "Resend OTP";
      }
    }
  }

  async function submitOtp() {
    const otp = otpInput.value.replace(/\D/g, "").slice(0, 6);
    otpInput.value = otp;

    if (!otpRequestId) {
      setOtpStatus("Request an OTP first.", "invalid");
      return;
    }

    if (otp.length !== 6) {
      showError("otp", "Enter the 6-digit OTP.");
      return;
    }

    verifyOtpBtn.disabled = true;
    verifyOtpBtn.textContent = "Verifying…";
    setOtpStatus("Checking OTP…", "");

    try {
      const response = await fetch("/api/aadhaar/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: otpRequestId, otp }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.ok) {
        const message = data.message || "OTP verification failed.";
        showError("otp", message);
        setOtpStatus(message, "invalid");

        if (data.expired || response.status === 429) {
          otpRequestId = null;
          stopResendTimer();
          resendBtn.hidden = false;
          resendBtn.disabled = false;
          resendBtn.textContent = "Resend OTP";
        }
        return;
      }

      aadhaarVerified = true;
      verifiedAadhaar = aadhaarDigits();

      clearError("aadhaar");
      clearError("otp");
      otpInput.disabled = true;
      verifyOtpBtn.disabled = true;
      verifyOtpBtn.textContent = "Verified";
      resendBtn.hidden = true;
      if (demoOtp) demoOtp.hidden = true;

      stopResendTimer();
      setOtpStatus(
        `Aadhaar ${data.aadhaar_masked || ""} verified via OTP ✓`,
        "valid"
      );
      setVerifyStatus("Aadhaar verified via OTP ✓", "valid");
    } catch (error) {
      setOtpStatus("Network error — please try again.", "invalid");
    } finally {
      if (!aadhaarVerified) {
        verifyOtpBtn.disabled = false;
        verifyOtpBtn.textContent = "Verify OTP";
      }
    }
  }

  sendOtpBtn.addEventListener("click", () => requestOtp());
  resendBtn.addEventListener("click", () => requestOtp({ resend: true }));
  verifyOtpBtn.addEventListener("click", submitOtp);

  otpInput.addEventListener("input", () => {
    otpInput.value = otpInput.value.replace(/\D/g, "").slice(0, 6);
    clearError("otp");
  });

  otpInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitOtp();
    }
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
    const map = { checkIn: "check_in", checkOut: "check_out" };
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
    } else if (!aadhaarVerified || verifiedAadhaar !== aadhaarDigits()) {
      errors.aadhaar = "Verify your Aadhaar with the OTP before checking in.";
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
    resetVerification();
    setVerifyStatus("", "");
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
