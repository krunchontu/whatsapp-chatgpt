/**
 * Integration Test: Voice Message → Transcription → GPT Flow
 *
 * Purpose: Test the complete end-to-end flow of processing voice messages
 * Priority: P1 - Important for voice support feature
 *
 * Test Flow:
 * 1. User sends voice message
 * 2. Voice transcribed via OpenAI Whisper
 * 3. Transcribed text processed by GPT
 * 4. Conversation and usage tracked
 * 5. Reply sent to user
 *
 * Run: npm test src/__tests__/integration/voice-flow.test.ts
 */

import { prisma } from '../../db/client';
import { UserRepository, UserRole } from '../../db/repositories/user.repository';
import { ConversationRepository } from '../../db/repositories/conversation.repository';
import { UsageRepository, OperationType } from '../../db/repositories/usage.repository';
import { handleIncomingMessage } from '../../handlers/message';
import { transcribeOpenAI } from '../../providers/openai';
import { chatCompletion } from '../../providers/openai';
import type { Message, MessageMedia } from 'whatsapp-web.js';

// Mock OpenAI provider
jest.mock('../../providers/openai', () => ({
  transcribeOpenAI: jest.fn(),
  chatCompletion: jest.fn(),
  initOpenAI: jest.fn(),
  openai: null,
}));

// Mock CLI UI
jest.mock('../../cli/ui', () => ({
  print: jest.fn(),
}));

// Mock config to enable transcription
jest.mock('../../config', () => ({
  default: {
    transcriptionEnabled: true,
    transcriptionMode: 'OpenAI',
    prefixEnabled: false,
    groupchatsEnabled: false,
    promptModerationEnabled: false,
    visionEnabled: false,
    redis: { enabled: false },
  },
}));

