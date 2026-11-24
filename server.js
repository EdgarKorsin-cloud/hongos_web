const path = require("node:path");
const express = require("express");
const { DatabaseSync } = require("node:sqlite");

const SUPPLY_FIELDS = {
  "Anti-plagas": "anti_plagas",
  "Anti-hongos": "anti_hongos",
  "Booster": "booster",
  "Atrapa-moscas": "atrapa_moscas",
  "Sustrato": "sustrato",
  "Micelio": "micelio",
};

const databaseUrl = process.env.DATABASE_URL || "sqlite:./siembra.db";
const databasePath = databaseUrl.startsWith("sqlite:")
  ? databaseUrl.slice("sqlite:".length).replace(/^\.\//, "")
  : databaseUrl;

const db = new DatabaseSync(path.resolve(databasePath));

db.exec(`
  CREATE TABLE IF NOT EXISTS siembra (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_name TEXT NOT NULL,
    product_type TEXT NOT NULL,
    incubation_start_date TEXT NOT NULL,
    incubation_end_date TEXT,
    fructification_start TEXT
  );

  CREATE TABLE IF NOT EXISTS inventario (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    anti_plagas INTEGER NOT NULL DEFAULT 0,
    anti_hongos INTEGER NOT NULL DEFAULT 0,
    booster INTEGER NOT NULL DEFAULT 0,
    atrapa_moscas INTEGER NOT NULL DEFAULT 0,
    sustrato INTEGER NOT NULL DEFAULT 0,
    micelio INTEGER NOT NULL DEFAULT 0
  );
`);

const inventoryExists = db.prepare("SELECT id FROM inventario ORDER BY id LIMIT 1").get();
if (!inventoryExists) {
  db.prepare(
    `INSERT INTO inventario (
      anti_plagas, anti_hongos, booster, atrapa_moscas, sustrato, micelio
    ) VALUES (0, 0, 0, 0, 0, 0)`,
  ).run();
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isValidIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function serializeBatch(batch) {
  return {
    id: batch.id,
    product_name: batch.product_name,
    product_type: batch.product_type,
    incubation_start_date: batch.incubation_start_date,
    incubation_end_date: batch.incubation_end_date,
    fructification_start: batch.fructification_start,
  };
}

function inventoryResponse() {
  const inventory = db.prepare("SELECT * FROM inventario ORDER BY id LIMIT 1").get();
  return Object.fromEntries(
    Object.entries(SUPPLY_FIELDS).map(([label, field]) => [label, inventory[field]]),
  );
}

const app = express();
app.use(express.json());
app.use("/static", express.static(path.join(__dirname, "static")));

app.get("/", (_request, response) => {
  response.sendFile(path.join(__dirname, "templates", "index.html"));
});

app.get("/api/batches", (_request, response) => {
  const batches = db.prepare("SELECT * FROM siembra ORDER BY id DESC").all();

  for (const batch of batches) {
    if (!batch.incubation_end_date || !batch.fructification_start) {
      const incubationEnd = addDays(batch.incubation_start_date, 30);
      const fructificationStart = addDays(incubationEnd, 10);
      db.prepare(
        `UPDATE siembra
         SET incubation_end_date = ?, fructification_start = ?
         WHERE id = ?`,
      ).run(incubationEnd, fructificationStart, batch.id);
      batch.incubation_end_date = incubationEnd;
      batch.fructification_start = fructificationStart;
    }
  }

  response.json(batches.map(serializeBatch));
});

app.post("/api/batches", (request, response) => {
  const data = request.body;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return response.status(400).json({
      error: "Envía los datos de la siembra en formato JSON.",
    });
  }

  const productName = data.product_name;
  const productType = data.product_type;
  const startValue = data.incubation_start_date || "";

  if (![productName, productType, startValue].every((value) => typeof value === "string")) {
    return response.status(400).json({
      error: "El nombre, tipo y fecha deben ser texto.",
    });
  }

  const trimmedName = productName.trim();
  const trimmedType = productType.trim();
  if (!trimmedName || !trimmedType || !startValue) {
    return response.status(400).json({
      error: "Completa el nombre, tipo y fecha de inicio.",
    });
  }
  if (!isValidIsoDate(startValue)) {
    return response.status(400).json({
      error: "La fecha debe tener el formato YYYY-MM-DD.",
    });
  }

  const result = db.prepare(
    `INSERT INTO siembra (
      product_name, product_type, incubation_start_date
    ) VALUES (?, ?, ?)`,
  ).run(trimmedName, trimmedType, startValue);

  const batch = db.prepare("SELECT * FROM siembra WHERE id = ?").get(result.lastInsertRowid);
  const incubationEnd = addDays(startValue, 30);
  const fructificationStart = addDays(incubationEnd, 10);
  db.prepare(
    `UPDATE siembra
     SET incubation_end_date = ?, fructification_start = ?
     WHERE id = ?`,
  ).run(incubationEnd, fructificationStart, batch.id);

  batch.incubation_end_date = incubationEnd;
  batch.fructification_start = fructificationStart;
  response.status(201).json(serializeBatch(batch));
});

app.get("/api/inventory", (_request, response) => {
  response.json(inventoryResponse());
});

app.put("/api/inventory", (request, response) => {
  const data = request.body;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return response.status(400).json({
      error: "Envía el inventario en formato JSON.",
    });
  }
  if (!Object.keys(SUPPLY_FIELDS).every((label) => Object.hasOwn(data, label))) {
    return response.status(400).json({
      error: "Incluye los seis valores del inventario.",
    });
  }
  if (!Object.values(data).every((value) => Number.isInteger(value))) {
    return response.status(400).json({
      error: "Todos los valores deben ser números enteros.",
    });
  }

  const inventory = db.prepare("SELECT * FROM inventario ORDER BY id LIMIT 1").get();
  const assignments = Object.entries(SUPPLY_FIELDS).map(([, field]) => `${field} = ?`);
  const values = Object.keys(SUPPLY_FIELDS).map((label) => data[label]);
  db.prepare(
    `UPDATE inventario SET ${assignments.join(", ")} WHERE id = ?`,
  ).run(...values, inventory.id);

  response.json(inventoryResponse());
});

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    console.log(`Servidor disponible en http://localhost:${port}`);
  });
}

module.exports = { app, db };
