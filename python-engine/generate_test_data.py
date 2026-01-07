#!/usr/bin/env python3
"""
Generate 20 invoices and 20 bank transactions and insert them directly into PostgreSQL.
Uses SQLAlchemy models from the python-engine.
"""
import sys
import os
from datetime import datetime, timedelta
from random import choice, uniform, randint
import uuid

# Add python-engine to path for imports
# python_engine_path = os.path.join(os.path.dirname(__file__), 'python-engine')
# if python_engine_path not in sys.path:
#     sys.path.insert(0, python_engine_path)

from dotenv import dotenv_values
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Import models (python-engine/src/models.py)
from src.models import Tenant, Vendor, Invoice, BankTransaction
from src.database import Base

# Load environment variables
config = {
    **dotenv_values("../.env"),  # load shared environment variables
    **dotenv_values(".env"),  # load python-engine variables
    **os.environ,  # system environment variables
}

# Build DATABASE_URL from config (same as database.py)
DATABASE_URL = (
    f"postgresql+psycopg2://{config.get('DB_USER', 'postgres')}:{config.get('DB_PASSWORD', 'postgres')}"
    f"@{config.get('DB_HOST', 'localhost')}:{config.get('DB_PORT', '5432')}/{config.get('DB_NAME', 'postgres')}"
)

# Create engine and session
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Sample data
VENDOR_NAMES = [
    "Office Depot",
    "Cloud Hosting Services",
    "Software License Provider",
    "Equipment Supplier",
    "Marketing Agency",
    "Bank Services",
    "Consulting Services Inc",
    "IT Support Solutions",
    "Office Supplies Co",
    "Professional Services Group",
]

INVOICE_DESCRIPTIONS = [
    "Office supplies purchase",
    "Cloud hosting service - January",
    "Software license renewal",
    "Equipment purchase - laptops",
    "Marketing campaign expenses",
    "Bank service fee",
    "Consulting services",
    "IT support and maintenance",
    "Office furniture",
    "Professional development training",
    "Software subscription",
    "Hardware upgrade",
    "Marketing materials",
    "Legal services",
    "Accounting services",
]

TRANSACTION_DESCRIPTIONS = [
    "Payment from customer ABC Corp",
    "Office supplies purchase",
    "Monthly subscription payment",
    "Invoice payment #INV-2024-001",
    "Software license renewal",
    "Client retainer payment",
    "Cloud hosting service - January",
    "Consulting services payment",
    "Marketing campaign expenses",
    "Quarterly revenue payment from partner",
    "Equipment purchase - laptops",
    "Refund processed",
    "Bank service fee",
    "Large enterprise contract payment",
    "Payment processing fee",
]

def get_or_create_tenant(session, tenant_id=2, tenant_name="Test Tenant"):
    """Get existing tenant or create a new one."""
    tenant = session.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        tenant = Tenant(id=tenant_id, name=tenant_name)
        session.add(tenant)
        session.commit()
        print(f"✓ Created tenant: {tenant_name} (ID: {tenant_id})")
    else:
        print(f"✓ Using existing tenant: {tenant_name} (ID: {tenant_id})")
    return tenant

def get_or_create_vendors(session, tenant_id):
    """Get existing vendors or create new ones."""
    vendors = session.query(Vendor).filter(Vendor.tenant_id == tenant_id).all()
    
    if len(vendors) < len(VENDOR_NAMES):
        existing_names = {v.name for v in vendors}
        for name in VENDOR_NAMES:
            if name not in existing_names:
                vendor = Vendor(tenant_id=tenant_id, name=name)
                session.add(vendor)
        session.commit()
        vendors = session.query(Vendor).filter(Vendor.tenant_id == tenant_id).all()
        print(f"✓ Created/verified {len(vendors)} vendors")
    
    return vendors

def generate_invoice_number(tenant_id, index):
    """Generate a unique invoice number."""
    today = datetime.now()
    date_str = today.strftime("%Y%m%d")
    return f"INV-{tenant_id}-{date_str}-{index:04d}"

