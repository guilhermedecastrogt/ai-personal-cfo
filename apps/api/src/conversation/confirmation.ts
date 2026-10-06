import { comparableName } from './extraction/member-resolution.js';

export type Confirmation = 'YES' | 'NO';

const YES_WORDS: ReadonlySet<string> = new Set([
  'sim',
  's',
  'isso',
  'pode',
  'ok',
  'okay',
  'certo',
  'beleza',
  'claro',
  'confirmo',
  'confirma',
  'correto',
  'exato',
  'yes',
  'y',
  'yep',
  'yeah',
  'sure',
  'correct',
  'confirm',
]);

const NO_WORDS: ReadonlySet<string> = new Set([
  'nao',
  'n',
  'cancela',
  'cancelar',
  'deixa',
  'no',
  'nope',
  'cancel',
]);

const FILLER_WORDS: ReadonlySet<string> = new Set([
  'sim',
  'isso',
  'mesmo',
  'pode',
  'apagar',
  'apaga',
  'registrar',
  'registra',
  'por',
  'favor',
  'obrigado',
  'obrigada',
  'valeu',
  'assim',
  'precisa',
  'deixar',
  'please',
  'thanks',
  'thank',
  'you',
  'go',
  'ahead',
  'need',
]);

export function readConfirmation(text: string): Confirmation | undefined {
  if (/\d/.test(text)) {
    return undefined;
  }
  const [first, ...rest] = comparableName(text)
    .split(' ')
    .filter((word) => word !== '');
  if (first === undefined || !rest.every((word) => FILLER_WORDS.has(word))) {
    return undefined;
  }
  if (NO_WORDS.has(first)) {
    return 'NO';
  }
  return YES_WORDS.has(first) ? 'YES' : undefined;
}
