// Bot.js - Standard minimax bot engine matching Kotlin BotEngine logic
// Uses alpha-beta pruning and weighted sampling for predictions

import { PieceColor, PieceType, GameResult } from './chess.js';

const PIECE_VALUES = {
  [PieceType.PAWN]: 100,
  [PieceType.KNIGHT]: 320,
  [PieceType.BISHOP]: 330,
  [PieceType.ROOK]: 500,
  [PieceType.QUEEN]: 900,
  [PieceType.KING]: 20000
};

// Positional bonuses based on central control and development
const PAWN_TABLE = [
  0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
  5,  5, 10, 25, 25, 10,  5,  5,
  0,  0,  0, 20, 20,  0,  0,  0,
  5, -5,-10,  0,  0,-10, -5,  5,
  5, 10, 10,-20,-20, 10, 10,  5,
  0,  0,  0,  0,  0,  0,  0,  0
];

const KNIGHT_TABLE = [
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -30,  0, 10, 15, 15, 10,  0,-30,
  -30,  5, 15, 20, 20, 15,  5,-30,
  -30,  0, 15, 20, 20, 15,  0,-30,
  -30,  5, 10, 15, 15, 10,  5,-30,
  -40,-20,  0,  5,  5,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50
];

const BISHOP_TABLE = [
  -20,-10,-10,-10,-10,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5, 10, 10,  5,  0,-10,
  -10,  5,  5, 10, 10,  5,  5,-10,
  -10,  0, 10, 10, 10, 10,  0,-10,
  -10, 10, 10, 10, 10, 10, 10,-10,
  -10,  5,  0,  0,  0,  0,  5,-10,
  -20,-10,-10,-10,-10,-10,-10,-20
];

const ROOK_TABLE = [
  0,  0,  0,  0,  0,  0,  0,  0,
  5, 10, 10, 10, 10, 10, 10,  5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  0,  0,  0,  5,  5,  0,  0,  0
];

export const BotEngine = {
  // Evaluate the board from White's perspective
  evaluateBoard(board) {
    let score = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board.squares[r][c];
        if (!piece) continue;
        const valBase = PIECE_VALUES[piece.type] || 0;
        
        // Positional bonuses based on perspective
        const tableIndex = piece.color === PieceColor.WHITE ? (7 - r) * 8 + c : r * 8 + c;
        let posBonus = 0;
        if (piece.type === PieceType.PAWN) posBonus = PAWN_TABLE[tableIndex];
        else if (piece.type === PieceType.KNIGHT) posBonus = KNIGHT_TABLE[tableIndex];
        else if (piece.type === PieceType.BISHOP) posBonus = BISHOP_TABLE[tableIndex];
        else if (piece.type === PieceType.ROOK) posBonus = ROOK_TABLE[tableIndex];

        const totalVal = valBase + posBonus;
        if (piece.color === PieceColor.WHITE) {
          score += totalVal;
        } else {
          score -= totalVal;
        }
      }
    }
    return score;
  },

  // Minimax search with alpha-beta pruning
  // Returns [bestScore, bestMove]
  minimax(board, depth, alpha, beta, isMaximizing) {
    const result = board.gameResult();
    if (result !== GameResult.ONGOING) {
      if (result === GameResult.CHECKMATE_WHITE_WINS) return [100000 + depth, null];
      if (result === GameResult.CHECKMATE_BLACK_WINS) return [-100000 - depth, null];
      return [0, null]; // Draws
    }

    if (depth === 0) {
      return [this.evaluateBoard(board), null];
    }

    const turn = isMaximizing ? PieceColor.WHITE : PieceColor.BLACK;
    const moves = board.legalMoves(turn);

    if (moves.length === 0) {
      return [isMaximizing ? -100000 : 100000, null];
    }

    // Sort moves: captures first to improve alpha-beta pruning efficiency
    const orderedMoves = moves.sort((a, b) => {
      const targetA = board.squares[a.toRow][a.toCol];
      const targetB = board.squares[b.toRow][b.toCol];
      const valA = targetA ? PIECE_VALUES[targetA.type] || 0 : 0;
      const valB = targetB ? PIECE_VALUES[targetB.type] || 0 : 0;
      return valB - valA;
    });

    let bestMove = null;
    if (isMaximizing) {
      let maxEval = -Infinity;
      let currentAlpha = alpha;
      for (const move of orderedMoves) {
        const nextBoard = board.copy();
        nextBoard.applyChessMove(move);
        const [evaluation] = this.minimax(nextBoard, depth - 1, currentAlpha, beta, false);
        if (evaluation > maxEval) {
          maxEval = evaluation;
          bestMove = move;
        }
        currentAlpha = Math.max(currentAlpha, evaluation);
        if (beta <= currentAlpha) break;
      }
      return [maxEval, bestMove];
    } else {
      let minEval = Infinity;
      let currentBeta = beta;
      for (const move of orderedMoves) {
        const nextBoard = board.copy();
        nextBoard.applyChessMove(move);
        const [evaluation] = this.minimax(nextBoard, depth - 1, alpha, currentBeta, true);
        if (evaluation < minEval) {
          minEval = evaluation;
          bestMove = move;
        }
        currentBeta = Math.min(currentBeta, evaluation);
        if (currentBeta <= alpha) break;
      }
      return [minEval, bestMove];
    }
  },

  // Get the best move for a color
  getBestMove(board, color, depth = 3) {
    const isMaximizing = color === PieceColor.WHITE;
    const legalCount = board.legalMoves(color).length;
    // Adaptive depth to keep execution fast
    const searchDepth = legalCount > 25 ? depth - 1 : depth;
    const [, bestMove] = this.minimax(board, searchDepth, -Infinity, Infinity, isMaximizing);
    return bestMove;
  },

  // Predicts player's next move by evaluating all legal moves, ranking them,
  // and sampling from the best ones with some weighted randomness.
  getWeightedPrediction(board, playerColor) {
    const playerMoves = board.legalMoves(playerColor);
    if (playerMoves.length === 0) return '';

    const isPlayerWhite = playerColor === PieceColor.WHITE;

    // Pair each move with its evaluation after the player makes it
    const moveEvaluations = playerMoves.map(move => {
      const nextBoard = board.copy();
      nextBoard.applyChessMove(move);
      const score = this.evaluateBoard(nextBoard);
      const relativeScore = isPlayerWhite ? score : -score;
      return { move, score: relativeScore };
    });

    // Sort by player's best moves first (descending relative score)
    const sortedMoves = moveEvaluations.sort((a, b) => b.score - a.score);

    // Take top choices (up to 5)
    const numChoices = Math.min(5, sortedMoves.length);
    const topChoices = sortedMoves.slice(0, numChoices);

    // Assign weights. Best moves get higher weights.
    const minScore = topChoices[topChoices.length - 1].score;
    const shiftedScores = topChoices.map(c => ({
      move: c.move,
      shifted: Math.max(1, c.score - minScore + 10)
    }));

    // Square shifted scores to heavily bias towards best moves
    const weights = shiftedScores.map(s => ({
      move: s.move,
      weight: s.shifted * s.shifted
    }));

    const totalWeight = weights.reduce((sum, item) => sum + item.weight, 0);

    let rand = Math.random() * totalWeight;
    for (const item of weights) {
      rand -= item.weight;
      if (rand <= 0) {
        return item.move.toUci();
      }
    }

    return topChoices[0].move.toUci();
  }
};
