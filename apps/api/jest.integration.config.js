import baseConfig from './jest.config.js';

export default {
  ...baseConfig,
  testRegex: '\\.int-spec\\.ts$',
  testTimeout: 30000,
};