def generate_invoices(session, tenant_id, vendors, count=20):
    """Generate and insert invoices."""
    invoices = []
    base_date = datetime.now() - timedelta(days=30)
    
    for i in range(count):
        invoice_date = base_date + timedelta(days=randint(0, 30))
        vendor = choice(vendors)
        amount = round(uniform(50.0, 5000.0), 2)
        
        invoice = Invoice(
            tenant_id=tenant_id,
            vendor_id=vendor.id,
            invoice_number=generate_invoice_number(tenant_id, i + 1),
            invoice_datetime=invoice_date,
            amount=amount,
            currency="USD",
            description=choice(INVOICE_DESCRIPTIONS),
            status="OEPN"  # Note: schema uses "OEPN" (likely typo for "OPEN")
        )
        session.add(invoice)
        invoices.append(invoice)
    
    session.commit()
    print(f"✓ Created {count} invoices")
    return invoices

def generate_transactions(session, tenant_id, invoices, count=20):
    """Generate and insert bank transactions.
    Some transactions will match invoices for reconciliation testing.
    """
    transactions = []
    base_date = datetime.now() - timedelta(days=30)
    
    # Create some transactions that match invoices (for reconciliation)
    match_count = min(8, len(invoices), count // 2)
    matched_invoices = invoices[:match_count] if len(invoices) >= match_count else []
    
    for i in range(count):
        transaction_date = base_date + timedelta(days=randint(0, 30))
        external_id = f"TXN-{uuid.uuid4().hex[:8].upper()}-{transaction_date.strftime('%Y%m%d')}"
        
        # Some transactions match invoices (same amount, similar date, similar description)
        if i < len(matched_invoices) and matched_invoices:
            invoice = matched_invoices[i]
            # Transaction date is 1-3 days after invoice date
            transaction_date = invoice.invoice_datetime + timedelta(days=randint(1, 3))
            amount = -invoice.amount  # Negative for expenses
            description = invoice.description or choice(TRANSACTION_DESCRIPTIONS)
        else:
            # Random transaction
            amount = round(uniform(-5000.0, 10000.0), 2)
            description = choice(TRANSACTION_DESCRIPTIONS)
        
        transaction = BankTransaction(
            tenant_id=tenant_id,
            external_id=external_id,
            posted_at=transaction_date,
            amount=amount,
            currency="USD",
            description=description
        )
        session.add(transaction)
        transactions.append(transaction)
    
    session.commit()
    print(f"✓ Created {count} bank transactions")
    print(f"  ({match_count} transactions designed to match invoices)")
    return transactions

def main():
    print("=" * 60)
    print("Generating Test Data for Reconciliation Engine")
    print("=" * 60)
    print()
    
    session = SessionLocal()
    
    try:
        # Get or create tenant
        tenant_id = 2
        tenant = get_or_create_tenant(session, tenant_id)
        print()
        
        # Get or create vendors
        vendors = get_or_create_vendors(session, tenant_id)
        if not vendors:
            print("✗ Error: No vendors available. Please create vendors first.")
            return
        print()
        
        # Generate invoices
        print("Step 1: Generating invoices...")
        invoices = generate_invoices(session, tenant_id, vendors, count=20)
        print()
        
        # Generate transactions
        print("Step 2: Generating bank transactions...")
        transactions = generate_transactions(session, tenant_id, invoices, count=20)
        print()
        
        # Summary
        print("=" * 60)
        print("Summary:")
        print(f"  Tenant ID: {tenant_id}")
        print(f"  Vendors: {len(vendors)}")
        print(f"  Invoices: {len(invoices)}")
        print(f"  Bank Transactions: {len(transactions)}")
        print("=" * 60)
        print()
        print("✓ Test data generated successfully!")
        print()
        print("You can now test reconciliation with:")
        print(f"  POST http://localhost:3000/tenants/{tenant_id}/reconcile")
        
    except Exception as e:
        session.rollback()
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        session.close()

if __name__ == "__main__":
    main()

