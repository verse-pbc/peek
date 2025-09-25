# Git Hooks

This directory contains git hooks for the project. These help catch issues before pushing to CI.

## Setup

To use these hooks, configure git to use this directory:

```bash
git config core.hooksPath .githooks
```

## Available Hooks

### pre-push
Runs CI checks locally before pushing:
- Rust formatting (`cargo fmt --check`)
- Rust linting (`cargo clippy`)
- Rust compilation (`cargo check`)
- TypeScript type checking
- ESLint

This prevents CI failures by catching issues early.

## Manual Testing

You can test hooks manually:

```bash
bash .githooks/pre-push
```