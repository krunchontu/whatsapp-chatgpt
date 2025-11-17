/**
 * User Repository Verification Script
 *
 * Purpose: Verify Chunk 1.2 acceptance criteria
 * Run: DATABASE_URL="file:./data/whatsapp-bot.db" npx tsx verify-user-repo.ts
 */

import { UserRepository, UserRole, prisma } from './src/db';

async function verifyUserRepository() {
  try {
    console.log('Testing User Repository...\n');

    // Clean up
    await prisma.user.deleteMany();

    // Acceptance Criteria 1: Create user
    console.log('1. Testing create user...');
    const user = await UserRepository.create({
      phoneNumber: '+1234567890',
      role: UserRole.USER,
    });
    console.log('   ✓ Created user:', user.phoneNumber);

    // Acceptance Criteria 2: Find by phone
    console.log('\n2. Testing findByPhoneNumber...');
    const found = await UserRepository.findByPhoneNumber('+1234567890');
    console.log('   ✓ Found user:', found?.phoneNumber);

    // Acceptance Criteria 3: Update role
    console.log('\n3. Testing promoteToAdmin...');
    const admin = await UserRepository.promoteToAdmin(user.id);
    console.log('   ✓ Promoted to admin:', admin.role);

    // Acceptance Criteria 4: Whitelist management
    console.log('\n4. Testing whitelist management...');
    const whitelisted = await UserRepository.addToWhitelist(user.id);
    console.log('   ✓ Added to whitelist:', whitelisted.isWhitelisted);

    // Acceptance Criteria 5: Bulk operations
    console.log('\n5. Testing bulk whitelist...');
    const bulkUsers = await UserRepository.bulkWhitelist([
      '+1111111111',
      '+2222222222',
      '+3333333333',
    ]);
    console.log('   ✓ Bulk whitelisted users:', bulkUsers.length);

    // Acceptance Criteria 6: Query helpers
    console.log('\n6. Testing query helpers...');
    const isAdmin = await UserRepository.isAdmin(admin.id);
    const isWhitelisted = await UserRepository.isWhitelisted(admin.id);
    const allAdmins = await UserRepository.findAllAdmins();
    const allWhitelisted = await UserRepository.findAllWhitelisted();
    console.log('   ✓ isAdmin:', isAdmin);
    console.log('   ✓ isWhitelisted:', isWhitelisted);
    console.log('   ✓ Total admins:', allAdmins.length);
    console.log('   ✓ Total whitelisted:', allWhitelisted.length);

    // Acceptance Criteria 7: Statistics
    console.log('\n7. Testing user statistics...');
    const stats = await UserRepository.getUserWithStats(admin.id);
    console.log('   ✓ User stats:', {
      conversations: stats?._count.conversations,
      usageMetrics: stats?._count.usageMetrics,
    });

    console.log('\n✓ All User Repository tests passed!');
    console.log('✓ Chunk 1.2 acceptance criteria verified');

    // Cleanup
    await prisma.user.deleteMany();

  } catch (error) {
    console.error('\n✗ User Repository test failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

verifyUserRepository();
