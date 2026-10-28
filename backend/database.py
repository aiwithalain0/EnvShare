
import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker


# Load configuration from the backend .env file.
ENV_FILE = Path(__file__).resolve().parent / ".env"
load_dotenv(ENV_FILE)

# Keep the existing SQLite database as the fallback.
DATABASE_PATH = Path(__file__).resolve().parent / "envshare.db"
SQLITE_DATABASE_URL = f"sqlite:///{DATABASE_PATH.as_posix()}"

# Use Neon only when DATABASE_URL is configured.
DATABASE_URL = os.getenv("DATABASE_URL", "").strip() or SQLITE_DATABASE_URL

# Configure SQLite and PostgreSQL separately.
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
    )
else:
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
    )

# Create a database session factory.
SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    expire_on_commit=False,
)


# Base class for EnvShare database models.
class Base(DeclarativeBase):
    pass


# Provide a database session to API endpoints.
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
