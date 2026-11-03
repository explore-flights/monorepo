FROM ghcr.io/astral-sh/uv:python3.15-trixie-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV UV_COMPILE_BYTECODE=1

WORKDIR /app

COPY pyproject.toml README.md uv.lock ./
COPY src ./src

RUN uv sync --no-dev

ENTRYPOINT ["uv", "run", "updater"]
