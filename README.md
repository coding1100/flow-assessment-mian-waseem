# Flow Assessment - Invoice Reconciliation System

A multi-service application for reconciling invoices with bank transactions using a deterministic scoring engine.

## Architecture

This project consists of three main services:

1. **PostgreSQL Database** - Stores tenants, vendors, invoices, bank transactions, and matches
2. **NestJS API** - Main REST and GraphQL API for managing tenants, vendors, invoices, bank transactions, and reconciliation
3. **Python Engine** - FastAPI-based reconciliation engine that performs deterministic matching and scoring

## Services Overview

### PostgreSQL Database
- Stores all application data including tenants, vendors, invoices, bank transactions, and matches
- Uses Row-Level Security (RLS) for multi-tenant data isolation
- Default port: `5432`

### NestJS API
- **Port**: `3000`
- **Framework**: NestJS with GraphQL
- **Features**:
  - REST API endpoints for CRUD operations
  - GraphQL API for flexible queries
  - JWT-based authentication with role-based access control
  - Multi-tenant support with RLS
  - Reconciliation orchestration
  - AI-powered match explanations (optional)

### Python Engine
- **Port**: `8000`
- **Framework**: FastAPI with Strawberry GraphQL
- **Features**:
  - Deterministic reconciliation engine
  - Heuristic-based matching and scoring
  - GraphQL API for scoring candidates
  - No AI dependencies (pure algorithmic matching)

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

Create a `.env` file in the root directory with the following variables:

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

### 3. Start Services with Docker Compose

```bash
docker-compose up -d
```

This will start all three services:
- PostgreSQL database
- NestJS API (with hot-reload in development)
- Python Engine (with hot-reload in development)

### 4. Verify Services

Check that all services are running:

```bash
docker-compose ps
```

Health check endpoints:
- NestJS API: `http://localhost:3000/health`
- Python Engine: `http://localhost:8000/health`

### 5. Database Migrations

The Python engine uses Alembic for database migrations. Migrations should run automatically, but you can run them manually:

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

# Stop and remove volumes (clean slate)
docker-compose down -v
```

### Local Development

#### NestJS API

```bash
cd nestjs-api
npm install
npm run start:dev
```

#### Python Engine

```bash
cd python-engine
pip install -r requirements.txt
uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
```

**Note**: For local development, ensure PostgreSQL is running and update the `DATABASE_URL` in your environment accordingly.

## API Endpoints

### NestJS API

- **REST API**: `http://localhost:3000`
- **GraphQL Playground**: `http://localhost:3000/graphql`

### Python Engine

- **GraphQL API**: `http://localhost:8000/graphql`
- **Health Check**: `http://localhost:8000/health`

## Reconciliation Process

### Overview

The reconciliation process matches invoices with bank transactions using a deterministic scoring algorithm. The process is orchestrated by the NestJS API and executed by the Python Engine.

### Reconciliation Flow in NestJS API

1. **Trigger Reconciliation**
   - Endpoint: `POST /tenants/:tenantId/reconcile`
   - GraphQL: `mutation reconcile(tenantId: Int!, input: ReconcileInput)`
   - Parameters:
     - `tenantId`: The tenant identifier
     - `topN`: Number of top candidates to return per invoice/transaction (default: 10)

2. **Data Fetching**
   - Fetches all invoices for the tenant (with vendor information)
   - Fetches all bank transactions for the tenant
   - Validates that both invoices and transactions exist

3. **Python Engine Call**
   - Sends invoices and transactions to Python Engine via GraphQL
   - Python Engine computes match scores for all invoice-transaction pairs
   - Returns top N candidates sorted by score

4. **Match Storage**
   - Deletes existing `PROPOSED` matches for the tenant
   - Stores new proposed matches in the database with:
     - `invoiceId`: Reference to the invoice
     - `bankTransactionId`: Reference to the bank transaction
     - `score`: Match score (0-100+)
     - `status`: `PROPOSED` (can be changed to `CONFIRMED`)

5. **Response**
   - Returns stored matches
   - Groups candidates by invoice and by transaction
   - Provides top N matches per invoice and per transaction

### Match Confirmation

After reconciliation, proposed matches can be confirmed:

- Endpoint: `POST /tenants/:tenantId/matches/:matchId/confirm`
- GraphQL: `mutation confirmMatch(tenantId: Int!, matchId: Int!)`
- Changes match status from `PROPOSED` to `CONFIRMED`

