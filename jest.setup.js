// Jest setup file - runs before each test file

// Load environment variables from .env.test
require('dotenv').config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';

// Mock console methods to reduce noise in test output
// (can be overridden in individual tests)
global.console = {
  ...console,
  // Uncomment to suppress console output during tests
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  error: console.error,  // Keep errors visible
};

// Increase timeout for integration tests
jest.setTimeout(30000);
