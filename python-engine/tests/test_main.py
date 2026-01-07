"""
Unit tests for FastAPI main application.
"""
import pytest
from fastapi.testclient import TestClient
from src.main import app


class TestMainApp:
    """Test suite for FastAPI main application."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.client = TestClient(app)
    
    def test_health_check(self):
        """Test health check endpoint."""
        response = self.client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "healthy"}
    
    def test_app_title(self):
        """Test that app has correct title."""
        assert app.title == "Reconciliation Engine API"
    
    def test_app_description(self):
        """Test that app has correct description."""
        assert "Deterministic reconciliation engine" in app.description
    
    def test_graphql_endpoint_exists(self):
        """Test that GraphQL endpoint is registered."""
        # GraphQL endpoint should exist (though we can't easily test it without a full query)
        # We can at least verify the router is included
        routes = [route.path for route in app.routes]
        assert any("/graphql" in route for route in routes)

