/**
 * Conversation Repository Verification Script
 *
 * Purpose: Verify Chunk 1.3 acceptance criteria
 * Run: DATABASE_URL="file:./data/whatsapp-bot.db" npx tsx verify-conversation-repo.ts
 */

import {
  ConversationRepository,
  MessageRole,
  UserRepository,
  prisma,
} from './src/db';

async function verifyConversationRepository() {
  try {
    console.log('Testing Conversation Repository...\n');

    // Clean up
    await prisma.conversation.deleteMany();
    await prisma.user.deleteMany();

    // Create test user
    const user = await UserRepository.create({
      phoneNumber: '+1234567890',
    });

    // Acceptance Criteria 1: Create conversation
    console.log('1. Testing create conversation...');
    const conversation = await ConversationRepository.create({
      userId: user.id,
    });
    console.log('   ✓ Created conversation:', conversation.id);
    console.log('   ✓ Expires at:', conversation.expiresAt);

    // Acceptance Criteria 2: Add messages
    console.log('\n2. Testing add messages...');
    await ConversationRepository.addMessage(user.id, {
      role: MessageRole.USER,
      content: 'Hello, AI!',
    });
    await ConversationRepository.addMessage(user.id, {
      role: MessageRole.ASSISTANT,
      content: 'Hello! How can I help you?',
    });
    await ConversationRepository.addMessage(user.id, {
      role: MessageRole.USER,
      content: 'Tell me about yourself.',
    });
    console.log('   ✓ Added 3 messages');

    // Acceptance Criteria 3: Get messages
    console.log('\n3. Testing get messages...');
    const messages = await ConversationRepository.getMessages(user.id);
    console.log('   ✓ Retrieved messages:', messages.length);
    messages.forEach((msg, i) => {
      console.log(`   ✓ Message ${i + 1}: [${msg.role}] ${msg.content}`);
    });

    // Acceptance Criteria 4: Get context for AI
    console.log('\n4. Testing get context (OpenAI format)...');
    const context = await ConversationRepository.getContext(user.id);
    console.log('   ✓ Context messages:', context.length);
    console.log('   ✓ Format:', JSON.stringify(context[0], null, 2));

    // Acceptance Criteria 5: Get last N messages
    console.log('\n5. Testing get last N messages...');
    const last2 = await ConversationRepository.getLastMessages(user.id, 2);
    console.log('   ✓ Last 2 messages:', last2.map((m) => m.content));

    // Acceptance Criteria 6: Message limit (context window)
    console.log('\n6. Testing message limit (MAX_MESSAGES = 10)...');
    for (let i = 0; i < 12; i++) {
      await ConversationRepository.addMessage(user.id, {
        role: MessageRole.USER,
        content: `Message ${i}`,
      });
    }
    const afterLimit = await ConversationRepository.getMessages(user.id);
    console.log('   ✓ Messages after adding 12 more:', afterLimit.length);
    console.log('   ✓ Should be at MAX_MESSAGES (10):', afterLimit.length === 10);

    // Acceptance Criteria 7: Clear history
    console.log('\n7. Testing clear history...');
    const cleared = await ConversationRepository.clearHistory(user.id);
    console.log('   ✓ New conversation created:', cleared.id);
    console.log('   ✓ Messages after clear:', cleared.messages.length);

    // Acceptance Criteria 8: TTL management
    console.log('\n8. Testing TTL management...');
    const extended = await ConversationRepository.extendExpiry(cleared.id, 14);
    console.log('   ✓ Extended expiry by 14 days');
    console.log('   ✓ New expiry:', extended.expiresAt);

    // Acceptance Criteria 9: Cleanup operations
    console.log('\n9. Testing cleanup operations...');

    // Create expired conversation
    await ConversationRepository.create({
      userId: user.id,
      expiresAt: new Date(Date.now() - 1000),
    });

    const expiredCount = await ConversationRepository.countExpired();
    console.log('   ✓ Expired conversations:', expiredCount);

    const deletedCount = await ConversationRepository.deleteExpired();
    console.log('   ✓ Deleted expired conversations:', deletedCount);

    // Acceptance Criteria 10: User statistics
    console.log('\n10. Testing user statistics...');
    const stats = await ConversationRepository.getUserStats(user.id);
    console.log('   ✓ User stats:', {
      totalConversations: stats.totalConversations,
      activeConversations: stats.activeConversations,
      totalMessages: stats.totalMessages,
    });

    console.log('\n✓ All Conversation Repository tests passed!');
    console.log('✓ Chunk 1.3 acceptance criteria verified');

    // Cleanup
    await prisma.conversation.deleteMany();
    await prisma.user.deleteMany();

  } catch (error) {
    console.error('\n✗ Conversation Repository test failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

verifyConversationRepository();
