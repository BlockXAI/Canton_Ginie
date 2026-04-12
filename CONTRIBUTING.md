# Contributing to Ginie

Thanks for your interest. Here's how to get started.

## Setup

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.ginie.example .env.ginie
# Fill in at least one LLM API key

# Frontend
cd frontend_dark
npm install
npm run dev
```

## Running Tests

```bash
cd backend
pytest tests/ -v -s
```

Tests require a running Canton sandbox and at least one LLM API key. Tests that need unavailable services skip automatically.

## Pull Request Process

1. Fork the repo and create a feature branch from `main`.
2. Keep commits focused — one logical change per commit.
3. Run `pytest tests/ -v` and ensure no regressions.
4. Open a PR with a short description of what changed and why.

## Areas Where Help Is Useful

- Daml contract examples in `backend/rag/daml_examples/`
- Fix agent error type coverage (see `backend/agents/fix_agent.py`)
- New contract verticals (insurance, trade finance, derivatives)
- Frontend improvements
- Documentation

## Code Style

- Python: follow existing style, use type hints where practical.
- TypeScript/React: follow existing Next.js conventions.
- No AI-generated boilerplate comments — keep docstrings minimal and factual.

## Reporting Issues

Open a GitHub issue. Include steps to reproduce, expected behavior, and actual behavior.
