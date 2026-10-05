import baseConfig from './jest.config.js';

export default {
  ...baseConfig,
  testRegex: '\\.live-spec\\.ts$',
};
