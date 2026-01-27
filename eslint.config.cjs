const config = require('@modusoperandi/eslint-config');
module.exports = [
   {
    ignores: [
      "node_modules/**",
      "dist/**",
      "build/**",
      "coverage/**"
    ],
  },
  ...config.getFlatConfig({
    strict: false,
    header: config.header.mit,
  }),
];
