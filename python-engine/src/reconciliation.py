"""
Deterministic reconciliation engine for matching invoices with bank transactions.
Implements non-AI heuristics to compute match scores and explanations.
"""
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple
from difflib import SequenceMatcher


class ReconciliationEngine:
    """Deterministic reconciliation engine using heuristic-based matching."""
    
    # Tolerance for amount matching (as percentage)
    AMOUNT_TOLERANCE_PERCENT = 0.01  # 1% tolerance
    
    # Date proximity window (in days)
    DATE_PROXIMITY_DAYS = 3
    
    def __init__(self):
        pass
    
    def score_candidates(
        self,
        tenant_id: int,
        invoices: List[Dict[str, Any]],
        transactions: List[Dict[str, Any]],
        top_n: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Score all invoice-transaction pairs and return top N candidates.
        
        Args:
            tenant_id: Tenant identifier
            invoices: List of invoice dictionaries with fields:
                - id, vendor_id, invoice_number, invoice_datetime, amount, currency, description
            transactions: List of bank transaction dictionaries with fields:
                - id, external_id, posted_at, amount, currency, description
            top_n: Number of top candidates to return
            
        Returns:
            List of candidate dictionaries with:
                - invoice_id, transaction_id, score, explanations
        """
        candidates = []
        
        for invoice in invoices:
            for transaction in transactions:
                # Skip if currencies don't match
                invoice_currency = invoice.get('currency', 'USD')
                transaction_currency = transaction.get('currency', 'USD')
                if invoice_currency != transaction_currency:
                    continue
                
                # Compute match score and explanations
                score, explanations = self._compute_match_score(
                    invoice, transaction
                )
                
                if score > 0:  # Only include candidates with positive scores
                    candidates.append({
                        'invoice_id': invoice['id'],
                        'transaction_id': transaction['id'],
                        'score': score,
                        'explanations': explanations
                    })
        
        # Sort by score descending and return top N
        candidates.sort(key=lambda x: x['score'], reverse=True)
        return candidates[:top_n]
    
    def _compute_match_score(
        self,
        invoice: Dict[str, Any],
        transaction: Dict[str, Any]
    ) -> Tuple[float, List[str]]:
        """
        Compute match score and generate human-readable explanations.
        
        Returns:
            Tuple of (score, explanations list)
        """
        score = 0.0
        explanations = []
        
        # 1. Exact amount match
        exact_amount_score = self._exact_amount_match(invoice, transaction)
        if exact_amount_score > 0:
            score += exact_amount_score
            explanations.append("Exact amount match")
        
        # 2. Amount match within tolerance
        tolerance_score = self._amount_tolerance_match(invoice, transaction)
        if tolerance_score > 0 and exact_amount_score == 0:
            score += tolerance_score
            diff = abs(invoice['amount'] - transaction['amount'])
            pct_diff = (diff / invoice['amount']) * 100
            explanations.append(
                f"Amount match within tolerance ({pct_diff:.2f}% difference)"
            )
        
        # 3. Date proximity (within ±3 days)
        date_score = self._date_proximity_match(invoice, transaction)
        if date_score > 0:
            score += date_score
            invoice_date = self._parse_datetime(invoice['invoice_datetime'])
            transaction_date = self._parse_datetime(transaction['posted_at'])
            days_diff = abs((invoice_date - transaction_date).days)
            explanations.append(
                f"Date proximity match (within {days_diff} days)"
            )
        
        # 4. Text similarity heuristic
        text_score = self._text_similarity_match(invoice, transaction)
        if text_score > 0:
            score += text_score
            similarity_ratio = self._compute_text_similarity(
                invoice.get('description', ''),
                transaction.get('description', '')
            )
            explanations.append(
                f"Text similarity match ({similarity_ratio:.0%} similarity)"
            )
        
        # 5. Vendor name hint (check if vendor name appears in transaction description)
        vendor_score = self._vendor_name_match(invoice, transaction)
        if vendor_score > 0:
            score += vendor_score
            explanations.append("Vendor name found in transaction description")
        
        return score, explanations
    
    def _exact_amount_match(
        self,
        invoice: Dict[str, Any],
        transaction: Dict[str, Any]
    ) -> float:
        """Check for exact amount match. Returns score weight."""
        if abs(invoice['amount'] - transaction['amount']) < 0.01:  # Account for floating point
            return 40.0  # High weight for exact match
        return 0.0
    
    def _amount_tolerance_match(
        self,
        invoice: Dict[str, Any],
        transaction: Dict[str, Any]
    ) -> float:
        """Check for amount match within tolerance. Returns score weight."""
        invoice_amount = invoice['amount']
        transaction_amount = transaction['amount']
        
        if invoice_amount == 0:
            return 0.0
        
        diff = abs(invoice_amount - transaction_amount)
        pct_diff = diff / invoice_amount
        
        if pct_diff <= self.AMOUNT_TOLERANCE_PERCENT:
            # Score decreases as difference increases
            score = 30.0 * (1 - pct_diff / self.AMOUNT_TOLERANCE_PERCENT)
            return score
        
        return 0.0
    
    def _date_proximity_match(
        self,
        invoice: Dict[str, Any],
        transaction: Dict[str, Any]
    ) -> float:
        """Check for date proximity within ±3 days. Returns score weight."""
        invoice_date = self._parse_datetime(invoice['invoice_datetime'])
        transaction_date = self._parse_datetime(transaction['posted_at'])
        
        days_diff = abs((invoice_date - transaction_date).days)
        
        if days_diff <= self.DATE_PROXIMITY_DAYS:
            # Score decreases as days increase
            score = 20.0 * (1 - days_diff / self.DATE_PROXIMITY_DAYS)
            return score
        
        return 0.0
    
    def _text_similarity_match(
        self,
        invoice: Dict[str, Any],
        transaction: Dict[str, Any]
    ) -> float:
        """Check for text similarity using contains and ratio. Returns score weight."""
        invoice_desc = (invoice.get('description') or '').lower().strip()
        transaction_desc = (transaction.get('description') or '').lower().strip()
        
        if not invoice_desc or not transaction_desc:
            return 0.0
        
        # Check if one contains the other (simple heuristic)
        if invoice_desc in transaction_desc or transaction_desc in invoice_desc:
            return 15.0
        
        # Compute similarity ratio
        similarity = self._compute_text_similarity(invoice_desc, transaction_desc)
        
        # Threshold for similarity match (e.g., 60% similar)
        if similarity >= 0.6:
            return 10.0 * similarity
        
        return 0.0
    
    def _vendor_name_match(
        self,
        invoice: Dict[str, Any],
        transaction: Dict[str, Any]
    ) -> float:
        """Check if vendor name appears in transaction description. Returns score weight."""
        vendor_name = (invoice.get('vendor_name') or '').lower().strip()
        transaction_desc = (transaction.get('description') or '').lower().strip()
        
        if not vendor_name or not transaction_desc:
            return 0.0
        
        # Check if vendor name is contained in transaction description
        if vendor_name in transaction_desc:
            return 10.0
        
        # Check for partial matches (words from vendor name)
        vendor_words = vendor_name.split()
        if len(vendor_words) > 1:
            # If multiple words, check if at least one significant word matches
            for word in vendor_words:
                if len(word) > 3 and word in transaction_desc:
                    return 5.0
        
        return 0.0
    
    def _compute_text_similarity(self, text1: str, text2: str) -> float:
        """Compute similarity ratio between two texts using SequenceMatcher."""
        return SequenceMatcher(None, text1, text2).ratio()
    
    def _parse_datetime(self, dt: Any) -> datetime:
        """Parse datetime from various formats."""
        if isinstance(dt, datetime):
            return dt
        if isinstance(dt, str):
            # Try ISO format first
            try:
                return datetime.fromisoformat(dt.replace('Z', '+00:00'))
            except ValueError:
                # Try other common formats
                for fmt in ['%Y-%m-%d %H:%M:%S', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%d']:
                    try:
                        return datetime.strptime(dt, fmt)
                    except ValueError:
                        continue
                raise ValueError(f"Unable to parse datetime: {dt}")
        raise TypeError(f"Unsupported datetime type: {type(dt)}")

