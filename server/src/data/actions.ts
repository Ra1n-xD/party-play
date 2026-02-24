import { ActionCard } from '../../../shared/types.js';

export const actionCards: ActionCard[] = [
  {
    id: 'swap_profession',
    title: 'Обмен профессиями',
    description: 'Обменяйтесь профессией с любым другим игроком',
    targetRequired: true,
  },
  {
    id: 'reveal_other',
    title: 'Разоблачение',
    description: 'Раскройте любую нераскрытую характеристику другого игрока',
    targetRequired: true,
  },
  {
    id: 'double_vote',
    title: 'Двойной голос',
    description: 'Ваш голос считается за два в этом раунде',
    targetRequired: false,
  },
  {
    id: 'immunity',
    title: 'Иммунитет',
    description: 'Вы не можете быть изгнаны в этом раунде',
    targetRequired: false,
  },
  {
    id: 'peek',
    title: 'Подглядывание',
    description: 'Посмотрите одну скрытую характеристику другого игрока (только вы видите)',
    targetRequired: true,
  },
  {
    id: 'swap_health',
    title: 'Обмен здоровьем',
    description: 'Обменяйтесь состоянием здоровья с другим игроком',
    targetRequired: true,
  },
  {
    id: 'hide_attribute',
    title: 'Скрытие',
    description: 'Скройте одну из уже раскрытых характеристик (она снова станет неизвестной)',
    targetRequired: false,
  },
  {
    id: 'extra_vote',
    title: 'Дополнительное голосование',
    description: 'Инициируйте дополнительное голосование за изгнание ещё одного игрока',
    targetRequired: false,
  },
  {
    id: 'swap_baggage',
    title: 'Обмен багажом',
    description: 'Обменяйтесь багажом с другим игроком',
    targetRequired: true,
  },
  {
    id: 'steal_action',
    title: 'Кража карты',
    description: 'Украдите неиспользованную карту действия у другого игрока',
    targetRequired: true,
  },
  {
    id: 'veto',
    title: 'Вето',
    description: 'Отмените результат голосования — изгнанный игрок остаётся',
    targetRequired: false,
  },
  {
    id: 'fortune',
    title: 'Удача',
    description: 'Перегенерируйте одну из своих характеристик случайным образом',
    targetRequired: false,
  },
];
