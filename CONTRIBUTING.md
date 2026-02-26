# Contributing

Thanks for contributing to Reality Launcher Client.

## Prerequisites
- Bun 1.x
- Node.js 20+
- Rust stable

## Local Setup
```bash
bun install
cd native && bun install && bun run build && cd ..
```

Run in development:
```bash
bun run dev
```

## Before Opening A PR
Run the same checks as CI:
```bash
bun run ci:check
```

If you changed native code, also run:
```bash
cd native && bun run build
```

## Pull Request Guidelines
- Keep PRs focused and small.
- Describe the problem and the fix clearly.
- Link related issues (for example `Fixes #123`).
- Include screenshots/videos for UI changes.
- Update docs when behavior or configuration changes.

## Commit Style
No strict format is required, but concise, descriptive commits are preferred.

## Reporting Bugs
Use the bug report issue template and include:
- OS + version
- App version / commit SHA
- Reproduction steps
- Expected vs actual behavior
- Logs/screenshots when possible
