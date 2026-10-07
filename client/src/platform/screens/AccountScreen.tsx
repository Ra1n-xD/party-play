import { COSMETICS } from "../../../../shared/platform/cosmetics";
import { CoinAmount } from "../components/CoinAmount";
import { ProfileEditor } from "../components/ProfileEditor";
import { TestAccountNotice } from "../components/TestAccountNotice";
import { useProfile } from "../context/ProfileContext";

export function AccountScreen() {
  const { profile, account } = useProfile();
  if (!profile) return null;
  const owned = COSMETICS.filter((item) => profile.inventory[item.id]).length;
  return (
    <main className="account-page">
      <div className="account-content">
        <div className="collection-heading">
          <div>
            <h1>Профиль игрока</h1>
            <p>Ваш аккаунт, прогресс и настройки.</p>
          </div>
        </div>
        <section className="profile-summary" aria-label="Ваш прогресс">
          <strong>{profile.nickname}</strong>
          <CoinAmount amount={profile.coins} />
          <span>
            {profile.completedGames} завершённых партий · {profile.wins} побед
          </span>
          <a href="/collection" className="profile-text-button">
            Коллекция: {owned} / {COSMETICS.length}
          </a>
        </section>
        {account?.testParticipant && <TestAccountNotice />}
        {account && <ProfileEditor key={profile.id} />}
      </div>
    </main>
  );
}