### Match Explanation

Get detailed explanations for why an invoice and transaction were matched:

- Endpoint: `GET /tenants/:tenantId/reconcile/explain?invoice_id=:invoiceId&transaction_id=:transactionId`
- GraphQL: `query explainReconciliation(tenantId: Int!, invoiceId: Int!, transactionId: Int!)`
- Returns heuristic score and explanations, optionally enhanced with AI-generated explanations

## Reconciliation and Scoring in Python Engine

### Scoring Algorithm

The Python Engine uses a deterministic, heuristic-based scoring system. The total score is the sum of individual match factors:

#### 1. Exact Amount Match (40 points)
- Awarded when invoice and transaction amounts match exactly (within 0.01 tolerance)
- Highest weight factor for exact matches

#### 2. Amount Tolerance Match (up to 30 points)
- Awarded when amounts are within 1% tolerance
- Score decreases linearly as the difference increases
- Formula: `30.0 * (1 - percentage_difference / 0.01)`

#### 3. Date Proximity Match (up to 20 points)
- Awarded when invoice date and transaction date are within ±3 days
- Score decreases as the day difference increases
- Formula: `20.0 * (1 - days_difference / 3)`

#### 4. Text Similarity Match (up to 15 points)
- Awarded when invoice description and transaction description are similar
- Uses Python's `difflib.SequenceMatcher` for similarity calculation
- If one description contains the other: 15 points
- If similarity ratio ≥ 60%: `10.0 * similarity_ratio`

#### 5. Vendor Name Match (up to 10 points)
- Awarded when vendor name appears in transaction description
- Exact match: 10 points
- Partial match (significant words > 3 characters): 5 points

### Scoring Process

1. **Currency Validation**
   - Only matches invoices and transactions with the same currency
   - Skips pairs with mismatched currencies

2. **Pairwise Scoring**
   - For each invoice-transaction pair:
     - Computes all match factors
     - Sums the scores
     - Generates human-readable explanations for each factor that contributed

3. **Candidate Selection**
   - Filters out pairs with score = 0
   - Sorts all candidates by score (descending)
   - Returns top N candidates

4. **Explanations**
   - Each candidate includes a list of explanations:
     - "Exact amount match"
     - "Amount match within tolerance (X% difference)"
     - "Date proximity match (within X days)"
     - "Text similarity match (X% similarity)"
     - "Vendor name found in transaction description"

### Example Scoring

```
Invoice: $1000.00, Date: 2024-01-15, Vendor: "Acme Corp"
Transaction: $1000.00, Date: 2024-01-16, Description: "Payment to Acme Corp"

Score Breakdown:
- Exact amount match: 40 points
- Date proximity (1 day): ~13.3 points
- Vendor name match: 10 points
- Text similarity: 15 points (if descriptions match)
Total: ~78.3 points
```

### GraphQL API

The Python Engine exposes a GraphQL endpoint:

```graphql
query ScoreCandidates(
  $tenantId: Int!
  $invoices: [InvoiceInput!]!
  $transactions: [BankTransactionInput!]!
  $topN: Int!
) {
  scoreCandidates(
    tenantId: $tenantId
    invoices: $invoices
    transactions: $transactions
    topN: $topN
  ) {
    invoiceId
    transactionId
    score
    explanations
  }
}
```

## Development

### Running Tests

#### NestJS API
```bash
cd nestjs-api
npm test
npm run test:e2e
```

#### Python Engine
```bash
cd python-engine
pytest
```

### Code Formatting

#### NestJS API
```bash
cd nestjs-api
npm run format
npm run lint
```

#### Python Engine
```bash
cd python-engine
black src/
flake8 src/
```

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

## Troubleshooting

### Services won't start
- Check Docker is running: `docker ps`
- Check ports are not in use: `lsof -i :3000`, `lsof -i :8000`, `lsof -i :5432`
- Review logs: `docker-compose logs`

### Database connection errors
- Ensure PostgreSQL is healthy: `docker-compose ps postgres`
- Check environment variables in `.env`
- Verify database credentials

### Reconciliation returns no matches
- Ensure invoices and transactions exist for the tenant
- Check currency matches between invoices and transactions
- Verify Python Engine is accessible: `curl http://localhost:8000/health`
