interface VoteProgressBarProps {
  votesCount: number;
  totalVotesExpected: number;
}

export function VoteProgressBar({ votesCount, totalVotesExpected }: VoteProgressBarProps) {
  return (
    <div className="vote-progress-bar">
      <div className="vote-progress-label">
        Проголосовало: {votesCount} / {totalVotesExpected}
      </div>
      <div className="vote-progress-track">
        <div
          className="vote-progress-fill"
          style={{ width: `${(votesCount / totalVotesExpected) * 100}%` }}
        />
      </div>
    </div>
  );
}
