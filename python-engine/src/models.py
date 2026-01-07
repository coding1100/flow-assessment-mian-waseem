from datetime import datetime
from typing import Optional

from sqlalchemy import String, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from src.database import Base


class Tenant(Base):
    __tablename__ = "tenants"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    
    vendors: Mapped[list["Vendor"]] = relationship("Vendor", back_populates="tenant")
    invoices: Mapped[list["Invoice"]] = relationship("Invoice", back_populates="tenant")
    bank_transactions: Mapped[list["BankTransaction"]] = relationship("BankTransaction", back_populates="tenant")
    matches: Mapped[list["Match"]] = relationship("Match", back_populates="tenant")
    idempotency_keys: Mapped[list["IdempotencyKey"]] = relationship("IdempotencyKey", back_populates="tenant")


class Vendor(Base):
    __tablename__ = "vendors"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="vendors")
    invoices: Mapped[list["Invoice"]] = relationship("Invoice", back_populates="vendor")


class Invoice(Base):
    __tablename__ = "invoices"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id"), nullable=False)
    invoice_number: Mapped[str] = mapped_column(String(255), nullable=False)
    invoice_datetime: Mapped[datetime] = mapped_column(nullable=False)
    amount: Mapped[float] = mapped_column(nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(255), nullable=False, default="OEPN")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="invoices")
    vendor: Mapped["Vendor"] = relationship("Vendor", back_populates="invoices")
    matches: Mapped[list["Match"]] = relationship("Match", back_populates="invoice")


class BankTransaction(Base):
    __tablename__ = "bank_transactions"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    external_id: Mapped[str] = mapped_column(String(255), nullable=False)
    posted_at: Mapped[datetime] = mapped_column(nullable=False)
    amount: Mapped[float] = mapped_column(nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="bank_transactions")
    matches: Mapped[list["Match"]] = relationship("Match", back_populates="bank_transaction")


class Match(Base):
    __tablename__ = "matches"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    bank_transaction_id: Mapped[int] = mapped_column(ForeignKey("bank_transactions.id"), nullable=False)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"), nullable=False)
    score: Mapped[float] = mapped_column(nullable=False)
    status: Mapped[str] = mapped_column(String(255), nullable=False, default="PROPOSED")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="matches")
    bank_transaction: Mapped["BankTransaction"] = relationship("BankTransaction", back_populates="matches")
    invoice: Mapped["Invoice"] = relationship("Invoice", back_populates="matches")


class IdempotencyKey(Base):
    __tablename__ = "idempotency_keys"
    __table_args__ = (
        UniqueConstraint("tenant_id", "idempotency_key", name="tenant_idempotency_key_unique"),
    )
    
    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(255), nullable=False)
    payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    response: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    
    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="idempotency_keys")
