import { resolveMentionedGoal } from './goal-resolution.js';

const MALTA = { id: 'malta', name: 'Viagem Malta' };
const LISBOA = { id: 'lisboa', name: 'Viagem a Lisboa' };
const RESERVE = { id: 'reserve', name: 'Reserva de emergência' };
const GOALS = [MALTA, LISBOA, RESERVE];

describe('resolveMentionedGoal', () => {
  it.each([
    ['Viagem Malta', MALTA],
    ['viagem malta', MALTA],
    ['meta viagem malta', MALTA],
    ['malta', MALTA],
    ['reserva', RESERVE],
    ['a reserva de emergencia', RESERVE],
    ['lisboa', LISBOA],
  ])('reads %j', (mention, goal) => {
    expect(resolveMentionedGoal(mention, GOALS)).toEqual({ status: 'RESOLVED', goal });
  });

  it('lists the goals a vague name fits', () => {
    expect(resolveMentionedGoal('viagem', GOALS)).toEqual({
      status: 'AMBIGUOUS',
      goals: [MALTA, LISBOA],
    });
  });

  it('does not guess a goal that is not there', () => {
    expect(resolveMentionedGoal('carro novo', GOALS)).toEqual({ status: 'UNKNOWN' });
  });
});
