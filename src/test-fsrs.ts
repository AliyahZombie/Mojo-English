import { fsrs, createEmptyCard, Rating, State } from 'ts-fsrs';
const f = fsrs();
let card = createEmptyCard();
console.log(card);
const scheduling_cards = f.repeat(card, new Date());
console.log(scheduling_cards);
const good = scheduling_cards[Rating.Good];
console.log(good);
