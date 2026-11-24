from datetime import date, timedelta
import os

from flask import Flask, jsonify, render_template, request
from flask_sqlalchemy import SQLAlchemy


db = SQLAlchemy()

SUPPLY_FIELDS = {
    "Anti-plagas": "anti_plagas",
    "Anti-hongos": "anti_hongos",
    "Booster": "booster",
    "Atrapa-moscas": "atrapa_moscas",
    "Sustrato": "sustrato",
    "Micelio": "micelio",
}


class Siembra(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    product_name = db.Column(db.String(120), nullable=False)
    product_type = db.Column(db.String(120), nullable=False)
    incubation_start_date = db.Column(db.Date, nullable=False)
    incubation_end_date = db.Column(db.Date)
    fructification_start = db.Column(db.Date)


class Inventario(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    anti_plagas = db.Column(db.Integer, nullable=False, default=0)
    anti_hongos = db.Column(db.Integer, nullable=False, default=0)
    booster = db.Column(db.Integer, nullable=False, default=0)
    atrapa_moscas = db.Column(db.Integer, nullable=False, default=0)
    sustrato = db.Column(db.Integer, nullable=False, default=0)
    micelio = db.Column(db.Integer, nullable=False, default=0)


def create_app(test_config=None):
    app = Flask(__name__)
    app.config.from_mapping(
        SQLALCHEMY_DATABASE_URI=os.environ.get(
            "DATABASE_URL", "sqlite:///siembra.db"
        ),
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
    )
    if test_config:
        app.config.update(test_config)
    db.init_app(app)

    with app.app_context():
        db.create_all()
        if db.session.query(Inventario.id).first() is None:
            db.session.add(Inventario())
            db.session.commit()

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/api/batches")
    def get_batches():
        batches = Siembra.query.order_by(Siembra.id.desc()).all()
        changed = False
        for batch in batches:
            if not batch.incubation_end_date or not batch.fructification_start:
                incubation_end = batch.incubation_start_date + timedelta(days=30)
                batch.incubation_end_date = incubation_end
                batch.fructification_start = incubation_end + timedelta(days=10)
                changed = True
        if changed:
            db.session.commit()
        return jsonify([serialize_batch(batch) for batch in batches])

    @app.post("/api/batches")
    def create_batch():
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify(error="Envía los datos de la siembra en formato JSON."), 400
        product_name = data.get("product_name")
        product_type = data.get("product_type")
        start_value = data.get("incubation_start_date", "")
        if not all(isinstance(value, str) for value in (product_name, product_type, start_value)):
            return jsonify(error="El nombre, tipo y fecha deben ser texto."), 400
        product_name = product_name.strip()
        product_type = product_type.strip()
        if not product_name or not product_type or not start_value:
            return jsonify(error="Completa el nombre, tipo y fecha de inicio."), 400
        try:
            start_date = date.fromisoformat(start_value)
        except (TypeError, ValueError):
            return jsonify(error="La fecha debe tener el formato YYYY-MM-DD."), 400
        if start_date.isoformat() != start_value:
            return jsonify(error="La fecha debe tener el formato YYYY-MM-DD."), 400

        batch = Siembra(
            product_name=product_name,
            product_type=product_type,
            incubation_start_date=start_date,
        )
        db.session.add(batch)
        db.session.commit()
        return jsonify(serialize_batch(batch)), 201

    @app.get("/api/inventory")
    def get_inventory():
        inventory = Inventario.query.order_by(Inventario.id).first()
        return jsonify(
            {label: getattr(inventory, field) for label, field in SUPPLY_FIELDS.items()}
        )

    @app.put("/api/inventory")
    def update_inventory():
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify(error="Envía el inventario en formato JSON."), 400
        if any(label not in data for label in SUPPLY_FIELDS):
            return jsonify(error="Incluye los seis valores del inventario."), 400
        values = [data[label] for label in SUPPLY_FIELDS]
        if any(type(value) is not int for value in values):
            return jsonify(error="Todos los valores deben ser números enteros."), 400

        inventory = Inventario.query.order_by(Inventario.id).first()
        for label, field in SUPPLY_FIELDS.items():
            setattr(inventory, field, data[label])
        db.session.commit()
        return jsonify(
            {label: getattr(inventory, field) for label, field in SUPPLY_FIELDS.items()}
        )

    return app


def serialize_batch(batch):
    return {
        "id": batch.id,
        "product_name": batch.product_name,
        "product_type": batch.product_type,
        "incubation_start_date": batch.incubation_start_date.isoformat(),
        "incubation_end_date": (
            batch.incubation_end_date.isoformat() if batch.incubation_end_date else None
        ),
        "fructification_start": (
            batch.fructification_start.isoformat()
            if batch.fructification_start
            else None
        ),
    }


app = create_app()


if __name__ == "__main__":
    app.run(debug=True)