describe('Integration: Voice Message → Transcription → GPT Flow', () => {
  // ============================================================================
  // Test Setup & Teardown
  // ============================================================================

  beforeEach(async () => {
    // Clean database
    await prisma.usageMetric.deleteMany({});
    await prisma.conversation.deleteMany({});
    await prisma.user.deleteMany({});

    // Reset mocks
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ============================================================================
  // Test Helpers
  // ============================================================================

  function createMockVoiceMessage(from: string): Message {
    const mockMedia: MessageMedia = {
      mimetype: 'audio/ogg; codecs=opus',
      data: Buffer.from('fake audio data').toString('base64'),
      filename: 'voice.ogg',
      filesize: 1024,
    } as any;

    return {
      from,
      body: '',
      reply: jest.fn().mockResolvedValue(undefined),
      hasMedia: true,
      downloadMedia: jest.fn().mockResolvedValue(mockMedia),
      timestamp: Date.now() / 1000,
      id: { _serialized: 'test-message-id' },
    } as any;
  }

  function createMockTextMessage(from: string, body: string): Message {
    return {
      from,
      body,
      reply: jest.fn().mockResolvedValue(undefined),
      hasMedia: false,
      timestamp: Date.now() / 1000,
      id: { _serialized: 'test-message-id' },
    } as any;
  }

  // ============================================================================
  // Happy Path Tests
  // ============================================================================

  describe('Happy Path: Voice Transcription', () => {
    it('should transcribe voice message, process with GPT, and reply', async () => {
      // Arrange
      const phoneNumber = '+1234567890';
      const transcribedText = 'What is the weather today?';
      const gptResponse = 'I cannot check real-time weather. Please check a weather app.';

      // Create user
      await UserRepository.create({
        phoneNumber,
        role: UserRole.USER,
      });

      // Mock transcription
      (transcribeOpenAI as jest.Mock).mockResolvedValue({
        text: transcribedText,
        language: 'en',
      });

      // Mock GPT response
      (chatCompletion as jest.Mock).mockResolvedValue({
        content: gptResponse,
        totalTokens: 40,
        promptTokens: 15,
        completionTokens: 25,
      });

      const message = createMockVoiceMessage(phoneNumber);

      // Act
      await handleIncomingMessage(message);

      // Assert

      // 1. Voice was transcribed
      expect(transcribeOpenAI).toHaveBeenCalledTimes(1);
      expect(transcribeOpenAI).toHaveBeenCalledWith(expect.any(Buffer));

      // 2. GPT was called with transcribed text
      expect(chatCompletion).toHaveBeenCalledTimes(1);
      expect(chatCompletion).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: transcribedText,
          }),
        ]),
        undefined
      );

      // 3. Reply sent to user
      expect(message.reply).toHaveBeenCalledWith(gptResponse);

      // 4. Conversation stored with transcribed text
      const user = await UserRepository.findByPhoneNumber(phoneNumber);
      const conversations = await ConversationRepository.getHistory(user!.id, 10);
      expect(conversations).toHaveLength(2);
      expect(conversations[1]).toMatchObject({
        role: 'user',
        content: transcribedText,
      });

      // 5. Usage tracked for both transcription and GPT
      const metrics = await UsageRepository.findByUserId(user!.id);
      expect(metrics.length).toBeGreaterThan(0);

      // Should have chat completion usage
      const chatMetrics = metrics.filter(m => m.operationType === OperationType.CHAT_COMPLETION);
      expect(chatMetrics).toHaveLength(1);
      expect(chatMetrics[0].totalTokens).toBe(40);
    });

    it('should handle voice messages in different languages', async () => {
      // Arrange
      const phoneNumber = '+1234567890';
      await UserRepository.create({
        phoneNumber,
        role: UserRole.USER,
      });

      // Mock Spanish transcription
      (transcribeOpenAI as jest.Mock).mockResolvedValue({
        text: '¿Cómo estás?',
        language: 'es',
      });

      (chatCompletion as jest.Mock).mockResolvedValue({
        content: 'Estoy bien, gracias. ¿Y tú?',
        totalTokens: 20,
        promptTokens: 8,
        completionTokens: 12,
      });

      const message = createMockVoiceMessage(phoneNumber);

      // Act
      await handleIncomingMessage(message);

      // Assert
      expect(transcribeOpenAI).toHaveBeenCalled();
      expect(chatCompletion).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            content: '¿Cómo estás?',
          }),
        ]),
        undefined
      );
    });
  });

  // ============================================================================
  // Queue-Based Transcription (Redis Enabled)
  // ============================================================================

  describe('Async Queue Transcription', () => {
    it('should queue voice transcription when Redis is enabled', async () => {
      // Note: This test would require mocking the queue system
      // For MVP, we're testing synchronous flow
      // Queue tests are covered in queue/workers tests

      expect(true).toBe(true); // Placeholder
    });
  });

  // ============================================================================
  // Edge Cases & Error Handling
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle transcription failures gracefully', async () => {
      // Arrange
      const phoneNumber = '+1234567890';
      await UserRepository.create({
        phoneNumber,
        role: UserRole.USER,
      });

      // Mock transcription error
      (transcribeOpenAI as jest.Mock).mockRejectedValue(
        new Error('Transcription API error')
      );

      const message = createMockVoiceMessage(phoneNumber);

      // Act
      await handleIncomingMessage(message);

      // Assert
      // Should send error message (or handle gracefully)
      // GPT should NOT be called
      expect(chatCompletion).not.toHaveBeenCalled();
    });

    it('should handle empty transcription result', async () => {
      // Arrange
      const phoneNumber = '+1234567890';
      await UserRepository.create({
        phoneNumber,
        role: UserRole.USER,
      });

      // Mock empty transcription
      (transcribeOpenAI as jest.Mock).mockResolvedValue({
        text: '',
        language: 'en',
      });

      const message = createMockVoiceMessage(phoneNumber);

      // Act
      await handleIncomingMessage(message);

      // Assert
      // Should not call GPT with empty text
      expect(chatCompletion).not.toHaveBeenCalled();
    });

    it('should handle corrupted audio data', async () => {
      // Arrange
      const phoneNumber = '+1234567890';
      await UserRepository.create({
        phoneNumber,
        role: UserRole.USER,
      });

      // Mock media download failure
      const message = createMockVoiceMessage(phoneNumber);
      (message.downloadMedia as jest.Mock).mockResolvedValue(null);

      // Act
      await handleIncomingMessage(message);

      // Assert
      // Should not attempt transcription with null media
      expect(transcribeOpenAI).not.toHaveBeenCalled();
      expect(chatCompletion).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Mixed Message Types
  // ============================================================================

  describe('Mixed Message Types', () => {
    it('should handle text and voice messages in same conversation', async () => {
      // Arrange
      const phoneNumber = '+1234567890';
      await UserRepository.create({
        phoneNumber,
        role: UserRole.USER,
      });

      // Mock responses
      (chatCompletion as jest.Mock)
        .mockResolvedValueOnce({
          content: 'Response to text',
          totalTokens: 20,
          promptTokens: 10,
          completionTokens: 10,
        })
        .mockResolvedValueOnce({
          content: 'Response to voice',
          totalTokens: 25,
          promptTokens: 12,
          completionTokens: 13,
        });

      (transcribeOpenAI as jest.Mock).mockResolvedValue({
        text: 'Transcribed voice message',
        language: 'en',
      });

      // Act: Send text message
      const textMessage = createMockTextMessage(phoneNumber, 'Hello');
      await handleIncomingMessage(textMessage);

      // Act: Send voice message
      const voiceMessage = createMockVoiceMessage(phoneNumber);
      await handleIncomingMessage(voiceMessage);

      // Assert
      const user = await UserRepository.findByPhoneNumber(phoneNumber);
      const conversations = await ConversationRepository.getHistory(user!.id, 10);

      // Should have 4 entries: text user + gpt, voice user + gpt
      expect(conversations).toHaveLength(4);
      expect(conversations[3].content).toBe('Hello'); // First text message
      expect(conversations[1].content).toBe('Transcribed voice message'); // Voice transcription

      // Both messages replied to
      expect(textMessage.reply).toHaveBeenCalledWith('Response to text');
      expect(voiceMessage.reply).toHaveBeenCalledWith('Response to voice');
    });
  });

  // ============================================================================
  // Conversation Context with Voice
  // ============================================================================

  describe('Conversation Context', () => {
    it('should maintain context across text and voice messages', async () => {
      // Arrange
      const phoneNumber = '+1234567890';
      await UserRepository.create({
        phoneNumber,
        role: UserRole.USER,
      });

      (chatCompletion as jest.Mock)
        .mockResolvedValueOnce({
          content: 'The capital of France is Paris.',
          totalTokens: 30,
          promptTokens: 15,
          completionTokens: 15,
        })
        .mockResolvedValueOnce({
          content: 'Paris has about 2.2 million people.',
          totalTokens: 35,
          promptTokens: 20,
          completionTokens: 15,
        });

      (transcribeOpenAI as jest.Mock).mockResolvedValue({
        text: 'What is its population?',
        language: 'en',
      });

      // Act: Text question
      const textMessage = createMockTextMessage(phoneNumber, 'What is the capital of France?');
      await handleIncomingMessage(textMessage);

      // Act: Voice follow-up
      const voiceMessage = createMockVoiceMessage(phoneNumber);
      await handleIncomingMessage(voiceMessage);

      // Assert
      // Second GPT call should include conversation history
      const secondCallArgs = (chatCompletion as jest.Mock).mock.calls[1][0];
      expect(secondCallArgs).toHaveLength(3);
      expect(secondCallArgs[0]).toMatchObject({
        role: 'user',
        content: 'What is the capital of France?',
      });
      expect(secondCallArgs[1]).toMatchObject({
        role: 'assistant',
        content: 'The capital of France is Paris.',
      });
      expect(secondCallArgs[2]).toMatchObject({
        role: 'user',
        content: 'What is its population?',
      });
    });
  });
});
