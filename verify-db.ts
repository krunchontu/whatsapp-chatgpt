/**
 * Database Connection Verification Script
 *
 * Purpose: Verify Chunk 1.1 acceptance criteria
 * Run: npx tsx verify-db.ts
 */

import { prisma } from './src/db';

async function verifyConnection() {
  try {
    console.log('Testing database connection...');

    // Acceptance criteria: This should work
    const users = await prisma.user.findMany();
    console.log('✓ Successfully queried users:', users.length, 'users found');

    // Test other models
    const conversations = await prisma.conversation.findMany();
    console.log('✓ Successfully queried conversations:', conversations.length, 'conversations found');

    const metrics = await prisma.usageMetric.findMany();
    console.log('✓ Successfully queried usage metrics:', metrics.length, 'metrics found');

    const config = await prisma.systemConfig.findMany();
    console.log('✓ Successfully queried system config:', config.length, 'config entries found');

    console.log('\n✓ All database connection tests passed!');
    console.log('✓ Chunk 1.1 acceptance criteria verified');

  } catch (error) {
    console.error('✗ Database connection test failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

verifyConnection();
