"""
Unit tests for GraphQL schema.
"""
import pytest
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime
from src.graphql_schema import (
    InvoiceInput,
    BankTransactionInput,
    Candidate,
    Explanation,
    Query,
    schema
)


class TestGraphQLInputs:
    """Test GraphQL input types."""
    
    def test_invoice_input(self):
        """Test InvoiceInput creation."""
        invoice = InvoiceInput(
            id=1,
            vendor_id=1,
            invoice_number="INV-001",
            invoice_datetime="2024-01-15T10:30:00",
            amount=100.0,
            currency="USD",
            description="Test invoice",
            vendor_name="Acme Corp"
        )
        assert invoice.id == 1
        assert invoice.vendor_id == 1
        assert invoice.invoice_number == "INV-001"
        assert invoice.amount == 100.0
        assert invoice.currency == "USD"
        assert invoice.description == "Test invoice"
        assert invoice.vendor_name == "Acme Corp"
    
    def test_invoice_input_defaults(self):
        """Test InvoiceInput with default values."""
        invoice = InvoiceInput(
            id=1,
            vendor_id=1,
            invoice_number="INV-001",
            invoice_datetime="2024-01-15T10:30:00",
            amount=100.0
        )
        assert invoice.currency == "USD"
        assert invoice.description is None
        assert invoice.vendor_name is None
    
    def test_bank_transaction_input(self):
        """Test BankTransactionInput creation."""
        transaction = BankTransactionInput(
            id=1,
            external_id="TXN-001",
            posted_at="2024-01-15T10:30:00",
            amount=100.0,
            currency="USD",
            description="Test transaction"
        )
        assert transaction.id == 1
        assert transaction.external_id == "TXN-001"
        assert transaction.posted_at == "2024-01-15T10:30:00"
        assert transaction.amount == 100.0
        assert transaction.currency == "USD"
        assert transaction.description == "Test transaction"
    
    def test_bank_transaction_input_defaults(self):
        """Test BankTransactionInput with default values."""
        transaction = BankTransactionInput(
            id=1,
            external_id="TXN-001",
            posted_at="2024-01-15T10:30:00",
            amount=100.0
        )
        assert transaction.currency == "USD"
        assert transaction.description is None


class TestGraphQLTypes:
    """Test GraphQL output types."""
    
    def test_candidate(self):
        """Test Candidate type creation."""
        candidate = Candidate(
            invoice_id=1,
            transaction_id=2,
            score=85.5,
            explanations=["Exact amount match", "Date proximity match"]
        )
        assert candidate.invoice_id == 1
        assert candidate.transaction_id == 2
        assert candidate.score == 85.5
        assert len(candidate.explanations) == 2
        assert "Exact amount match" in candidate.explanations


