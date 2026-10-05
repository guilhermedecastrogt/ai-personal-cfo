import {
  decideNotification,
  deliveryHold,
  PROACTIVE_POLICY,
  severityRank,
} from './proactive-policy.js';

const NOW = new Date('2026-10-20T12:00:00Z');

function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * 3_600_000);
}

describe('notification policy', () => {
  it('ranks severities from least to most urgent', () => {
    expect(severityRank('INFO')).toBeLessThan(severityRank('LOW'));
    expect(severityRank('HIGH')).toBeLessThan(severityRank('CRITICAL'));
  });

  it('notifies a new event that is severe enough', () => {
    expect(
      decideNotification({ severity: 'MEDIUM', level: 1 }, undefined, NOW, PROACTIVE_POLICY),
    ).toEqual({ action: 'NOTIFY', escalation: false });
  });

  it.each(['INFO', 'LOW'] as const)('records a new %s event without notifying', (severity) => {
    expect(decideNotification({ severity, level: 1 }, undefined, NOW, PROACTIVE_POLICY)).toEqual({
      action: 'SUPPRESS',
      reason: 'BELOW_SEVERITY',
      recordLevel: true,
    });
  });

  it('suppresses an event that has not changed, however long ago it was notified', () => {
    for (const hours of [1, 13, 72]) {
      expect(
        decideNotification(
          { severity: 'HIGH', level: 3 },
          { level: 3, lastNotifiedAt: hoursAgo(hours) },
          NOW,
          PROACTIVE_POLICY,
        ),
      ).toEqual({ action: 'SUPPRESS', reason: 'ALREADY_NOTIFIED', recordLevel: false });
    }
  });

  it('suppresses an event that has become less severe', () => {
    expect(
      decideNotification(
        { severity: 'MEDIUM', level: 1 },
        { level: 3, lastNotifiedAt: hoursAgo(48) },
        NOW,
        PROACTIVE_POLICY,
      ).action,
    ).toBe('SUPPRESS');
  });

  it('notifies again when the event has materially worsened after the cooldown', () => {
    expect(
      decideNotification(
        { severity: 'MEDIUM', level: 2 },
        { level: 1, lastNotifiedAt: hoursAgo(PROACTIVE_POLICY.cooldownInHours) },
        NOW,
        PROACTIVE_POLICY,
      ),
    ).toEqual({ action: 'NOTIFY', escalation: true });
  });

  it('holds back a worsened event during the cooldown without recording the new level', () => {
    expect(
      decideNotification(
        { severity: 'HIGH', level: 3 },
        { level: 1, lastNotifiedAt: hoursAgo(1) },
        NOW,
        PROACTIVE_POLICY,
      ),
    ).toEqual({ action: 'SUPPRESS', reason: 'COOLDOWN', recordLevel: false });
  });

  it('lets a critical escalation through the cooldown', () => {
    expect(
      decideNotification(
        { severity: 'CRITICAL', level: 4 },
        { level: 3, lastNotifiedAt: hoursAgo(1) },
        NOW,
        PROACTIVE_POLICY,
      ),
    ).toEqual({ action: 'NOTIFY', escalation: true });
  });

  it('notifies an event that was recorded quietly and has since become notable', () => {
    expect(
      decideNotification(
        { severity: 'MEDIUM', level: 3 },
        { level: 2, lastNotifiedAt: null },
        NOW,
        PROACTIVE_POLICY,
      ),
    ).toEqual({ action: 'NOTIFY', escalation: true });
  });

  it('gives the same decision for the same inputs', () => {
    const decide = (): unknown =>
      decideNotification(
        { severity: 'HIGH', level: 3 },
        { level: 1, lastNotifiedAt: hoursAgo(20) },
        NOW,
        PROACTIVE_POLICY,
      );

    expect(decide()).toEqual(decide());
  });
});

describe('delivery hold', () => {
  it.each([22, 23, 0, 7])('holds a non-critical notification at %i:00', (hour) => {
    expect(deliveryHold('HIGH', hour, 0, PROACTIVE_POLICY)).toBe('QUIET_HOURS');
  });

  it.each([8, 12, 21])('delivers at %i:00', (hour) => {
    expect(deliveryHold('MEDIUM', hour, 0, PROACTIVE_POLICY)).toBeUndefined();
  });

  it('holds once the daily limit is reached', () => {
    const limit = PROACTIVE_POLICY.maximumDeliveriesPerDay;

    expect(deliveryHold('HIGH', 12, limit - 1, PROACTIVE_POLICY)).toBeUndefined();
    expect(deliveryHold('HIGH', 12, limit, PROACTIVE_POLICY)).toBe('DAILY_LIMIT');
  });

  it('never holds a critical notification', () => {
    expect(deliveryHold('CRITICAL', 3, 99, PROACTIVE_POLICY)).toBeUndefined();
  });

  it('supports quiet hours that do not cross midnight', () => {
    const policy = { ...PROACTIVE_POLICY, quietHours: { startHour: 1, endHour: 5 } };

    expect(deliveryHold('HIGH', 3, 0, policy)).toBe('QUIET_HOURS');
    expect(deliveryHold('HIGH', 23, 0, policy)).toBeUndefined();
  });
});
