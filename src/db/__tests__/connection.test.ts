/**
 * Database Connection Tests
 *
 * Purpose: Verify Prisma client setup and database connectivity
 * Run: pnpm test src/db/__tests__/connection.test.ts
 */

import { prisma, testConnection, disconnectPrisma } from '../index';

describe('Database Connection', () => {
  /**
   * Cleanup after all tests
   */
  afterAll(async () => {
    await disconnectPrisma();
  });

  describe('Prisma Client', () => {
    it('should be defined', () => {
      expect(prisma).toBeDefined();
    });

    it('should be an instance of PrismaClient', () => {
      expect(prisma).toHaveProperty('$connect');
      expect(prisma).toHaveProperty('$disconnect');
      expect(prisma).toHaveProperty('user');
      expect(prisma).toHaveProperty('conversation');
      expect(prisma).toHaveProperty('usageMetric');
      expect(prisma).toHaveProperty('systemConfig');
    });
  });

  describe('testConnection()', () => {
    it('should successfully connect to database', async () => {
      const result = await testConnection();
      expect(result).toBe(true);
    });

    it('should execute raw SQL query', async () => {
      const result = await prisma.$queryRaw<Array<{ result: number }>>`SELECT 1 as result`;
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('result', 1);
    });
  });

  describe('Database Models', () => {
    it('should have User model available', async () => {
      // This will create the table if it doesn't exist
      const users = await prisma.user.findMany();
      expect(Array.isArray(users)).toBe(true);
    });

    it('should have Conversation model available', async () => {
      const conversations = await prisma.conversation.findMany();
      expect(Array.isArray(conversations)).toBe(true);
    });

    it('should have UsageMetric model available', async () => {
      const metrics = await prisma.usageMetric.findMany();
      expect(Array.isArray(metrics)).toBe(true);
    });

    it('should have SystemConfig model available', async () => {
      const config = await prisma.systemConfig.findMany();
      expect(Array.isArray(config)).toBe(true);
    });
  });

  describe('Singleton Pattern', () => {
    it('should reuse the same Prisma client instance', () => {
      // Import again to verify singleton
      const { prisma: prisma2 } = require('../index');
      expect(prisma).toBe(prisma2);
    });
  });
});
