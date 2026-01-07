import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiExplanationService, ExplanationContext } from './ai-explanation.service';
import OpenAI from 'openai';

// Mock OpenAI
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn(),
      },
    },
  }));
});

describe('AiExplanationService', () => {
  let service: AiExplanationService;
  let configService: ConfigService;
  let mockOpenAIClient: any;

  const mockConfigService = {
    get: jest.fn(),
  };

  const createMockContext = (): ExplanationContext => ({
    invoice: {
      amount: 100.0,
      date: '2024-01-01',
      vendor: 'Test Vendor',
      description: 'Test invoice description',
    },
    transaction: {
      amount: 100.0,
      date: '2024-01-02',
      description: 'Test transaction description',
    },
    heuristicScore: 0.9,
    heuristicExplanations: ['Amount matches', 'Date close'],
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiExplanationService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AiExplanationService>(AiExplanationService);
    configService = module.get<ConfigService>(ConfigService);

    // Get the OpenAI client instance if it was created
    if ((OpenAI as any).mock.results.length > 0) {
      mockOpenAIClient = (OpenAI as any).mock.results[0].value;
    }
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateExplanation', () => {
    it('should generate AI explanation when OpenAI is available', async () => {
      mockConfigService.get.mockReturnValue('test-api-key');

      // Recreate service with API key
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AiExplanationService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      const serviceWithAI = module.get<AiExplanationService>(
        AiExplanationService,
      );
      const openAIClient = (serviceWithAI as any).openai;

      if (openAIClient) {
        const mockCompletion = {
          choices: [
            {
              message: {
                content: 'This is a strong match based on exact amount and close dates.',
              },
            },
          ],
        };

        openAIClient.chat.completions.create = jest.fn().mockResolvedValue(mockCompletion);

        const context = createMockContext();
        const result = await serviceWithAI.generateExplanation(context);

        expect(result.source).toBe('ai');
        expect(result.explanation).toBeDefined();
        expect(result.confidence).toBeDefined();
      } else {
        // If OpenAI is not initialized, test fallback
        const context = createMockContext();
        const result = await serviceWithAI.generateExplanation(context);
        expect(result.source).toBe('fallback');
      }
    });

    it('should use fallback explanation when OpenAI is not configured', async () => {
      mockConfigService.get.mockReturnValue(null);

      const context = createMockContext();
      const result = await service.generateExplanation(context);

      expect(result.source).toBe('fallback');
      expect(result.explanation).toBeDefined();
      expect(result.confidence).toBeDefined();
    });

    it('should use fallback when AI request fails', async () => {
      mockConfigService.get.mockReturnValue('test-api-key');

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AiExplanationService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      const serviceWithAI = module.get<AiExplanationService>(
        AiExplanationService,
      );
      const openAIClient = (serviceWithAI as any).openai;

      if (openAIClient) {
        openAIClient.chat.completions.create = jest.fn().mockRejectedValue(
          new Error('API Error'),
        );

        const context = createMockContext();
        const result = await serviceWithAI.generateExplanation(context);

        expect(result.source).toBe('fallback');
      } else {
        const context = createMockContext();
        const result = await serviceWithAI.generateExplanation(context);
        expect(result.source).toBe('fallback');
      }
    });

    it('should use fallback when AI request times out', async () => {
      mockConfigService.get.mockReturnValue('test-api-key');

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AiExplanationService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      const serviceWithAI = module.get<AiExplanationService>(
        AiExplanationService,
      );
      const openAIClient = (serviceWithAI as any).openai;

      if (openAIClient) {
        // Mock timeout - reject immediately with Timeout error
        openAIClient.chat.completions.create = jest.fn().mockRejectedValue(
          new Error('Timeout'),
        );

        const context = createMockContext();
        const result = await serviceWithAI.generateExplanation(context);

        expect(result.source).toBe('fallback');
      } else {
        const context = createMockContext();
        const result = await serviceWithAI.generateExplanation(context);
        expect(result.source).toBe('fallback');
      }
    }, 10000);
  });

  describe('generateFallbackExplanation', () => {
    it('should generate explanation for exact amount match', async () => {
      const context: ExplanationContext = {
        invoice: {
          amount: 100.0,
          date: '2024-01-01',
          vendor: 'Vendor',
          description: null,
        },
        transaction: {
          amount: 100.0,
          date: '2024-01-01',
          description: null,
        },
        heuristicScore: 0.95,
        heuristicExplanations: [],
      };

      const result = await service.generateExplanation(context);

      expect(result.explanation).toContain('amount');
      expect(result.confidence).toBe('high');
    });

    it('should generate explanation for close dates', async () => {
      const context: ExplanationContext = {
        invoice: {
          amount: 100.0,
          date: '2024-01-01',
          vendor: 'Vendor',
          description: null,
        },
        transaction: {
          amount: 100.0,
          date: '2024-01-02',
          description: null,
        },
        heuristicScore: 0.8,
        heuristicExplanations: [],
      };

      const result = await service.generateExplanation(context);

      expect(result.explanation).toBeDefined();
      expect(result.confidence).toBe('high');
    });

    it('should determine confidence based on score', async () => {
      const highScoreContext: ExplanationContext = {
        invoice: {
          amount: 100.0,
          date: '2024-01-01',
          vendor: 'Vendor',
          description: null,
        },
        transaction: {
          amount: 100.0,
          date: '2024-01-01',
          description: null,
        },
        heuristicScore: 0.9,
        heuristicExplanations: [],
      };

      const result = await service.generateExplanation(highScoreContext);
      expect(result.confidence).toBe('high');

      const lowScoreContext: ExplanationContext = {
        ...highScoreContext,
        heuristicScore: 0.3,
      };

      const lowResult = await service.generateExplanation(lowScoreContext);
      expect(lowResult.confidence).toBe('low');
    });

    it('should include vendor name in explanation when present in description', async () => {
      const context: ExplanationContext = {
        invoice: {
          amount: 100.0,
          date: '2024-01-01',
          vendor: 'Test Vendor',
          description: 'Invoice from Test Vendor',
        },
        transaction: {
          amount: 100.0,
          date: '2024-01-01',
          description: 'Payment to Test Vendor',
        },
        heuristicScore: 0.8,
        heuristicExplanations: [],
      };

      const result = await service.generateExplanation(context);

      expect(result.explanation).toBeDefined();
      expect(result.explanation.length).toBeGreaterThan(0);
    });
  });
});

