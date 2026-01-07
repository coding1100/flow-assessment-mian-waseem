"""
Unit tests for database module.
"""
import pytest
from unittest.mock import Mock, patch, MagicMock
import os
from contextlib import contextmanager
from sqlalchemy.orm import Session
from src.database import (
    Base,
    get_db,
    get_db_context,
    SessionLocal,
    engine,
    DATABASE_URL
)


class TestDatabaseConfig:
    """Test database configuration."""
    
    def test_base_class(self):
        """Test that Base class exists and is a DeclarativeBase."""
        assert Base is not None
        from sqlalchemy.orm import DeclarativeBase
        assert issubclass(Base, DeclarativeBase)
    
    def test_database_url_format(self):
        """Test DATABASE_URL format."""
        # Just verify it's a string and has expected format
        assert isinstance(DATABASE_URL, str)
        assert "postgresql://" in DATABASE_URL


class TestDatabaseSession:
    """Test database session management."""
    
    def test_get_db_is_generator(self):
        """Test that get_db returns a generator."""
        # This will fail if database is not configured, but we can test the structure
        # In a real scenario, we'd mock SessionLocal
        assert callable(get_db)
        # Verify it's a generator function by checking if it has generator attributes
        import inspect
        assert inspect.isgeneratorfunction(get_db)
    
    def test_get_db_context_is_contextmanager(self):
        """Test that get_db_context is a context manager."""
        assert callable(get_db_context)
        # get_db_context is decorated with @contextmanager, which wraps it
        # We can verify it has the context manager attributes
        from contextlib import _GeneratorContextManager
        # The function itself is callable and can be used as context manager
        # We can't easily test it without a real database, but we verify it exists
        assert hasattr(get_db_context, '__call__')
    
    def test_session_local_config(self):
        """Test SessionLocal configuration."""
        assert SessionLocal is not None
        # Verify it's a sessionmaker
        from sqlalchemy.orm import sessionmaker
        assert isinstance(SessionLocal, sessionmaker)
    
    def test_engine_config(self):
        """Test engine configuration."""
        assert engine is not None
        # Verify it's an engine
        from sqlalchemy import Engine
        assert hasattr(engine, 'connect')

