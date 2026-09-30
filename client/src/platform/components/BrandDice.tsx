type BrandDiceProps = {
  className?: string;
};

export function BrandDice({ className }: BrandDiceProps) {
  return (
    <img className={className} src="/favicon.svg" alt="" aria-hidden="true" draggable={false} />
  );
}
