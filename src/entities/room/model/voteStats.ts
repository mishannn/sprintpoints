import type { Vote } from "./types";

function numberFromVote(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function voteSummary(votes: Vote[]) {
  const numericVotes = votes.map((vote) => numberFromVote(vote.value)).filter((vote): vote is number => vote !== null);
  if (!numericVotes.length) {
    return null;
  }

  const total = numericVotes.reduce((sum, vote) => sum + vote, 0);
  return {
    average: total / numericVotes.length,
    min: Math.min(...numericVotes),
    max: Math.max(...numericVotes),
  };
}

export function distribution(votes: Vote[]) {
  return votes.reduce<Record<string, number>>((groups, vote) => {
    groups[vote.value] = (groups[vote.value] ?? 0) + 1;
    return groups;
  }, {});
}
