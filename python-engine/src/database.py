import os
from contextlib import contextmanager
from typing import Generator

from dotenv import dotenv_values
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker, Session

config = {
    **dotenv_values("../.env"),  # load shared environment variables
    **dotenv_values(".env"),  # load python-engine variables
    **os.environ,  # system environment variables
}


class Base(DeclarativeBase):
    pass


DATABASE_URL = (
    f"postgresql://{config.get('DB_USER')}:{config.get('DB_PASSWORD')}"
    f"@{config.get('DB_HOST')}:{config.get('DB_PORT')}/{config.get('DB_NAME')}"
)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=3600,
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def get_db_context() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
