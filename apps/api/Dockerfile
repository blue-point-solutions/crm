# CRM API production image.
#
# Build context is the factory root holding crm/ + library/ (sibling checkouts,
# same pattern as grocery/medusa-backend/Dockerfile) so the editable
# platform-core / platform-tenancy path deps in pyproject.toml resolve:
#
#   docker build -f crm/apps/api/Dockerfile <factory-root>
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Mirror the dev/CI sibling layout so ../../../library/packages/* resolves.
COPY library/packages/platform /factory/library/packages/platform
COPY library/packages/platform-tenancy /factory/library/packages/platform-tenancy
COPY library/packages/platform-email /factory/library/packages/platform-email
COPY library/packages/platform-sms /factory/library/packages/platform-sms
COPY library/packages/platform-contacts /factory/library/packages/platform-contacts
COPY crm/apps/api /factory/crm/apps/api

WORKDIR /factory/crm/apps/api
RUN uv sync --no-dev

ENV PATH="/factory/crm/apps/api/.venv/bin:$PATH"
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --retries=10 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/health', timeout=2)"]
CMD ["uvicorn", "crm_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
