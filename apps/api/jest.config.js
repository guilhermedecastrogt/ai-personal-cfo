import { createDefaultEsmPreset } from 'ts-jest';

export default {
  ...createDefaultEsmPreset(),
  testEnvironment: 'node',
  rootDir: '.',
  testRegex: '\\.(spec|e2e-spec)\\.ts$',
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
