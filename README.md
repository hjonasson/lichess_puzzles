# Lichess Puzzles

Desktop scaffold for a local-first Lichess puzzle trainer.

## Dataset

The large Lichess puzzle dataset is not intended to live in this Git repository.

- Download `lichess_db_puzzle.csv.zst` from https://database.lichess.org/lichess_db_puzzle.csv.zst
- Place it at the repository root next to `package.json`
- The app will look for that file locally at runtime

This keeps the repository small enough for normal GitHub hosting.

## Stack

Before running the app, download the dataset above and place it in the repo root.

- Bun
- Tauri 2
- React 19 + TypeScript + Vite
- chess.js
- react-chessboard
- Rust backend for dataset scanning, filtering, and puzzle loading

## Commands

```sh
bun install
bun run dev
bun run tauri:dev
bun run build
bun run tauri:build
```

## Current behavior

- Loads puzzles directly from `lichess_db_puzzle.csv.zst`; there is no import step and no SQLite database.
- Uses the Rust backend to derive session filters and load puzzles from the compressed dataset.
- Supports filtering by rating range, opening, and multiple themes.
- Shows the opponent's first move automatically, then asks the user to solve the continuation.
- Auto-plays opponent replies after each correct user move.
- Fails only on legal but incorrect moves; illegal drops and same-square drops snap back.
- Supports English and Icelandic at runtime.

## Performance notes

- Startup uses a fast first-puzzle path instead of scanning the whole dataset up front.
- Session filter metadata is cached separately from the full puzzle dataset.
- The filter catalog is also generated at build time for the bundled dataset to avoid rescanning on normal launches.
- The full dataset cache is still built lazily when needed for broader next-puzzle navigation.

## Repository note

- The dataset is intentionally not committed to GitHub because the full file is too large for normal git hosting.
- If you clone this repository, download the dataset separately using the link above.
