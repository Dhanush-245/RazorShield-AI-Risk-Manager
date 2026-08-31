# Deployment

`docker compose up --build` runs Nginx/React on port 5173, FastAPI on 8000, and PostgreSQL on 5432. The backend image includes immutable model artifacts and runs Alembic before serving. Configure `RAZORSHIELD_JWT_SECRET`, `RAZORSHIELD_DATABASE_URL`, `RAZORSHIELD_ALLOWED_ORIGINS`, `RAZORSHIELD_MODEL_DIR`, environment, and OTP delivery secrets through the deployment secret manager.

For cloud deployment, publish the frontend and backend images, use managed PostgreSQL, run migrations as a release job, expose `/health/live` and `/health/ready`, retain audit logs, autoscale only after shared rate limiting is installed, and keep model artifacts/version manifests identical across replicas. GitHub Actions validates lint, tests, frontend types/build, Compose, and the backend image before deployment can be added.
