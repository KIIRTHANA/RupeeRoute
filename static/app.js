const API = "/api/expenses";
const CURRENCY = "\u20B9";

const CATEGORY_ICONS = {
  "Food & Dining": "\u{1F354}",
  Transportation: "\u{1F697}",
  Shopping: "\u{1F6CD}\uFE0F",
  Entertainment: "\u{1F3AC}",
  "Bills & Utilities": "\u{1F4A1}",
  Health: "\u{1FA7A}",
  Travel: "\u2708\uFE0F",
  Education: "\u{1F4DA}",
  Other: "\u{1F4CC}",
};

const CHART_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f59e0b",
  "#10b981", "#06b6d4", "#3b82f6", "#64748b",
];

let categoryChart = null;

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("expense-form");
  document.getElementById("date").valueAsDate = new Date();

  form.addEventListener("submit", handleAddExpense);
  document.getElementById("filter-category").addEventListener("change", refresh);
  document.getElementById("filter-start").addEventListener("change", refresh);
  document.getElementById("filter-end").addEventListener("change", refresh);
  document.getElementById("clear-filters").addEventListener("click", clearFilters);
  document.getElementById("logout-btn").addEventListener("click", handleLogout);

  loadUser();
  initChart();
  refresh();
});

async function loadUser() {
  try {
    const res = await fetch("/api/auth/me");
    if (!res.ok) {
      window.location.href = "/login";
      return;
    }
    const data = await res.json();
    document.getElementById("user-name").textContent = data.display_name;
  } catch {
    window.location.href = "/login";
  }
}

async function handleLogout() {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/login";
}

function initChart() {
  const ctx = document.getElementById("category-chart").getContext("2d");
  categoryChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: [],
      datasets: [{
        data: [],
        backgroundColor: CHART_COLORS,
        borderWidth: 0,
        hoverBorderWidth: 2,
        hoverBorderColor: "#fff",
        spacing: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: "68%",
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(15, 15, 26, 0.9)",
          titleFont: { family: "Inter", weight: "600" },
          bodyFont: { family: "Inter" },
          padding: 12,
          cornerRadius: 10,
          borderColor: "rgba(255,255,255,0.1)",
          borderWidth: 1,
          callbacks: {
            label: (ctx) => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = ((ctx.raw / total) * 100).toFixed(1);
              return ` ${CURRENCY}${ctx.raw.toFixed(2)} (${pct}%)`;
            },
          },
        },
      },
      animation: {
        animateRotate: true,
        duration: 800,
        easing: "easeOutQuart",
      },
    },
  });
}

function getFilters() {
  return {
    category: document.getElementById("filter-category").value,
    start_date: document.getElementById("filter-start").value,
    end_date: document.getElementById("filter-end").value,
  };
}

function buildQuery(filters) {
  const params = new URLSearchParams();
  if (filters.category) params.set("category", filters.category);
  if (filters.start_date) params.set("start_date", filters.start_date);
  if (filters.end_date) params.set("end_date", filters.end_date);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

async function refresh() {
  const filters = getFilters();
  const query = buildQuery(filters);

  const [expenses, summary] = await Promise.all([
    fetch(`${API}${query}`).then((r) => r.json()),
    fetch(`/api/summary${query}`).then((r) => r.json()),
  ]);

  renderExpenses(expenses);
  renderSummary(summary, expenses);
  renderChart(summary);
}

function renderExpenses(expenses) {
  const container = document.getElementById("expense-list");
  document.getElementById("expense-badge").textContent = expenses.length;

  if (!expenses.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">&#128176;</div>
        <p>No expenses found</p>
        <span>Add your first expense to start tracking!</span>
      </div>`;
    return;
  }

  container.innerHTML = expenses
    .map(
      (e, i) => `
    <div class="expense-item" data-id="${e.id}" style="animation-delay: ${i * 0.04}s">
      <div class="expense-cat">${CATEGORY_ICONS[e.category] || "\u{1F4CC}"}</div>
      <div class="expense-details">
        <div class="expense-desc">${escapeHtml(e.description || e.category)}</div>
        <div class="expense-meta">${e.category} &middot; ${formatDate(e.date)}</div>
      </div>
      <div class="expense-amount">${CURRENCY}${Number(e.amount).toFixed(2)}</div>
      <button class="expense-delete" onclick="deleteExpense(${e.id})" title="Delete">&times;</button>
    </div>`
    )
    .join("");
}

function renderSummary(summary, expenses) {
  document.getElementById("total-amount").textContent =
    `${CURRENCY}${formatNum(summary.total)}`;
  document.getElementById("total-count").textContent = summary.count;

  const avg = summary.count > 0 ? summary.total / summary.count : 0;
  document.getElementById("avg-amount").textContent =
    `${CURRENCY}${formatNum(avg)}`;

  const highest = expenses.length
    ? Math.max(...expenses.map((e) => e.amount))
    : 0;
  document.getElementById("top-expense").textContent =
    `${CURRENCY}${formatNum(highest)}`;
}

function renderChart(summary) {
  const cats = summary.by_category;

  if (!cats.length) {
    categoryChart.data.labels = [];
    categoryChart.data.datasets[0].data = [];
    categoryChart.update();
    document.getElementById("chart-center-value").textContent = `${CURRENCY}0`;
    document.getElementById("chart-legend").innerHTML = "";
    return;
  }

  categoryChart.data.labels = cats.map((c) => c.category);
  categoryChart.data.datasets[0].data = cats.map((c) => c.total);
  categoryChart.update();

  document.getElementById("chart-center-value").textContent =
    `${CURRENCY}${formatNum(summary.total)}`;

  document.getElementById("chart-legend").innerHTML = cats
    .map((c, i) => {
      const pct = ((c.total / summary.total) * 100).toFixed(1);
      return `
        <div class="legend-item">
          <span class="legend-dot" style="background: ${CHART_COLORS[i % CHART_COLORS.length]}"></span>
          ${CATEGORY_ICONS[c.category] || ""} ${c.category}
          <span class="legend-pct">${pct}%</span>
        </div>`;
    })
    .join("");
}

async function handleAddExpense(e) {
  e.preventDefault();

  const amount = document.getElementById("amount").value;
  const category = document.getElementById("category").value;
  const description = document.getElementById("description").value;
  const date = document.getElementById("date").value;

  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount, category, description, date }),
  });

  if (!res.ok) {
    const err = await res.json();
    showToast(err.error || "Failed to add expense", "error");
    return;
  }

  document.getElementById("amount").value = "";
  document.getElementById("description").value = "";
  document.getElementById("category").value = "";
  document.getElementById("date").valueAsDate = new Date();

  showToast("Expense added successfully!");
  refresh();
}

async function deleteExpense(id) {
  await fetch(`${API}/${id}`, { method: "DELETE" });
  showToast("Expense deleted");
  refresh();
}

function clearFilters() {
  document.getElementById("filter-category").value = "";
  document.getElementById("filter-start").value = "";
  document.getElementById("filter-end").value = "";
  refresh();
}

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatNum(n) {
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function escapeHtml(str) {
  const el = document.createElement("span");
  el.textContent = str;
  return el.innerHTML;
}

let toastTimeout;
function showToast(message) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("show"), 2500);
}
