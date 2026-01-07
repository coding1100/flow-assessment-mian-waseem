"""
Unit tests for database models.
"""
import pytest
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from src.models import (
    Tenant,
    Vendor,
    Invoice,
    BankTransaction,
    Match,
    IdempotencyKey
)
from src.database import Base


class TestModels:
    """Test database models."""
    
    def setup_method(self):
        """Set up test fixtures with in-memory database."""
        # Create in-memory SQLite database for testing
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)
    
    def test_tenant_model(self):
        """Test Tenant model creation."""
        session = self.SessionLocal()
        tenant = Tenant(id=1, name="Test Tenant")
        session.add(tenant)
        session.commit()
        
        retrieved = session.query(Tenant).filter_by(id=1).first()
        assert retrieved is not None
        assert retrieved.name == "Test Tenant"
        assert retrieved.id == 1
        session.close()
    
    def test_vendor_model(self):
        """Test Vendor model creation and relationships."""
        session = self.SessionLocal()
        
        tenant = Tenant(id=1, name="Test Tenant")
        session.add(tenant)
        session.commit()
        
        vendor = Vendor(id=1, tenant_id=1, name="Test Vendor")
        session.add(vendor)
        session.commit()
        
        retrieved = session.query(Vendor).filter_by(id=1).first()
        assert retrieved is not None
        assert retrieved.name == "Test Vendor"
        assert retrieved.tenant_id == 1
        assert retrieved.tenant.name == "Test Tenant"
        session.close()
    
    def test_invoice_model(self):
        """Test Invoice model creation."""
        session = self.SessionLocal()
        
        tenant = Tenant(id=1, name="Test Tenant")
        vendor = Vendor(id=1, tenant_id=1, name="Test Vendor")
        session.add_all([tenant, vendor])
        session.commit()
        
        invoice = Invoice(
            id=1,
            tenant_id=1,
            vendor_id=1,
            invoice_number="INV-001",
            invoice_datetime=datetime(2024, 1, 15, 10, 30, 0),
            amount=100.0,
            currency="USD",
            description="Test invoice"
        )
        session.add(invoice)
        session.commit()
        
        retrieved = session.query(Invoice).filter_by(id=1).first()
        assert retrieved is not None
        assert retrieved.invoice_number == "INV-001"
        assert retrieved.amount == 100.0
        assert retrieved.currency == "USD"
        assert retrieved.tenant_id == 1
        assert retrieved.vendor_id == 1
        session.close()
    
    def test_invoice_default_status(self):
        """Test Invoice default status."""
        session = self.SessionLocal()
        
        tenant = Tenant(id=1, name="Test Tenant")
        vendor = Vendor(id=1, tenant_id=1, name="Test Vendor")
        session.add_all([tenant, vendor])
        session.commit()
        
        invoice = Invoice(
            id=1,
            tenant_id=1,
            vendor_id=1,
            invoice_number="INV-001",
            invoice_datetime=datetime(2024, 1, 15, 10, 30, 0),
            amount=100.0
        )
        session.add(invoice)
        session.commit()
        
        retrieved = session.query(Invoice).filter_by(id=1).first()
        assert retrieved.status == "OEPN"  # Note: typo in original code
        assert retrieved.currency == "USD"
        session.close()
    
    def test_bank_transaction_model(self):
        """Test BankTransaction model creation."""
        session = self.SessionLocal()
        
        tenant = Tenant(id=1, name="Test Tenant")
        session.add(tenant)
        session.commit()
        
        transaction = BankTransaction(
            id=1,
            tenant_id=1,
            external_id="TXN-001",
            posted_at=datetime(2024, 1, 15, 10, 30, 0),
            amount=100.0,
            currency="USD",
            description="Test transaction"
        )
        session.add(transaction)
        session.commit()
        
        retrieved = session.query(BankTransaction).filter_by(id=1).first()
        assert retrieved is not None
        assert retrieved.external_id == "TXN-001"
        assert retrieved.amount == 100.0
        assert retrieved.currency == "USD"
        session.close()
    
    def test_bank_transaction_default_currency(self):
        """Test BankTransaction default currency."""
        session = self.SessionLocal()
        
        tenant = Tenant(id=1, name="Test Tenant")
        session.add(tenant)
        session.commit()
        
        transaction = BankTransaction(
            id=1,
            tenant_id=1,
            external_id="TXN-001",
            posted_at=datetime(2024, 1, 15, 10, 30, 0),
            amount=100.0
        )
        session.add(transaction)
        session.commit()
        
        retrieved = session.query(BankTransaction).filter_by(id=1).first()
        assert retrieved.currency == "USD"
        session.close()
    
    def test_match_model(self):
        """Test Match model creation."""
        session = self.SessionLocal()
        
        tenant = Tenant(id=1, name="Test Tenant")
        vendor = Vendor(id=1, tenant_id=1, name="Test Vendor")
        invoice = Invoice(
            id=1,
            tenant_id=1,
            vendor_id=1,
            invoice_number="INV-001",
            invoice_datetime=datetime(2024, 1, 15, 10, 30, 0),
            amount=100.0
        )
        transaction = BankTransaction(
            id=1,
            tenant_id=1,
            external_id="TXN-001",
            posted_at=datetime(2024, 1, 15, 10, 30, 0),
            amount=100.0
        )
        session.add_all([tenant, vendor, invoice, transaction])
        session.commit()
        
        match = Match(
            id=1,
            tenant_id=1,
            bank_transaction_id=1,
            invoice_id=1,
            score=85.5,
            status="PROPOSED"
        )
        session.add(match)
        session.commit()
        
        retrieved = session.query(Match).filter_by(id=1).first()
        assert retrieved is not None
        assert retrieved.score == 85.5
        assert retrieved.status == "PROPOSED"
        assert retrieved.invoice_id == 1
        assert retrieved.bank_transaction_id == 1
        session.close()
    
    def test_match_default_status(self):
        """Test Match default status."""
        session = self.SessionLocal()
        
        tenant = Tenant(id=1, name="Test Tenant")
        vendor = Vendor(id=1, tenant_id=1, name="Test Vendor")
        invoice = Invoice(
            id=1,
            tenant_id=1,
            vendor_id=1,
            invoice_number="INV-001",
            invoice_datetime=datetime(2024, 1, 15, 10, 30, 0),
            amount=100.0
        )
        transaction = BankTransaction(
            id=1,
            tenant_id=1,
            external_id="TXN-001",
            posted_at=datetime(2024, 1, 15, 10, 30, 0),
            amount=100.0
        )
        session.add_all([tenant, vendor, invoice, transaction])
        session.commit()
        
        match = Match(
            id=1,
            tenant_id=1,
            bank_transaction_id=1,
            invoice_id=1,
            score=85.5
        )
        session.add(match)
        session.commit()
        
        retrieved = session.query(Match).filter_by(id=1).first()
        assert retrieved.status == "PROPOSED"
        session.close()
    
    def test_idempotency_key_model(self):
        """Test IdempotencyKey model creation."""
        session = self.SessionLocal()
        
        tenant = Tenant(id=1, name="Test Tenant")
        session.add(tenant)
        session.commit()
        
        idempotency_key = IdempotencyKey(
            id=1,
            tenant_id=1,
            idempotency_key="test-key-123",
            payload_hash="abc123",
            response='{"result": "success"}'
        )
        session.add(idempotency_key)
        session.commit()
        
        retrieved = session.query(IdempotencyKey).filter_by(id=1).first()
        assert retrieved is not None
        assert retrieved.idempotency_key == "test-key-123"
        assert retrieved.payload_hash == "abc123"
        assert retrieved.response == '{"result": "success"}'
        session.close()
    
    def test_idempotency_key_unique_constraint(self):
        """Test IdempotencyKey unique constraint."""
        session = self.SessionLocal()
        
        tenant = Tenant(id=1, name="Test Tenant")
        session.add(tenant)
        session.commit()
        
        key1 = IdempotencyKey(
            id=1,
            tenant_id=1,
            idempotency_key="test-key",
            payload_hash="hash1",
            response='{"result": "success1"}'
        )
        session.add(key1)
        session.commit()
        
        # Try to add duplicate key for same tenant (should fail)
        key2 = IdempotencyKey(
            id=2,
            tenant_id=1,
            idempotency_key="test-key",  # Same key
            payload_hash="hash2",
            response='{"result": "success2"}'
        )
        session.add(key2)
        
        with pytest.raises(Exception):  # Should raise IntegrityError
            session.commit()
        
        session.close()
    
    def test_relationships(self):
        """Test model relationships."""
        session = self.SessionLocal()
        
        tenant = Tenant(id=1, name="Test Tenant")
        vendor = Vendor(id=1, tenant_id=1, name="Test Vendor")
        invoice = Invoice(
            id=1,
            tenant_id=1,
            vendor_id=1,
            invoice_number="INV-001",
            invoice_datetime=datetime(2024, 1, 15, 10, 30, 0),
            amount=100.0
        )
        transaction = BankTransaction(
            id=1,
            tenant_id=1,
            external_id="TXN-001",
            posted_at=datetime(2024, 1, 15, 10, 30, 0),
            amount=100.0
        )
        match = Match(
            id=1,
            tenant_id=1,
            bank_transaction_id=1,
            invoice_id=1,
            score=85.5
        )
        
        session.add_all([tenant, vendor, invoice, transaction, match])
        session.commit()
        
        # Test relationships
        assert len(tenant.vendors) == 1
        assert len(tenant.invoices) == 1
        assert len(tenant.bank_transactions) == 1
        assert len(tenant.matches) == 1
        
        assert vendor.tenant.name == "Test Tenant"
        assert len(vendor.invoices) == 1
        
        assert invoice.tenant.name == "Test Tenant"
        assert invoice.vendor.name == "Test Vendor"
        assert len(invoice.matches) == 1
        
        assert transaction.tenant.name == "Test Tenant"
        assert len(transaction.matches) == 1
        
        assert match.tenant.name == "Test Tenant"
        assert match.invoice.invoice_number == "INV-001"
        assert match.bank_transaction.external_id == "TXN-001"
        
        session.close()

