"""
Seed script to initialize default organisation and admin user.
Run this after running database migrations.

Usage:
    python seed_org.py
"""

import os
import sys
import uuid
import bcrypt
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def get_db_connection():
    """Get database connection"""
    import psycopg2
    from psycopg2.extras import RealDictCursor

    connection = psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", 5432),
        database=os.getenv("DB_NAME", "shdt"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", "postgres")
    )
    return connection

def seed_database():
    """Seed database with default organisation and admin user"""
    conn = get_db_connection()
    cur = conn.cursor()

    try:
        # Create default organisation
        org_id = str(uuid.uuid4())
        org_name = "Default Organisation"
        org_slug = "default-org"

        print(f"Creating organisation: {org_name}")
        cur.execute(
            """
            INSERT INTO organisations (id, name, slug, created_at)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (slug) DO NOTHING
            """,
            (org_id, org_name, org_slug, datetime.utcnow())
        )

        # Get organisation ID (in case it already existed)
        cur.execute("SELECT id FROM organisations WHERE slug = %s", (org_slug,))
        org_result = cur.fetchone()
        if org_result:
            org_id = org_result[0]

        # Create admin user
        admin_email = "admin@shdt.local"
        admin_password = "changeme123"
        admin_name = "Admin User"
        admin_id = str(uuid.uuid4())

        # Hash password
        password_hash = bcrypt.hashpw(admin_password.encode(), bcrypt.gensalt(rounds=12)).decode()

        print(f"Creating admin user: {admin_email}")
        cur.execute(
            """
            INSERT INTO users (id, email, password_hash, name, role, organisation_id, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (email, organisation_id) DO NOTHING
            """,
            (admin_id, admin_email, password_hash, admin_name, "admin", org_id, datetime.utcnow())
        )

        # Assign existing properties to default organisation
        print("Assigning properties to organisation...")
        cur.execute(
            """
            UPDATE properties
            SET organisation_id = %s
            WHERE organisation_id IS NULL
            """,
            (org_id,)
        )

        conn.commit()
        print("\nSeed completed successfully!")
        print(f"Organisation ID: {org_id}")
        print(f"Default admin credentials:")
        print(f"  Email: {admin_email}")
        print(f"  Password: {admin_password}")
        print(f"\nNote: Change the password immediately after first login!")

    except Exception as e:
        conn.rollback()
        print(f"Error seeding database: {e}")
        sys.exit(1)
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    seed_database()
