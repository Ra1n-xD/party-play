export function coinLabel(amount: number) {
  const lastTwo = amount % 100;
  const last = amount % 10;
  return lastTwo >= 11 && lastTwo <= 14
    ? "монет"
    : last === 1
      ? "монета"
      : last >= 2 && last <= 4
        ? "монеты"
        : "монет";
}

export function CoinAmount({ amount, label }: { amount: number; label?: string }) {
  const resolvedLabel = label ?? coinLabel(amount);
  return (
    <span className="coin-amount">
      <svg className="coin-icon" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path d="M5 15h22v4a11 11 0 0 1-22 0z" fill="#b87928" />
        <circle cx="16" cy="14" r="11" fill="#ffcf67" stroke="#f7ad3d" strokeWidth="2" />
        <circle cx="16" cy="14" r="8" stroke="#b87928" strokeWidth="1.5" />
        <path
          d="m16 8 1.8 3.7 4.1.6-3 2.9.7 4.1-3.6-1.9-3.6 1.9.7-4.1-3-2.9 4.1-.6z"
          fill="#996021"
        />
        <path d="M9 8.5a9 9 0 0 1 7-3" stroke="#fff2bb" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <b>{amount.toLocaleString("ru-RU")}</b>
      {resolvedLabel && <span className="coin-label">{resolvedLabel}</span>}
    </span>
  );
}
