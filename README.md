# Rupee Route

A stylish expense tracker web app built with Flask and SQLite.

## Setup

```bash
pip install -r requirements.txt
python app.py
```

Then open [http://localhost:5000](http://localhost:5000) in your browser.

## Free Hosting (Render)

This project is ready for free deployment on Render using `render.yaml`.

1. Create a new GitHub repository and push this project.
2. Go to [Render Dashboard](https://dashboard.render.com/) and click **New +** -> **Blueprint**.
3. Connect your GitHub repo and deploy.
4. Render will install dependencies and run:
   - Build: `pip install -r requirements.txt`
   - Start: `gunicorn app:app`

### Important note

This app currently uses SQLite (`expenses.db`), so on free cloud instances data may reset after restarts/sleeps.
If you want durable production data, switch to a managed database (PostgreSQL/MySQL).

## Features

- Add expenses with amount, category, description, and date
- Filter expenses by category and date range
- Summary dashboard with total spending and category breakdown
- Delete expenses
- Data persists in a local SQLite database (`expenses.db`)
