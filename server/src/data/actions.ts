import { ActionCard } from "../../../shared/types.js";

export const actionCards: ActionCard[] = [
  {
    id: "buddy",
    title: "Будь другом",
    description: "Выбранный игрок до конца игры не голосует против тебя",
    targetRequired: true,
    image: "/cards/Особые условия/БУДЬ ДРУГОМ.jpg",
  },
  {
    id: "took_with",
    title: "Взял с собой",
    description:
      "Разыграй карту, только если ты изгнан. Забери любую открытую карту бункера — теперь она у изгнанных",
    targetRequired: false,
    image: "/cards/Особые условия/ВЗЯЛ С СОБОЙ.jpg",
  },
  {
    id: "turned_on_light",
    title: "Включил свет",
    description: "Замени любую открытую карту бункера на случайную из колоды",
    targetRequired: false,
    image: "/cards/Особые условия/ВКЛЮЧИЛ СВЕТ.jpg",
  },
  {
    id: "double_vote",
    title: "Громкий голос",
    description: "Твой голос считается за два в этом голосовании",
    targetRequired: false,
    image: "/cards/Особые условия/ГРОМКИЙ ГОЛОС.jpg",
  },
  {
    id: "shuffle_baggage",
    title: "Давайте начистоту: Багаж",
    description: "Собери все открытые карты багажа у неизгнанных игроков, перемешай и перераздай",
    targetRequired: false,
    image: "/cards/Особые условия/ДАВАЙТЕ НА ЧИСТОТУ БАГАЖА.jpg",
  },
  {
    id: "shuffle_bio",
    title: "Давайте начистоту: Биология",
    description: "Собери все открытые карты биологии у неизгнанных игроков, перемешай и перераздай",
    targetRequired: false,
    image: "/cards/Особые условия/ДАВАЙТЕ НА ЧИСТОТУ БИОЛОГИЯ.jpg",
  },
  {
    id: "shuffle_health",
    title: "Давайте начистоту: Здоровье",
    description: "Собери все открытые карты здоровья у неизгнанных игроков, перемешай и перераздай",
    targetRequired: false,
    image: "/cards/Особые условия/ДАВАЙТЕ НА ЧИСТОТУ ЗДОРОВЬЯ.jpg",
  },
  {
    id: "shuffle_facts",
    title: "Давайте начистоту: Факты",
    description: "Собери все открытые карты фактов у неизгнанных игроков, перемешай и перераздай",
    targetRequired: false,
    image: "/cards/Особые условия/ДАВАЙТЕ НА ЧИСТОТУ ФАКТОВ.jpg",
  },
  {
    id: "shuffle_hobby",
    title: "Давайте начистоту: Хобби",
    description: "Собери все открытые карты хобби у неизгнанных игроков, перемешай и перераздай",
    targetRequired: false,
    image: "/cards/Особые условия/ДАВАЙТЕ НА ЧИСТОТУ ХОББИ.jpg",
  },
  {
    id: "sabotage",
    title: "Диверсия",
    description: "Разыграй карту, только если ты изгнан. Сбрось любую открытую карту бункера",
    targetRequired: false,
    image: "/cards/Особые условия/ДИВЕРСИЯ.jpg",
  },
  {
    id: "discredit",
    title: "Дискредитация",
    description: "Голос выбранного игрока не учитывается в этом голосовании",
    targetRequired: true,
    image: "/cards/Особые условия/ДИСКРЕДИТАЦИЯ.jpg",
  },
  {
    id: "protect_left",
    title: "Защити игрока слева",
    description:
      "Храните карту в тайне. Если изгнан игрок слева, в следующий раз ты обязан голосовать против себя",
    targetRequired: false,
    image: "/cards/Особые условия/ЗАЩИТИ ИГРОКА СЛЕВА.jpg",
  },
  {
    id: "protect_right",
    title: "Защити игрока справа",
    description:
      "Храните карту в тайне. Если изгнан игрок справа, в следующий раз ты обязан голосовать против себя",
    targetRequired: false,
    image: "/cards/Особые условия/ЗАЩИТИ ИГРОКА СПРАВА.jpg",
  },
  {
    id: "protect_youngest",
    title: "Защити младшего",
    description:
      "Храните карту в тайне. Если изгнан самый младший (из тех, у кого открыт возраст), в следующий раз ты обязан голосовать против себя",
    targetRequired: false,
    image: "/cards/Особые условия/ЗАЩИТИ МЛАДШЕГО.jpg",
  },
  {
    id: "protect_brave",
    title: "Защити смелого",
    description:
      "Храните карту в тайне. Если изгнан игрок, первым открывший здоровье, в следующий раз ты обязан голосовать против себя",
    targetRequired: false,
    image: "/cards/Особые условия/ЗАЩИТИ СМЕЛОГО.jpg",
  },
  {
    id: "protect_oldest",
    title: "Защити старшего",
    description:
      "Храните карту в тайне. Если изгнан самый старший (из тех, у кого открыт возраст), в следующий раз ты обязан голосовать против себя",
    targetRequired: false,
    image: "/cards/Особые условия/ЗАЩИТИ СТАРШЕГО.jpg",
  },
  {
    id: "kompromat",
    title: "Компромат",
    description:
      "Голоса против выбранного игрока удваиваются в этом раунде, но сам ты не голосуешь",
    targetRequired: true,
    image: "/cards/Особые условия/КОМПРОМАТ.jpg",
  },
  {
    id: "steal_baggage",
    title: "Мне нужнее",
    description:
      "Забери себе карту багажа у любого игрока. Пострадавший берёт из колоды ещё 1 карту особых условий",
    targetRequired: true,
    image: "/cards/Особые условия/МНЕ НУЖНЕЕ.jpg",
  },
  {
    id: "silence",
    title: "Молчание",
    description:
      "Больше никто не говорит в этом раунде до голосования. Можно использовать жесты и пантомиму",
    targetRequired: false,
    image: "/cards/Особые условия/МОЛЧАНИЕ.jpg",
  },
  {
    id: "swap_baggage",
    title: "Обмен карт: Багаж",
    description: "Поменяйся открытыми картами багаж с игроком справа или слева",
    targetRequired: true,
    image: "/cards/Особые условия/ОБМЕН КАРТ БАГАЖ.jpg",
  },
  {
    id: "swap_bio",
    title: "Обмен карт: Биология",
    description: "Поменяйся открытыми картами биология с игроком справа или слева",
    targetRequired: true,
    image: "/cards/Особые условия/ОБМЕН КАРТ БИОЛОГИЯ.jpg",
  },
  {
    id: "swap_health",
    title: "Обмен карт: Здоровье",
    description: "Поменяйся открытыми картами здоровье с игроком справа или слева",
    targetRequired: true,
    image: "/cards/Особые условия/ОБМЕН КАРТ ЗДОРОВЬЕ.jpg",
  },
  {
    id: "swap_facts",
    title: "Обмен карт: Факты",
    description: "Поменяйся открытыми картами факты с игроком справа или слева",
    targetRequired: true,
    image: "/cards/Особые условия/ОБМЕН КАРТ ФАКТОВ.jpg",
  },
  {
    id: "swap_hobby",
    title: "Обмен карт: Хобби",
    description: "Поменяйся открытыми картами хобби с игроком справа или слева",
    targetRequired: true,
    image: "/cards/Особые условия/ОБМЕН КАРТ ХОББИ.jpg",
  },
  {
    id: "plan_b",
    title: "План Б",
    description: "Все должны переголосовать заново, выбирая другого кандидата",
    targetRequired: false,
    image: "/cards/Особые условия/ПЛАН Б.jpg",
  },
  {
    id: "bad_pills",
    title: "Просроченные таблетки",
    description: "Замени открытую карту здоровья любого игрока на случайную из колоды",
    targetRequired: true,
    image: "/cards/Особые условия/ПРОСРОЧЕННЫЕ ТАБЛЕТКИ.jpg",
  },
  {
    id: "direct_question",
    title: "Прямой вопрос",
    description:
      "Выбери тип карт — до конца раунда в свой ход все должны открывать карту этого типа, если она ещё не открыта",
    targetRequired: false,
    image: "/cards/Особые условия/ПРЯМОЙ ВОПРОС.jpg",
  },
  {
    id: "secret_threat",
    title: "Тайная угроза",
    description:
      "Разыграй карту, только если ты изгнан. Банда мародёров узнала о бункере — в финале эта карта дополнительная угроза для тех, кто в бункере",
    targetRequired: false,
    image: "/cards/Особые условия/ТАЙНАЯ УГРОЗА.jpg",
  },
  {
    id: "fake_diploma",
    title: "Фейковый диплом",
    description: "Смени открытую карту профессии любого игрока на случайную из колоды",
    targetRequired: true,
    image: "/cards/Особые условия/ФЕЙКОВЫЙ ДИПЛОМ.jpg",
  },
  {
    id: "good_pills",
    title: "Хорошие таблетки",
    description: "Сбрось открытую карту здоровья у любого игрока",
    targetRequired: true,
    image: "/cards/Особые условия/ХОРОШИЕ ТАБЛЕТКИ.jpg",
  },
];
