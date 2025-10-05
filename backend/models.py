# models.py
import os
import sqlite3

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, "gcaiphase1.db")

def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS news (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    headline TEXT,
                    source TEXT,
                    timestamp TEXT,
                    category TEXT,
                    bias TEXT
                )''')
    conn.commit()
    conn.close()
