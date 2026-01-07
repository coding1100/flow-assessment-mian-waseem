"""setup_row_level_security

Revision ID: 2093f07225ec
Revises: 41b0ab71a78b
Create Date: 2026-01-07 21:37:13.752235

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2093f07225ec'
down_revision: Union[str, Sequence[str], None] = '41b0ab71a78b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Setup Row Level Security (RLS) for Multi-Tenant Isolation."""
    
    # Step 1: Create a schema for application context variables (if it doesn't exist)
    op.execute("CREATE SCHEMA IF NOT EXISTS app")
    
    # Step 2: Create helper function to get current org_id (tenant_id)
    # This function reads the PostgreSQL session variable set by the application
    op.execute("""
        CREATE OR REPLACE FUNCTION app.current_org_id()
        RETURNS INTEGER AS $$
        DECLARE
            org_id_str TEXT;
        BEGIN
            -- Try to get the setting, return NULL if not set or invalid
            BEGIN
                org_id_str := current_setting('app.current_org_id', true);
                IF org_id_str IS NULL OR org_id_str = '' THEN
                    RETURN NULL;
                END IF;
                RETURN org_id_str::INTEGER;
            EXCEPTION
                WHEN OTHERS THEN
                    RETURN NULL;
            END;
        END;
        $$ LANGUAGE plpgsql STABLE;
    """)
    
    # Step 3: Create helper function to check if user is super admin
    op.execute("""
        CREATE OR REPLACE FUNCTION app.is_super_admin()
        RETURNS BOOLEAN AS $$
        BEGIN
            RETURN COALESCE(
                NULLIF(current_setting('app.is_super_admin', true), '')::BOOLEAN,
                false
            );
        EXCEPTION
            WHEN OTHERS THEN
                RETURN false;
        END;
        $$ LANGUAGE plpgsql STABLE;
    """)
    
    # Step 4: Enable RLS on all tenant-scoped tables
    # Note: tenants table is excluded as per requirements
    op.execute("ALTER TABLE vendors ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE invoices ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE matches ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY")
    
    # Step 5: Create RLS policies for vendors table
    op.execute("DROP POLICY IF EXISTS vendors_tenant_isolation ON vendors")
    op.execute("""
        CREATE POLICY vendors_tenant_isolation ON vendors
            FOR ALL
            USING (
                -- Super admin can access all rows
                app.is_super_admin() = true
                OR
                -- Regular users can only access their tenant's data
                tenant_id = app.current_org_id()
            )
            WITH CHECK (
                -- Super admin can modify all rows
                app.is_super_admin() = true
                OR
                -- Regular users can only modify their tenant's data
                tenant_id = app.current_org_id()
            )
    """)
    
    # Step 6: Create RLS policies for invoices table
    op.execute("DROP POLICY IF EXISTS invoices_tenant_isolation ON invoices")
    op.execute("""
        CREATE POLICY invoices_tenant_isolation ON invoices
            FOR ALL
            USING (
                -- Super admin can access all rows
                app.is_super_admin() = true
                OR
                -- Regular users can only access their tenant's data
                tenant_id = app.current_org_id()
            )
            WITH CHECK (
                -- Super admin can modify all rows
                app.is_super_admin() = true
                OR
                -- Regular users can only modify their tenant's data
                tenant_id = app.current_org_id()
            )
    """)
    
    # Step 7: Create RLS policies for bank_transactions table
    op.execute("DROP POLICY IF EXISTS bank_transactions_tenant_isolation ON bank_transactions")
    op.execute("""
        CREATE POLICY bank_transactions_tenant_isolation ON bank_transactions
            FOR ALL
            USING (
                -- Super admin can access all rows
                app.is_super_admin() = true
                OR
                -- Regular users can only access their tenant's data
                tenant_id = app.current_org_id()
            )
            WITH CHECK (
                -- Super admin can modify all rows
                app.is_super_admin() = true
                OR
                -- Regular users can only modify their tenant's data
                tenant_id = app.current_org_id()
            )
    """)
    
    # Step 8: Create RLS policies for matches table
    op.execute("DROP POLICY IF EXISTS matches_tenant_isolation ON matches")
    op.execute("""
        CREATE POLICY matches_tenant_isolation ON matches
            FOR ALL
            USING (
                -- Super admin can access all rows
                app.is_super_admin() = true
                OR
                -- Regular users can only access their tenant's data
                tenant_id = app.current_org_id()
            )
            WITH CHECK (
                -- Super admin can modify all rows
                app.is_super_admin() = true
                OR
                -- Regular users can only modify their tenant's data
                tenant_id = app.current_org_id()
            )
    """)
    
    # Step 9: Create RLS policies for idempotency_keys table
    op.execute("DROP POLICY IF EXISTS idempotency_keys_tenant_isolation ON idempotency_keys")
    op.execute("""
        CREATE POLICY idempotency_keys_tenant_isolation ON idempotency_keys
            FOR ALL
            USING (
                -- Super admin can access all rows
                app.is_super_admin() = true
                OR
                -- Regular users can only access their tenant's data
                tenant_id = app.current_org_id()
            )
            WITH CHECK (
                -- Super admin can modify all rows
                app.is_super_admin() = true
                OR
                -- Regular users can only modify their tenant's data
                tenant_id = app.current_org_id()
            )
    """)
    
    # Step 10: Grant necessary permissions
    # Ensure the application user can use the app schema
    op.execute("GRANT USAGE ON SCHEMA app TO PUBLIC")
    op.execute("GRANT EXECUTE ON FUNCTION app.current_org_id() TO PUBLIC")
    op.execute("GRANT EXECUTE ON FUNCTION app.is_super_admin() TO PUBLIC")


def downgrade() -> None:
    """Remove Row Level Security (RLS) setup."""
    
    # Drop RLS policies
    op.execute("DROP POLICY IF EXISTS vendors_tenant_isolation ON vendors")
    op.execute("DROP POLICY IF EXISTS invoices_tenant_isolation ON invoices")
    op.execute("DROP POLICY IF EXISTS bank_transactions_tenant_isolation ON bank_transactions")
    op.execute("DROP POLICY IF EXISTS matches_tenant_isolation ON matches")
    op.execute("DROP POLICY IF EXISTS idempotency_keys_tenant_isolation ON idempotency_keys")
    
    # Disable RLS on tables
    op.execute("ALTER TABLE vendors DISABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE invoices DISABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE bank_transactions DISABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE matches DISABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE idempotency_keys DISABLE ROW LEVEL SECURITY")
    
    # Drop helper functions
    op.execute("DROP FUNCTION IF EXISTS app.is_super_admin()")
    op.execute("DROP FUNCTION IF EXISTS app.current_org_id()")
    
    # Note: We don't drop the app schema as it might be used by other things
    # If you want to drop it, uncomment the line below:
    # op.execute("DROP SCHEMA IF EXISTS app CASCADE")
