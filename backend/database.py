
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# Store the SQLite database inside the backend folder.
DATABASE_PATH = Path(__file__).resolve().parent / "envshare.db"
DATABASE_URL = f"sqlite:///{DATABASE_PATH.as_posix()}"

# Create the database connection.
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
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
