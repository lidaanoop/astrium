/* Admin dashboard — search, status filters and delete confirmation. */
(() => {
  const table = document.getElementById("checkin-table");
  const search = document.getElementById("checkin-search");
  const emptyMessage = document.querySelector("[data-empty]");
  const chips = Array.from(document.querySelectorAll("[data-filter]"));

  if (!table) {
    // Still wire up confirmation on any destructive form on the page.
    bindConfirms();
    return;
  }

  const rows = Array.from(table.querySelectorAll("tbody tr"));
  let query = "";
  let status = "all";

  function applyFilters() {
    let visible = 0;

    rows.forEach((row) => {
      const haystack = (row.dataset.search || row.textContent || "").toLowerCase();
      const matchesQuery = !query || haystack.includes(query);
      const matchesStatus = status === "all" || row.dataset.status === status;
      const show = matchesQuery && matchesStatus;

      row.hidden = !show;
      if (show) visible += 1;
    });

    if (emptyMessage) emptyMessage.hidden = visible !== 0;
  }

  if (search) {
    search.addEventListener("input", () => {
      query = search.value.trim().toLowerCase();
      applyFilters();
    });
  }

  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      chips.forEach((item) =>
        item.classList.toggle("is-active", item === chip)
      );
      status = chip.dataset.filter || "all";
      applyFilters();
    });
  });

  bindConfirms();

  function bindConfirms() {
    document.querySelectorAll("form[data-confirm]").forEach((form) => {
      form.addEventListener("submit", (event) => {
        if (!window.confirm(form.dataset.confirm)) {
          event.preventDefault();
        }
      });
    });
  }
})();
