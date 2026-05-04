import sqlite3
import os
import hashlib
import secrets
from datetime import datetime
from functools import wraps
from flask import Flask, render_template, request, jsonify, session, redirect, url_for

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", secrets.token_hex(32))
DB_PATH = os.path.join(os.path.dirname(__file__), "expenses.db")

CATEGORIES = [
    "Food & Dining",
    "Transportation",
    "Shopping",
    "Entertainment",
    "Bills & Utilities",
    "Health",
    "Travel",
    "Education",
    "Other",
]


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def hash_password(password, salt=None):
    if salt is None:
        salt = secrets.token_hex(16)
    hashed = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000)
    return salt, hashed.hex()


def init_db():
    conn = get_db()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            display_name TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            category TEXT NOT NULL,
            description TEXT,
            date TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
        """
    )
    conn.commit()
    conn.close()


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user_id" not in session:
            if request.path.startswith("/api/"):
                return jsonify({"error": "Unauthorized"}), 401
            return redirect(url_for("login_page"))
        return f(*args, **kwargs)
    return decorated


# --- Auth pages ---

@app.route("/login")
def login_page():
    if "user_id" in session:
        return redirect(url_for("index"))
    return render_template("login.html")


@app.route("/api/auth/register", methods=["POST"])
def register():
    data = request.get_json()
    username = (data.get("username") or "").strip().lower()
    password = data.get("password") or ""
    display_name = (data.get("display_name") or username).strip()

    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400
    if len(username) < 3:
        return jsonify({"error": "Username must be at least 3 characters"}), 400
    if len(password) < 4:
        return jsonify({"error": "Password must be at least 4 characters"}), 400

    conn = get_db()
    existing = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if existing:
        conn.close()
        return jsonify({"error": "Username already taken"}), 409

    salt, password_hash = hash_password(password)
    cursor = conn.execute(
        "INSERT INTO users (username, password_hash, salt, display_name) VALUES (?, ?, ?, ?)",
        (username, password_hash, salt, display_name),
    )
    user_id = cursor.lastrowid
    conn.commit()
    conn.close()

    session["user_id"] = user_id
    session["username"] = username
    session["display_name"] = display_name

    return jsonify({"success": True, "display_name": display_name}), 201


@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json()
    username = (data.get("username") or "").strip().lower()
    password = data.get("password") or ""

    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400

    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    conn.close()

    if not user:
        return jsonify({"error": "Invalid username or password"}), 401

    _, password_hash = hash_password(password, user["salt"])
    if password_hash != user["password_hash"]:
        return jsonify({"error": "Invalid username or password"}), 401

    session["user_id"] = user["id"]
    session["username"] = user["username"]
    session["display_name"] = user["display_name"] or user["username"]

    return jsonify({"success": True, "display_name": session["display_name"]})


@app.route("/api/auth/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"success": True})


@app.route("/api/auth/me")
def auth_me():
    if "user_id" not in session:
        return jsonify({"logged_in": False}), 401
    return jsonify({
        "logged_in": True,
        "username": session["username"],
        "display_name": session["display_name"],
    })


# --- App pages ---

@app.route("/")
@login_required
def index():
    return render_template("index.html", categories=CATEGORIES)


# --- Expense API (all scoped to current user) ---

@app.route("/api/expenses", methods=["GET"])
@login_required
def get_expenses():
    user_id = session["user_id"]
    category = request.args.get("category")
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")

    query = "SELECT * FROM expenses WHERE user_id = ?"
    params = [user_id]

    if category:
        query += " AND category = ?"
        params.append(category)
    if start_date:
        query += " AND date >= ?"
        params.append(start_date)
    if end_date:
        query += " AND date <= ?"
        params.append(end_date)

    query += " ORDER BY date DESC, id DESC"

    conn = get_db()
    rows = conn.execute(query, params).fetchall()
    conn.close()

    return jsonify([dict(r) for r in rows])


@app.route("/api/expenses", methods=["POST"])
@login_required
def add_expense():
    user_id = session["user_id"]
    data = request.get_json()
    if not data or not data.get("amount") or not data.get("category"):
        return jsonify({"error": "Amount and category are required"}), 400

    try:
        amount = round(float(data["amount"]), 2)
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid amount"}), 400

    if amount <= 0:
        return jsonify({"error": "Amount must be positive"}), 400

    category = data["category"]
    description = data.get("description", "").strip()
    date = data.get("date") or datetime.now().strftime("%Y-%m-%d")

    conn = get_db()
    cursor = conn.execute(
        "INSERT INTO expenses (user_id, amount, category, description, date) VALUES (?, ?, ?, ?, ?)",
        (user_id, amount, category, description, date),
    )
    expense_id = cursor.lastrowid
    conn.commit()

    row = conn.execute("SELECT * FROM expenses WHERE id = ?", (expense_id,)).fetchone()
    conn.close()

    return jsonify(dict(row)), 201


@app.route("/api/expenses/<int:expense_id>", methods=["DELETE"])
@login_required
def delete_expense(expense_id):
    user_id = session["user_id"]
    conn = get_db()
    conn.execute("DELETE FROM expenses WHERE id = ? AND user_id = ?", (expense_id, user_id))
    conn.commit()
    conn.close()
    return jsonify({"success": True})


@app.route("/api/summary")
@login_required
def get_summary():
    user_id = session["user_id"]
    category = request.args.get("category")
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")

    where = "WHERE user_id = ?"
    params = [user_id]
    if category:
        where += " AND category = ?"
        params.append(category)
    if start_date:
        where += " AND date >= ?"
        params.append(start_date)
    if end_date:
        where += " AND date <= ?"
        params.append(end_date)

    conn = get_db()

    total = conn.execute(
        f"SELECT COALESCE(SUM(amount), 0) as total FROM expenses {where}", params
    ).fetchone()["total"]

    by_category = conn.execute(
        f"""SELECT category, SUM(amount) as total, COUNT(*) as count
            FROM expenses {where}
            GROUP BY category ORDER BY total DESC""",
        params,
    ).fetchall()

    count = conn.execute(
        f"SELECT COUNT(*) as c FROM expenses {where}", params
    ).fetchone()["c"]

    conn.close()

    return jsonify(
        {
            "total": round(total, 2),
            "count": count,
            "by_category": [dict(r) for r in by_category],
        }
    )


init_db()


if __name__ == "__main__":
    app.run(debug=True, port=5000)
