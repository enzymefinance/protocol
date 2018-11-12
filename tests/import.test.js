test('Import this package from node', () => {
  const melonProtocol = require('../');
  expect(Object.keys(melonProtocol)).toEqual([
    'utils',
    'token',
    'engine',
    'exchanges',
    'factory',
    'accounting',
    'compliance',
    'fees',
    'hub',
    'participation',
    'policies',
    'riskManagement',
    'shares',
    'trading',
    'vault',
    'prices',
    'version',
  ]);
});
