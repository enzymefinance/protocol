require('babel-polyfill');

require('dotenv').config({
  path: require('find-up').sync(['.env', '.env.defaults']),
});

jest.setTimeout(10000);
