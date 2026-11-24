const batchForm = document.querySelector("#batch-form");
const batchList = document.querySelector("#batch-list");
const batchCount = document.querySelector("#batch-count");
const inventoryForm = document.querySelector("#inventory-form");
const inventoryFields = document.querySelector("#inventory-fields");
const inventoryActions = document.querySelector("#inventory-actions");
const editInventoryButton = document.querySelector("#edit-inventory");
const upcoming = document.querySelector("#upcoming");
const appAlert = document.querySelector("#app-alert");

const supplyNames = [
  "Anti-plagas",
  "Anti-hongos",
  "Booster",
  "Atrapa-moscas",
  "Sustrato",
  "Micelio",
];
let inventory = {};

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "No se pudo completar la solicitud.");
  }
  return data;
}

function showAlert(message, type = "success") {
  appAlert.className = `alert alert-${type}`;
  appAlert.textContent = message;
  appAlert.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function formatDate(value) {
  return new Intl.DateTimeFormat("es", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

async function loadBatches() {
  const batches = await requestJson("/api/batches");
  batchCount.textContent = `${batches.length} ${batches.length === 1 ? "cultivo" : "cultivos"}`;
  batchList.replaceChildren();

  if (batches.length === 0) {
    batchList.innerHTML = '<div class="empty-state"><span aria-hidden="true">◌</span><p class="mb-0">Todavía no hay siembras. Registra tu primer cultivo.</p></div>';
    upcoming.classList.add("d-none");
    return;
  }

  batches.forEach((batch) => {
    const article = document.createElement("article");
    article.className = "batch-item";

    const header = document.createElement("div");
    header.className = "d-flex flex-wrap justify-content-between align-items-start gap-2";
    const title = document.createElement("div");
    const name = document.createElement("h3");
    name.className = "h6 fw-semibold mb-1";
    name.textContent = batch.product_name;
    const type = document.createElement("span");
    type.className = "text-secondary small";
    type.textContent = batch.product_type;
    title.append(name, type);
    const badge = document.createElement("span");
    badge.className = "type-pill";
    badge.textContent = "En seguimiento";
    header.append(title, badge);

    const dates = document.createElement("div");
    dates.className = "row g-2 mt-2";
    dates.append(
      makeMilestone("Inicio de incubación", batch.incubation_start_date),
      makeMilestone("Fin de incubación", batch.incubation_end_date),
      makeMilestone("Fructificación / cosecha", batch.fructification_start),
    );
    article.append(header, dates);
    batchList.append(article);
  });
  renderUpcoming(batches);
}

function makeMilestone(label, value) {
  const wrapper = document.createElement("div");
  wrapper.className = "col-12 col-md-4";
  const caption = document.createElement("span");
  caption.className = "milestone-label";
  caption.textContent = label;
  const date = document.createElement("span");
  date.className = "milestone-date";
  date.textContent = value ? formatDate(value) : "Pendiente";
  wrapper.append(caption, date);
  return wrapper;
}

function renderUpcoming(batches) {
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + 2);
  const target = [
    targetDate.getFullYear(),
    String(targetDate.getMonth() + 1).padStart(2, "0"),
    String(targetDate.getDate()).padStart(2, "0"),
  ].join("-");
  const due = [];
  batches.forEach((batch) => {
    if (batch.incubation_end_date === target) {
      due.push(`${batch.product_name}: termina la incubación`);
    }
    if (batch.fructification_start === target) {
      due.push(`${batch.product_name}: inicio de fructificación / cosecha`);
    }
  });

  upcoming.replaceChildren();
  if (due.length === 0) {
    upcoming.classList.add("d-none");
    return;
  }
  const heading = document.createElement("strong");
  heading.textContent = `Hitos para el ${formatDate(target)}:`;
  const list = document.createElement("ul");
  list.className = "mb-0 mt-1";
  due.forEach((milestone) => {
    const item = document.createElement("li");
    item.textContent = milestone;
    list.append(item);
  });
  upcoming.append(heading, list);
  upcoming.classList.remove("d-none");
}

function renderInventory(values) {
  inventory = values;
  inventoryFields.replaceChildren();
  supplyNames.forEach((name) => {
    const column = document.createElement("div");
    column.className = "col-12 col-sm-6 col-lg-4";
    const label = document.createElement("label");
    label.className = "form-label";
    label.htmlFor = `supply-${name}`;
    label.textContent = name;
    const input = document.createElement("input");
    input.id = `supply-${name}`;
    input.name = name;
    input.type = "number";
    input.step = "1";
    input.value = values[name];
    input.className = "form-control supply-input";
    input.readOnly = true;
    column.append(label, input);
    inventoryFields.append(column);
  });
}

batchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = batchForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  try {
    const formData = new FormData(batchForm);
    await requestJson("/api/batches", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(formData)),
    });
    batchForm.reset();
    await loadBatches();
    showAlert("Siembra guardada correctamente.");
  } catch (error) {
    showAlert(error.message, "danger");
  } finally {
    submitButton.disabled = false;
  }
});

editInventoryButton.addEventListener("click", () => {
  inventoryFields.querySelectorAll("input").forEach((input) => {
    input.readOnly = false;
  });
  inventoryActions.classList.remove("d-none");
  editInventoryButton.classList.add("d-none");
  inventoryFields.querySelector("input").focus();
});

document.querySelector("#cancel-inventory").addEventListener("click", () => {
  renderInventory(inventory);
  inventoryActions.classList.add("d-none");
  editInventoryButton.classList.remove("d-none");
});

inventoryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!window.confirm("¿Guardar los cambios en el inventario?")) return;
  const values = {};
  inventoryFields.querySelectorAll("input").forEach((input) => {
    values[input.name] = Number(input.value);
  });
  if (Object.values(values).some((value) => !Number.isInteger(value))) {
    showAlert("Por favor ingresa solo números enteros.", "danger");
    return;
  }
  try {
    renderInventory(await requestJson("/api/inventory", {
      method: "PUT",
      body: JSON.stringify(values),
    }));
    inventoryActions.classList.add("d-none");
    editInventoryButton.classList.remove("d-none");
    showAlert("Inventario actualizado correctamente.");
  } catch (error) {
    showAlert(error.message, "danger");
  }
});

Promise.all([loadBatches(), requestJson("/api/inventory").then(renderInventory)]).catch((error) => {
  showAlert(error.message, "danger");
});
