jest.mock('aws-sdk', () => {
  return {
    config: { update: jest.fn() },
    RDSDataService: jest.fn().mockImplementation(() => ({
      createConnection: jest.fn()
    }))
  };
}, { virtual: true });
const { buildResponse } = require('./index');

test('buildResponse returns correct object', () => {
  const result = buildResponse(200, { a: 1 });
  expect(result).toEqual({
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ a: 1 })
  });
});
