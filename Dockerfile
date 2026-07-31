FROM python:3.11-slim

COPY --from=ghcr.io/astral-sh/uv:0.11.13 /uv /uvx /bin/

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /app

COPY pyproject.toml uv.lock mos-1.5.3-py3-none-any.whl ./

RUN uv sync --frozen --no-install-project \
    --allow-insecure-host pypi.org \
    --allow-insecure-host files.pythonhosted.org

COPY . .

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
