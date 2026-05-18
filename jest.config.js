module.exports = {
  testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
  setupFiles: ['./src/tests/setupEnv.js'],
  collectCoverageFrom: [
    'src/modules/friends/friends.service.js',
  ],
};
