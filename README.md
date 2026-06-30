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
- Rust backend for import and persistence work

## Commands

```sh
bun install
bun run dev
bun run tauri:dev
bun run build
bun run tauri:build
```

## Current scope

The current scaffold is intentionally narrow:

- proves the Bun + Tauri desktop shell builds
- uses the agreed chess libraries in a working solve screen
- shows the planned v1 screen flow: Import, Session Setup, Solve, Summary
- exposes a tiny Tauri command surface with a bootstrap command

## Agreed v1 architecture

- one-time import from `lichess_db_puzzle.csv.zst` into SQLite
- store SQLite and progress in the app data directory
- keep one active randomized session at a time
- autosave progress locally after each result
- require the user to play the full expected line, with opponent replies auto-played
- fail immediately on the first wrong move
- no hints, no undo, no cloud sync in v1

## Next backend slices

1. Stream `.zst` decompression and CSV parsing in Rust.
2. Create the SQLite schema for puzzles, sessions, and puzzle results.
3. Add Tauri commands for import, session creation, current puzzle lookup, move submission, and skipping.
4. Replace the sample embedded puzzle with live data from SQLite.