class TestGraphQLQuery:
    """Test GraphQL Query resolver."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.query = Query()
    
    @patch('src.graphql_schema.ReconciliationEngine')
    def test_score_candidates_success(self, mock_engine_class):
        """Test score_candidates resolver with successful match."""
        # Mock the engine instance
        mock_engine = Mock()
        mock_engine_class.return_value = mock_engine
        
        # Mock the score_candidates method
        mock_engine.score_candidates.return_value = [
            {
                'invoice_id': 1,
                'transaction_id': 2,
                'score': 85.5,
                'explanations': ['Exact amount match', 'Date proximity match']
            }
        ]
        
        # Create input objects
        invoices = [
            InvoiceInput(
                id=1,
                vendor_id=1,
                invoice_number="INV-001",
                invoice_datetime="2024-01-15T10:30:00",
                amount=100.0,
                currency="USD"
            )
        ]
        transactions = [
            BankTransactionInput(
                id=2,
                external_id="TXN-001",
                posted_at="2024-01-15T10:30:00",
                amount=100.0,
                currency="USD"
            )
        ]
        
        # Call the resolver
        result = self.query.score_candidates(
            tenant_id=1,
            invoices=invoices,
            transactions=transactions,
            top_n=10
        )
        
        # Verify results
        assert len(result) == 1
        assert isinstance(result[0], Candidate)
        assert result[0].invoice_id == 1
        assert result[0].transaction_id == 2
        assert result[0].score == 85.5
        assert len(result[0].explanations) == 2
        
        # Verify engine was called correctly
        mock_engine.score_candidates.assert_called_once()
        call_args = mock_engine.score_candidates.call_args
        assert call_args[1]['tenant_id'] == 1
        assert call_args[1]['top_n'] == 10
        assert len(call_args[1]['invoices']) == 1
        assert len(call_args[1]['transactions']) == 1
    
    @patch('src.graphql_schema.ReconciliationEngine')
    def test_score_candidates_multiple_results(self, mock_engine_class):
        """Test score_candidates resolver with multiple results."""
        mock_engine = Mock()
        mock_engine_class.return_value = mock_engine
        
        mock_engine.score_candidates.return_value = [
            {
                'invoice_id': 1,
                'transaction_id': 2,
                'score': 90.0,
                'explanations': ['Exact amount match']
            },
            {
                'invoice_id': 1,
                'transaction_id': 3,
                'score': 75.0,
                'explanations': ['Amount match within tolerance']
            }
        ]
        
        invoices = [
            InvoiceInput(
                id=1,
                vendor_id=1,
                invoice_number="INV-001",
                invoice_datetime="2024-01-15T10:30:00",
                amount=100.0
            )
        ]
        transactions = [
            BankTransactionInput(
                id=2,
                external_id="TXN-001",
                posted_at="2024-01-15T10:30:00",
                amount=100.0
            ),
            BankTransactionInput(
                id=3,
                external_id="TXN-002",
                posted_at="2024-01-16T10:30:00",
                amount=99.5
            )
        ]
        
        result = self.query.score_candidates(
            tenant_id=1,
            invoices=invoices,
            transactions=transactions,
            top_n=10
        )
        
        assert len(result) == 2
        assert result[0].score == 90.0
        assert result[1].score == 75.0
    
    @patch('src.graphql_schema.ReconciliationEngine')
    def test_score_candidates_default_top_n(self, mock_engine_class):
        """Test score_candidates resolver with default top_n."""
        mock_engine = Mock()
        mock_engine_class.return_value = mock_engine
        mock_engine.score_candidates.return_value = []
        
        invoices = [
            InvoiceInput(
                id=1,
                vendor_id=1,
                invoice_number="INV-001",
                invoice_datetime="2024-01-15T10:30:00",
                amount=100.0
            )
        ]
        transactions = [
            BankTransactionInput(
                id=2,
                external_id="TXN-001",
                posted_at="2024-01-15T10:30:00",
                amount=100.0
            )
        ]
        
        result = self.query.score_candidates(
            tenant_id=1,
            invoices=invoices,
            transactions=transactions
        )
        
        # Verify default top_n was used
        call_args = mock_engine.score_candidates.call_args
        assert call_args[1]['top_n'] == 10
    
    @patch('src.graphql_schema.ReconciliationEngine')
    def test_score_candidates_custom_top_n(self, mock_engine_class):
        """Test score_candidates resolver with custom top_n."""
        mock_engine = Mock()
        mock_engine_class.return_value = mock_engine
        mock_engine.score_candidates.return_value = []
        
        invoices = [
            InvoiceInput(
                id=1,
                vendor_id=1,
                invoice_number="INV-001",
                invoice_datetime="2024-01-15T10:30:00",
                amount=100.0
            )
        ]
        transactions = [
            BankTransactionInput(
                id=2,
                external_id="TXN-001",
                posted_at="2024-01-15T10:30:00",
                amount=100.0
            )
        ]
        
        result = self.query.score_candidates(
            tenant_id=1,
            invoices=invoices,
            transactions=transactions,
            top_n=5
        )
        
        # Verify custom top_n was used
        call_args = mock_engine.score_candidates.call_args
        assert call_args[1]['top_n'] == 5
    
    @patch('src.graphql_schema.ReconciliationEngine')
    def test_score_candidates_empty_inputs(self, mock_engine_class):
        """Test score_candidates resolver with empty inputs."""
        mock_engine = Mock()
        mock_engine_class.return_value = mock_engine
        mock_engine.score_candidates.return_value = []
        
        result = self.query.score_candidates(
            tenant_id=1,
            invoices=[],
            transactions=[],
            top_n=10
        )
        
        assert len(result) == 0
        mock_engine.score_candidates.assert_called_once()
    
    @patch('src.graphql_schema.ReconciliationEngine')
    def test_score_candidates_input_conversion(self, mock_engine_class):
        """Test that input types are correctly converted to dictionaries."""
        mock_engine = Mock()
        mock_engine_class.return_value = mock_engine
        mock_engine.score_candidates.return_value = []
        
        invoices = [
            InvoiceInput(
                id=1,
                vendor_id=2,
                invoice_number="INV-001",
                invoice_datetime="2024-01-15T10:30:00",
                amount=100.0,
                currency="EUR",
                description="Test description",
                vendor_name="Test Vendor"
            )
        ]
        transactions = [
            BankTransactionInput(
                id=3,
                external_id="TXN-001",
                posted_at="2024-01-15T10:30:00",
                amount=100.0,
                currency="EUR",
                description="Transaction description"
            )
        ]
        
        self.query.score_candidates(
            tenant_id=1,
            invoices=invoices,
            transactions=transactions,
            top_n=10
        )
        
        # Verify the dictionaries passed to engine
        call_args = mock_engine.score_candidates.call_args
        invoice_dict = call_args[1]['invoices'][0]
        transaction_dict = call_args[1]['transactions'][0]
        
        assert invoice_dict['id'] == 1
        assert invoice_dict['vendor_id'] == 2
        assert invoice_dict['invoice_number'] == "INV-001"
        assert invoice_dict['amount'] == 100.0
        assert invoice_dict['currency'] == "EUR"
        assert invoice_dict['description'] == "Test description"
        assert invoice_dict['vendor_name'] == "Test Vendor"
        
        assert transaction_dict['id'] == 3
        assert transaction_dict['external_id'] == "TXN-001"
        assert transaction_dict['amount'] == 100.0
        assert transaction_dict['currency'] == "EUR"
        assert transaction_dict['description'] == "Transaction description"


class TestGraphQLSchema:
    """Test GraphQL schema creation."""
    
    def test_schema_creation(self):
        """Test that schema is created successfully."""
        assert schema is not None
        assert hasattr(schema, 'query')

