# Flow Assessment - Invoice Reconciliation System

A multi-service application for reconciling invoices with bank transactions using a deterministic scoring engine.

## Architecture

This project consists of three main services:

1. **PostgreSQL Database** - Stores tenants, vendors, invoices, bank transactions, and matches with Row-Level Security (RLS) for multi-tenant isolation
2. **NestJS API** - Main REST and GraphQL API (port 3000) with JWT authentication, multi-tenant support, and reconciliation orchestration
3. **Python Engine** - FastAPI-based reconciliation engine (port 8000) that performs deterministic matching and scoring

## Prerequisites

- Docker and Docker Compose
- Node.js 20+ (for local development)
- Python 3.11+ (for local development)

## Setup Instructions

### 1. Clone the Repository

```bash
git clone <repository-url>
cd flow-assessment-mian-waseem
```

### 2. Environment Configuration

Create a `.env` file in the root directory:

```env
# Database Configuration
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=postgres
DB_EXTERNAL_PORT=5432

# NestJS API Configuration
NESTJS_PORT=3000
NODE_ENV=development
PYTHON_ENGINE_URL=http://python-engine:8000

# Python Engine Configuration
PYTHON_ENGINE_PORT=8000

# Optional: OpenAI API Key (for AI explanations)
OPENAI_API_KEY=your_openai_api_key_here
```

### 3. Start Services

```bash
docker-compose up -d
```

This starts all three services. Verify with:
```bash
docker-compose ps
```

Health checks:
- NestJS API: `http://localhost:3000/health`
- Python Engine: `http://localhost:8000/health`

### 4. Database Migrations

Migrations run automatically, or manually:
```bash
docker-compose exec python-engine alembic upgrade head
```

## Running the Project

### Using Docker Compose (Recommended)

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

### Local Development

**NestJS API:**
```bash
cd nestjs-api
npm install
npm run start:dev
```

**Python Engine:**
```bash
cd python-engine
pip install -r requirements.txt
uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
```

## API Endpoints

- **NestJS REST API**: `http://localhost:3000`
- **NestJS GraphQL Playground**: `http://localhost:3000/graphql`
- **Python Engine GraphQL**: `http://localhost:8000/graphql`

## Authentication

The NestJS API uses JWT authentication. **Note**: As this was a technical assessment, user credentials are not stored in the database to keep the scope contained. The authentication endpoint generates a JWT token without database validation.

### Getting a JWT Token

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "email": "user@example.com",
    "orgId": "1",
    "roles": ["user"]
  }'
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": "1d",
  "token_type": "Bearer"
}
```

Use the token in subsequent requests:
```bash
curl -X GET http://localhost:3000/tenants \
  -H "Authorization: Bearer <your_token>"
```

## Reconciliation Overview

The reconciliation process matches invoices with bank transactions using a deterministic scoring algorithm:

1. **Trigger**: `POST /tenants/:tenantId/reconcile` or GraphQL `mutation reconcile`
2. **Process**: NestJS API fetches invoices and transactions, sends them to Python Engine for scoring
3. **Scoring**: Python Engine computes match scores based on:
   - Exact amount match (40 points)
   - Amount tolerance match (up to 30 points)
   - Date proximity match (up to 20 points)
   - Text similarity match (up to 15 points)
   - Vendor name match (up to 10 points)
4. **Result**: Top N candidates stored as `PROPOSED` matches, can be confirmed via `POST /tenants/:tenantId/matches/:matchId/confirm`

## Project Structure

```
flow-assessment-mian-waseem/
├── docker-compose.yml          # Docker Compose configuration
├── nestjs-api/                 # NestJS API service
│   ├── src/
│   │   ├── auth/              # Authentication & authorization
│   │   ├── tenants/           # Tenant management
│   │   ├── vendors/           # Vendor management
│   │   ├── invoices/          # Invoice management
│   │   ├── bank-transactions/ # Bank transaction management
│   │   ├── matches/           # Match/reconciliation management
│   │   ├── graphql/           # GraphQL resolvers
│   │   └── common/            # Shared utilities
│   └── Dockerfile
├── python-engine/              # Python reconciliation engine
│   ├── src/
│   │   ├── main.py            # FastAPI application
│   │   ├── graphql_schema.py  # GraphQL schema
│   │   ├── reconciliation.py  # Scoring engine
│   │   ├── models.py          # SQLAlchemy models
│   │   └── database.py        # Database configuration
│   ├── alembic/               # Database migrations
│   └── Dockerfile
└── README.md
```

## Development

**Tests:**
```bash
# NestJS API
cd nestjs-api && npm test

# Python Engine
cd python-engine && pytest
```

**Code Formatting:**
```bash
# NestJS API
cd nestjs-api && npm run format && npm run lint

# Python Engine
cd python-engine && black src/ && flake8 src/
```

## Future Enhancements

For a full-fledged production product, the following enhancements would be considered:

- User authentication system with registration, password management, and OAuth2/SSO integration
- Web-based dashboard with real-time reconciliation status and interactive match review interface
- Machine learning-based matching algorithms with configurable scoring weights per tenant
- Bank API and accounting software integrations (QuickBooks, Xero) for automatic data imports
- Background job processing and caching layer for improved performance and scalability
- Scheduled automatic reconciliation jobs with approval workflows for high-value matches
- Comprehensive reporting and analytics with customizable dashboards and export capabilities
- Enhanced security features including audit logging, data encryption, and compliance (GDPR, SOC 2)
