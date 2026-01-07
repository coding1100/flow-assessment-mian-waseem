from fastapi import FastAPI
from sqlalchemy.orm import Session
from fastapi import Depends
from strawberry.fastapi import GraphQLRouter

from .graphql_schema import schema

app = FastAPI(
    title="Reconciliation Engine API",
    description="Deterministic reconciliation engine for matching invoices with bank transactions"
)

# GraphQL endpoint
graphql_app = GraphQLRouter(schema)
app.include_router(graphql_app, prefix="/graphql")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}
