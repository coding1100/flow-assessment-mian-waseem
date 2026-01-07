"""
Unit tests for the reconciliation engine.
"""
import pytest
from datetime import datetime, timedelta
from src.reconciliation import ReconciliationEngine


class TestReconciliationEngine:
    """Test suite for ReconciliationEngine."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.engine = ReconciliationEngine()
    
    def test_init(self):
        """Test engine initialization."""
        engine = ReconciliationEngine()
        assert engine.AMOUNT_TOLERANCE_PERCENT == 0.01
        assert engine.DATE_PROXIMITY_DAYS == 3
    
    def test_exact_amount_match(self):
        """Test exact amount matching."""
        invoice = {'amount': 100.0, 'currency': 'USD'}
        transaction = {'amount': 100.0, 'currency': 'USD'}
        
        score = self.engine._exact_amount_match(invoice, transaction)
        assert score == 40.0
    
    def test_exact_amount_match_with_floating_point_tolerance(self):
        """Test exact amount match with floating point precision."""
        invoice = {'amount': 100.0, 'currency': 'USD'}
        transaction = {'amount': 100.005, 'currency': 'USD'}
        
        score = self.engine._exact_amount_match(invoice, transaction)
        assert score == 40.0  # Within 0.01 tolerance
    
    def test_exact_amount_match_no_match(self):
        """Test exact amount match when amounts differ."""
        invoice = {'amount': 100.0, 'currency': 'USD'}
        transaction = {'amount': 100.02, 'currency': 'USD'}
        
        score = self.engine._exact_amount_match(invoice, transaction)
        assert score == 0.0
    
    def test_amount_tolerance_match_within_tolerance(self):
        """Test amount match within tolerance."""
        invoice = {'amount': 100.0, 'currency': 'USD'}
        transaction = {'amount': 100.5, 'currency': 'USD'}  # 0.5% difference
        
        score = self.engine._amount_tolerance_match(invoice, transaction)
        assert score > 0
        assert score <= 30.0
    
    def test_amount_tolerance_match_exact(self):
        """Test amount tolerance match with exact amount."""
        invoice = {'amount': 100.0, 'currency': 'USD'}
        transaction = {'amount': 100.0, 'currency': 'USD'}
        
        score = self.engine._amount_tolerance_match(invoice, transaction)
        assert score == 30.0
    
    def test_amount_tolerance_match_outside_tolerance(self):
        """Test amount match outside tolerance."""
        invoice = {'amount': 100.0, 'currency': 'USD'}
        transaction = {'amount': 102.0, 'currency': 'USD'}  # 2% difference
        
        score = self.engine._amount_tolerance_match(invoice, transaction)
        assert score == 0.0
    
    def test_amount_tolerance_match_zero_invoice(self):
        """Test amount tolerance match with zero invoice amount."""
        invoice = {'amount': 0.0, 'currency': 'USD'}
        transaction = {'amount': 100.0, 'currency': 'USD'}
        
        score = self.engine._amount_tolerance_match(invoice, transaction)
        assert score == 0.0
    
    def test_date_proximity_match_within_window(self):
        """Test date proximity match within window."""
        base_date = datetime(2024, 1, 15)
        invoice = {'invoice_datetime': base_date.isoformat()}
        transaction = {'posted_at': (base_date + timedelta(days=2)).isoformat()}
        
        score = self.engine._date_proximity_match(invoice, transaction)
        assert score > 0
        assert score <= 20.0
    
    def test_date_proximity_match_exact_date(self):
        """Test date proximity match with exact date."""
        base_date = datetime(2024, 1, 15)
        invoice = {'invoice_datetime': base_date.isoformat()}
        transaction = {'posted_at': base_date.isoformat()}
        
        score = self.engine._date_proximity_match(invoice, transaction)
        assert score == 20.0
    
    def test_date_proximity_match_outside_window(self):
        """Test date proximity match outside window."""
        base_date = datetime(2024, 1, 15)
        invoice = {'invoice_datetime': base_date.isoformat()}
        transaction = {'posted_at': (base_date + timedelta(days=5)).isoformat()}
        
        score = self.engine._date_proximity_match(invoice, transaction)
        assert score == 0.0
    
    def test_date_proximity_match_negative_days(self):
        """Test date proximity match with negative days difference."""
        base_date = datetime(2024, 1, 15)
        invoice = {'invoice_datetime': base_date.isoformat()}
        transaction = {'posted_at': (base_date - timedelta(days=2)).isoformat()}
        
        score = self.engine._date_proximity_match(invoice, transaction)
        assert score > 0
    
    def test_text_similarity_match_contains(self):
        """Test text similarity when one contains the other."""
        invoice = {'description': 'Payment for services'}
        transaction = {'description': 'Payment for services rendered'}
        
        score = self.engine._text_similarity_match(invoice, transaction)
        assert score == 15.0
    
    def test_text_similarity_match_reverse_contains(self):
        """Test text similarity when transaction contains invoice."""
        invoice = {'description': 'Payment for services'}
        transaction = {'description': 'Payment for services rendered'}
        
        score = self.engine._text_similarity_match(invoice, transaction)
        assert score == 15.0
    
    def test_text_similarity_match_high_similarity(self):
        """Test text similarity with high similarity ratio."""
        invoice = {'description': 'Payment for services'}
        transaction = {'description': 'Payment for servicess'}  # Typo but similar
        
        score = self.engine._text_similarity_match(invoice, transaction)
        # Should use ratio-based scoring if contains doesn't match
        assert score >= 0
    
    def test_text_similarity_match_no_description(self):
        """Test text similarity with missing descriptions."""
        invoice = {'description': None}
        transaction = {'description': 'Payment'}
        
        score = self.engine._text_similarity_match(invoice, transaction)
        assert score == 0.0
    
    def test_text_similarity_match_empty_strings(self):
        """Test text similarity with empty strings."""
        invoice = {'description': ''}
        transaction = {'description': ''}
        
        score = self.engine._text_similarity_match(invoice, transaction)
        assert score == 0.0
    
    def test_vendor_name_match_exact(self):
        """Test vendor name match when found in transaction."""
        invoice = {'vendor_name': 'Acme Corp'}
        transaction = {'description': 'Payment to Acme Corp for services'}
        
        score = self.engine._vendor_name_match(invoice, transaction)
        assert score == 10.0
    
    def test_vendor_name_match_partial_word(self):
        """Test vendor name match with partial word match."""
        invoice = {'vendor_name': 'Acme Corporation'}
        transaction = {'description': 'Payment to Acme for services'}
        
        score = self.engine._vendor_name_match(invoice, transaction)
        assert score == 5.0  # Partial match
    
    def test_vendor_name_match_no_vendor_name(self):
        """Test vendor name match with missing vendor name."""
        invoice = {'vendor_name': None}
        transaction = {'description': 'Payment to Acme Corp'}
        
        score = self.engine._vendor_name_match(invoice, transaction)
        assert score == 0.0
    
    def test_vendor_name_match_no_transaction_description(self):
        """Test vendor name match with missing transaction description."""
        invoice = {'vendor_name': 'Acme Corp'}
        transaction = {'description': None}
        
        score = self.engine._vendor_name_match(invoice, transaction)
        assert score == 0.0
    
    def test_vendor_name_match_short_word(self):
        """Test vendor name match with short words (should be ignored)."""
        invoice = {'vendor_name': 'Acme Corp'}
        transaction = {'description': 'Payment to Corp'}
        
        score = self.engine._vendor_name_match(invoice, transaction)
        # "Corp" is 4 chars, should match
        assert score == 5.0
    
    def test_compute_text_similarity(self):
        """Test text similarity computation."""
        text1 = "Payment for services"
        text2 = "Payment for services"
        
        similarity = self.engine._compute_text_similarity(text1, text2)
        assert similarity == 1.0
    
    def test_compute_text_similarity_different(self):
        """Test text similarity with different texts."""
        text1 = "Payment for services"
        text2 = "Completely different text"
        
        similarity = self.engine._compute_text_similarity(text1, text2)
        assert 0.0 <= similarity < 1.0
    
    def test_parse_datetime_from_datetime(self):
        """Test parsing datetime from datetime object."""
        dt = datetime(2024, 1, 15, 10, 30, 0)
        result = self.engine._parse_datetime(dt)
        assert result == dt
    
    def test_parse_datetime_from_iso_string(self):
        """Test parsing datetime from ISO string."""
        dt_str = "2024-01-15T10:30:00"
        result = self.engine._parse_datetime(dt_str)
        assert isinstance(result, datetime)
        assert result.year == 2024
        assert result.month == 1
        assert result.day == 15
    
    def test_parse_datetime_from_iso_string_with_z(self):
        """Test parsing datetime from ISO string with Z."""
        dt_str = "2024-01-15T10:30:00Z"
        result = self.engine._parse_datetime(dt_str)
        assert isinstance(result, datetime)
    
    def test_parse_datetime_from_common_format(self):
        """Test parsing datetime from common format."""
        dt_str = "2024-01-15 10:30:00"
        result = self.engine._parse_datetime(dt_str)
        assert isinstance(result, datetime)
        assert result.year == 2024
    
    def test_parse_datetime_from_date_only(self):
        """Test parsing datetime from date-only string."""
        dt_str = "2024-01-15"
        result = self.engine._parse_datetime(dt_str)
        assert isinstance(result, datetime)
        assert result.year == 2024
    
    def test_parse_datetime_invalid_format(self):
        """Test parsing datetime with invalid format."""
        dt_str = "invalid-date"
        with pytest.raises(ValueError):
            self.engine._parse_datetime(dt_str)
    
    def test_parse_datetime_unsupported_type(self):
        """Test parsing datetime with unsupported type."""
        with pytest.raises(TypeError):
            self.engine._parse_datetime(12345)
    
    def test_compute_match_score_exact_match(self):
        """Test computing match score with exact match."""
        invoice = {
            'id': 1,
            'amount': 100.0,
            'currency': 'USD',
            'invoice_datetime': '2024-01-15T10:30:00',
            'description': 'Payment for services',
            'vendor_name': 'Acme Corp'
        }
        transaction = {
            'id': 1,
            'amount': 100.0,
            'currency': 'USD',
            'posted_at': '2024-01-15T10:30:00',
            'description': 'Payment for services to Acme Corp'
        }
        
        score, explanations = self.engine._compute_match_score(invoice, transaction)
        assert score > 0
        assert len(explanations) > 0
        assert "Exact amount match" in explanations
    
    def test_compute_match_score_tolerance_match(self):
        """Test computing match score with tolerance match."""
        invoice = {
            'id': 1,
            'amount': 100.0,
            'currency': 'USD',
            'invoice_datetime': '2024-01-15T10:30:00',
            'description': 'Payment',
            'vendor_name': None
        }
        transaction = {
            'id': 1,
            'amount': 100.5,
            'currency': 'USD',
            'posted_at': '2024-01-15T10:30:00',
            'description': 'Payment'
        }
        
        score, explanations = self.engine._compute_match_score(invoice, transaction)
        assert score > 0
        assert any("tolerance" in exp.lower() for exp in explanations)
    
    def test_compute_match_score_no_match(self):
        """Test computing match score with no matches."""
        invoice = {
            'id': 1,
            'amount': 100.0,
            'currency': 'USD',
            'invoice_datetime': '2024-01-15T10:30:00',
            'description': 'Payment A',
            'vendor_name': None
        }
        transaction = {
            'id': 1,
            'amount': 500.0,
            'currency': 'USD',
            'posted_at': '2024-06-15T10:30:00',
            'description': 'Different payment'
        }
        
        score, explanations = self.engine._compute_match_score(invoice, transaction)
        assert score == 0.0
        assert len(explanations) == 0
    
    def test_score_candidates_single_match(self):
        """Test scoring candidates with single match."""
        invoices = [{
            'id': 1,
            'vendor_id': 1,
            'invoice_number': 'INV-001',
            'invoice_datetime': '2024-01-15T10:30:00',
            'amount': 100.0,
            'currency': 'USD',
            'description': 'Payment',
            'vendor_name': None
        }]
        transactions = [{
            'id': 1,
            'external_id': 'TXN-001',
            'posted_at': '2024-01-15T10:30:00',
            'amount': 100.0,
            'currency': 'USD',
            'description': 'Payment'
        }]
        
        candidates = self.engine.score_candidates(
            tenant_id=1,
            invoices=invoices,
            transactions=transactions,
            top_n=10
        )
        
        assert len(candidates) == 1
        assert candidates[0]['invoice_id'] == 1
        assert candidates[0]['transaction_id'] == 1
        assert candidates[0]['score'] > 0
    
    def test_score_candidates_multiple_matches(self):
        """Test scoring candidates with multiple matches."""
        invoices = [
            {
                'id': 1,
                'vendor_id': 1,
                'invoice_number': 'INV-001',
                'invoice_datetime': '2024-01-15T10:30:00',
                'amount': 100.0,
                'currency': 'USD',
                'description': 'Payment A',
                'vendor_name': None
            },
            {
                'id': 2,
                'vendor_id': 2,
                'invoice_number': 'INV-002',
                'invoice_datetime': '2024-01-16T10:30:00',
                'amount': 200.0,
                'currency': 'USD',
                'description': 'Payment B',
                'vendor_name': None
            }
        ]
        transactions = [
            {
                'id': 1,
                'external_id': 'TXN-001',
                'posted_at': '2024-01-15T10:30:00',
                'amount': 100.0,
                'currency': 'USD',
                'description': 'Payment A'
            },
            {
                'id': 2,
                'external_id': 'TXN-002',
                'posted_at': '2024-01-16T10:30:00',
                'amount': 200.0,
                'currency': 'USD',
                'description': 'Payment B'
            }
        ]
        
        candidates = self.engine.score_candidates(
            tenant_id=1,
            invoices=invoices,
            transactions=transactions,
            top_n=10
        )
        
        assert len(candidates) == 4  # 2 invoices × 2 transactions
        # Should be sorted by score descending
        assert candidates[0]['score'] >= candidates[1]['score']
    
    def test_score_candidates_currency_mismatch(self):
        """Test scoring candidates with currency mismatch."""
        invoices = [{
            'id': 1,
            'vendor_id': 1,
            'invoice_number': 'INV-001',
            'invoice_datetime': '2024-01-15T10:30:00',
            'amount': 100.0,
            'currency': 'USD',
            'description': 'Payment',
            'vendor_name': None
        }]
        transactions = [{
            'id': 1,
            'external_id': 'TXN-001',
            'posted_at': '2024-01-15T10:30:00',
            'amount': 100.0,
            'currency': 'EUR',
            'description': 'Payment'
        }]
        
        candidates = self.engine.score_candidates(
            tenant_id=1,
            invoices=invoices,
            transactions=transactions,
            top_n=10
        )
        
        assert len(candidates) == 0
    
    def test_score_candidates_default_currency(self):
        """Test scoring candidates with default currency."""
        invoices = [{
            'id': 1,
            'vendor_id': 1,
            'invoice_number': 'INV-001',
            'invoice_datetime': '2024-01-15T10:30:00',
            'amount': 100.0,
            'description': 'Payment',
            'vendor_name': None
        }]
        transactions = [{
            'id': 1,
            'external_id': 'TXN-001',
            'posted_at': '2024-01-15T10:30:00',
            'amount': 100.0,
            'description': 'Payment'
        }]
        
        candidates = self.engine.score_candidates(
            tenant_id=1,
            invoices=invoices,
            transactions=transactions,
            top_n=10
        )
        
        assert len(candidates) > 0  # Should match with default USD
    
    def test_score_candidates_top_n_limit(self):
        """Test scoring candidates with top_n limit."""
        invoices = [
            {
                'id': i,
                'vendor_id': 1,
                'invoice_number': f'INV-{i:03d}',
                'invoice_datetime': '2024-01-15T10:30:00',
                'amount': 100.0 + i,
                'currency': 'USD',
                'description': f'Payment {i}',
                'vendor_name': None
            }
            for i in range(1, 6)
        ]
        transactions = [
            {
                'id': i,
                'external_id': f'TXN-{i:03d}',
                'posted_at': '2024-01-15T10:30:00',
                'amount': 100.0 + i,
                'currency': 'USD',
                'description': f'Payment {i}'
            }
            for i in range(1, 6)
        ]
        
        candidates = self.engine.score_candidates(
            tenant_id=1,
            invoices=invoices,
            transactions=transactions,
            top_n=3
        )
        
        assert len(candidates) == 3
    
    def test_score_candidates_no_positive_scores(self):
        """Test scoring candidates when no matches have positive scores."""
        invoices = [{
            'id': 1,
            'vendor_id': 1,
            'invoice_number': 'INV-001',
            'invoice_datetime': '2024-01-15T10:30:00',
            'amount': 100.0,
            'currency': 'USD',
            'description': 'Payment A',
            'vendor_name': None
        }]
        transactions = [{
            'id': 1,
            'external_id': 'TXN-001',
            'posted_at': '2024-06-15T10:30:00',
            'amount': 500.0,
            'currency': 'USD',
            'description': 'Completely different'
        }]
        
        candidates = self.engine.score_candidates(
            tenant_id=1,
            invoices=invoices,
            transactions=transactions,
            top_n=10
        )
        
        assert len(candidates) == 0

