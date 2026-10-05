import { enabledLogLevels } from './create-logger.js';

describe('enabledLogLevels', () => {
  it('enables only fatal and error at the error level', () => {
    expect(enabledLogLevels('error')).toEqual(['fatal', 'error']);
  });

  it('enables every level up to and including the configured one', () => {
    expect(enabledLogLevels('log')).toEqual(['fatal', 'error', 'warn', 'log']);
  });

  it('enables all levels at the debug level', () => {
    expect(enabledLogLevels('debug')).toEqual(['fatal', 'error', 'warn', 'log', 'debug']);
  });
});
