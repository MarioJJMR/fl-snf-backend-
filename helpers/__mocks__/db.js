const pool = {
  query: jest.fn(),
  end: jest.fn().mockResolvedValue(undefined),
  getConnection: jest.fn().mockResolvedValue({ release: jest.fn(), query: jest.fn() }),
};

module.exports = pool;
