import type { CSSProperties } from "react";
import { Chess, type Square } from "chess.js";
import type { LastMove } from "./types";

export function parseUciMove(uci: string) {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length > 4 ? uci[4] : undefined,
  };
}

export function applyMoveSequence(chess: Chess, moves: string[]) {
  for (const move of moves) {
    chess.move(parseUciMove(move));
  }
}

export function buildSolutionMoveRows(fen: string, moves: string[]) {
  const chess = new Chess(fen);
  const fenParts = fen.split(" ");
  let moveNumber = Number(fenParts[5] ?? "1");
  let sideToMove: "white" | "black" = fenParts[1] === "b" ? "black" : "white";
  const rows: Array<{
    moveNumber: number;
    whiteMove: string | null;
    blackMove: string | null;
  }> = [];

  for (const uci of moves) {
    const move = chess.move(parseUciMove(uci));
    if (!move) {
      continue;
    }

    if (sideToMove === "white") {
      rows.push({
        moveNumber,
        whiteMove: move.san,
        blackMove: null,
      });
      sideToMove = "black";
      continue;
    }

    const currentRow = rows.at(-1);
    if (
      currentRow &&
      currentRow.moveNumber === moveNumber &&
      currentRow.blackMove === null
    ) {
      currentRow.blackMove = move.san;
    } else {
      rows.push({
        moveNumber,
        whiteMove: null,
        blackMove: move.san,
      });
    }

    moveNumber += 1;
    sideToMove = "white";
  }

  return rows;
}

export function buildSquareStyles(
  selectedSquare: string | null,
  focusedSquare: string | null,
  legalTargets: string[],
  lastMove: LastMove | null,
) {
  const squareStyles: Record<string, CSSProperties> = {};

  if (lastMove) {
    squareStyles[lastMove.from] = {
      backgroundColor: "rgba(214, 168, 92, 0.26)",
    };
    squareStyles[lastMove.to] = {
      backgroundColor: "rgba(214, 168, 92, 0.36)",
    };
  }

  if (selectedSquare) {
    squareStyles[selectedSquare] = {
      ...(squareStyles[selectedSquare] ?? {}),
      boxShadow: "inset 0 0 0 3px rgba(255, 244, 217, 0.9)",
      backgroundColor: "rgba(255, 244, 217, 0.24)",
    };
  }

  if (focusedSquare && focusedSquare !== selectedSquare) {
    squareStyles[focusedSquare] = {
      ...(squareStyles[focusedSquare] ?? {}),
      boxShadow: "inset 0 0 0 2px rgba(126, 192, 255, 0.92)",
    };
  }

  for (const square of legalTargets) {
    squareStyles[square] = {
      ...(squareStyles[square] ?? {}),
      backgroundImage:
        "radial-gradient(circle, rgba(191, 232, 200, 0.82) 0, rgba(191, 232, 200, 0.82) 18%, transparent 22%)",
    };
  }

  return squareStyles;
}

export function squareFromArrow(
  square: string,
  key: string,
  orientation: "white" | "black",
) {
  const files = "abcdefgh";
  const fileIndex = files.indexOf(square[0]);
  const rankIndex = Number(square[1]) - 1;

  if (fileIndex < 0 || rankIndex < 0 || rankIndex > 7) {
    return square;
  }

  const fileDeltaByKey =
    orientation === "white"
      ? { ArrowLeft: -1, ArrowRight: 1 }
      : { ArrowLeft: 1, ArrowRight: -1 };
  const rankDeltaByKey =
    orientation === "white"
      ? { ArrowUp: 1, ArrowDown: -1 }
      : { ArrowUp: -1, ArrowDown: 1 };

  const nextFileIndex =
    key in fileDeltaByKey
      ? Math.max(
          0,
          Math.min(
            7,
            fileIndex + fileDeltaByKey[key as keyof typeof fileDeltaByKey],
          ),
        )
      : fileIndex;
  const nextRankIndex =
    key in rankDeltaByKey
      ? Math.max(
          0,
          Math.min(
            7,
            rankIndex + rankDeltaByKey[key as keyof typeof rankDeltaByKey],
          ),
        )
      : rankIndex;

  return `${files[nextFileIndex]}${nextRankIndex + 1}`;
}

export function getLegalTargets(
  chess: Chess,
  selectedSquare: string | null,
  enabled: boolean,
) {
  if (!enabled || !selectedSquare) {
    return [];
  }

  return chess
    .moves({ square: selectedSquare as Square, verbose: true })
    .map((move) => move.to);
}
