"""
GraphQL schema for the reconciliation engine using Strawberry.
"""
from datetime import datetime
from typing import List, Optional
import strawberry
from .reconciliation import ReconciliationEngine


@strawberry.input
class InvoiceInput:
    """Input type for invoice data."""
    id: int
    vendor_id: int
    invoice_number: str
    invoice_datetime: str  # ISO format string
    amount: float
    currency: str = "USD"
    description: Optional[str] = None
    vendor_name: Optional[str] = None  # For vendor name matching


@strawberry.input
class BankTransactionInput:
    """Input type for bank transaction data."""
    id: int
    external_id: str
    posted_at: str  # ISO format string
    amount: float
    currency: str = "USD"
    description: Optional[str] = None


@strawberry.type
class Explanation:
    """Type for match explanation."""
    reason: str


@strawberry.type
class Candidate:
    """Type for a match candidate result."""
    invoice_id: int
    transaction_id: int
    score: float
    explanations: List[str]


@strawberry.type
class Query:
    """GraphQL Query type."""
    
    @strawberry.field
    def score_candidates(
        self,
        tenant_id: int,
        invoices: List[InvoiceInput],
        transactions: List[BankTransactionInput],
        top_n: int = 10
    ) -> List[Candidate]:
        """
        Score candidates for matching invoices with bank transactions.
        
        Args:
            tenant_id: Tenant identifier
            invoices: List of invoices to match
            transactions: List of bank transactions to match against
            top_n: Number of top candidates to return (default: 10)
            
        Returns:
            List of ranked candidate matches with scores and explanations
        """
        engine = ReconciliationEngine()
        
        # Convert Strawberry input types to dictionaries
        invoice_dicts = [
            {
                'id': inv.id,
                'vendor_id': inv.vendor_id,
                'invoice_number': inv.invoice_number,
                'invoice_datetime': inv.invoice_datetime,
                'amount': inv.amount,
                'currency': inv.currency,
                'description': inv.description,
                'vendor_name': inv.vendor_name,
            }
            for inv in invoices
        ]
        
        transaction_dicts = [
            {
                'id': tx.id,
                'external_id': tx.external_id,
                'posted_at': tx.posted_at,
                'amount': tx.amount,
                'currency': tx.currency,
                'description': tx.description,
            }
            for tx in transactions
        ]
        
        # Compute candidates
        candidates = engine.score_candidates(
            tenant_id=tenant_id,
            invoices=invoice_dicts,
            transactions=transaction_dicts,
            top_n=top_n
        )
        
        # Convert to Strawberry types
        return [
            Candidate(
                invoice_id=cand['invoice_id'],
                transaction_id=cand['transaction_id'],
                score=cand['score'],
                explanations=cand['explanations']
            )
            for cand in candidates
        ]


# Create the schema
schema = strawberry.Schema(query=Query)

