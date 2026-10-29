
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi

from database import Base, engine
import models
from auth_routes import router as auth_router
from project_routes import router as project_router
from environment_routes import router as environment_router
from variable_routes import router as variable_router


# Ensure all database tables exist, including InviteCode.
Base.metadata.create_all(bind=engine)


app = FastAPI(
    title="EnvShare API",
    description=(
        "A secure platform for managing and sharing "
        "environment variables across teams."
    ),
    version="0.1.0",
)


# Allow requests from local development and the deployed frontend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://192.168.0.100:5500",
        "https://envshare-frontend-one.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


# Register API routers.
app.include_router(auth_router)
app.include_router(project_router)
app.include_router(environment_router)
app.include_router(variable_router)


@app.get("/")
def root():
    return {
        "message": "Welcome to EnvShare API",
        "status": "running",
        "version": "0.1.0",
    }


@app.get("/health")
def health_check():
    return {"status": "healthy"}


def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema

    openapi_schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )

    openapi_schema.setdefault("components", {}).setdefault(
        "securitySchemes", {}
    )["OAuth2PasswordBearer"] = {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT",
    }

    app.openapi_schema = openapi_schema
    return app.openapi_schema


app.openapi = custom_openapi
