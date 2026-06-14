// The reaction palette lives in its own dependency-free module so client
// components can import it without pulling in lib/data (and node:sqlite).
export const REACTION_EMOJI = ['👍', '❤️', '✅', '🎉'] as const
