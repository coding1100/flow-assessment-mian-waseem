import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface ExplanationContext {
  invoice: {
    amount: number;
    date: string;
    vendor: string;
    description: string | null;
  };
  transaction: {
    amount: number;
    date: string;
    description: string | null;
  };
  heuristicScore: number;
  heuristicExplanations: string[];
}

export interface ExplanationResult {
  explanation: string;
  confidence: 'high' | 'medium' | 'low';
  source: 'ai' | 'fallback';
}

@Injectable()
export class AiExplanationService {
  private readonly logger = new Logger(AiExplanationService.name);
  private readonly openai: OpenAI | null = null;
  private readonly timeoutMs = 5000; // 5 second timeout

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      try {
        this.openai = new OpenAI({
          apiKey,
          timeout: this.timeoutMs,
        });
        this.logger.log('OpenAI client initialized');
      } catch (error) {
        this.logger.warn('Failed to initialize OpenAI client', error);
      }
    } else {
      this.logger.warn('OPENAI_API_KEY not configured, AI explanations will be disabled');
    }
  }

  /**
   * Generate an AI-powered explanation for a reconciliation match
   */
  async generateExplanation(
    context: ExplanationContext,
  ): Promise<ExplanationResult> {
    // Try AI first if available
    if (this.openai) {
      try {
        return await this.generateAiExplanation(context);
      } catch (error: any) {
        this.logger.warn(
          `AI explanation failed: ${error.message}, falling back to deterministic explanation`,
        );
        // Fall through to deterministic fallback
      }
    }

    // Fallback to deterministic explanation
    return this.generateFallbackExplanation(context);
  }

  /**
   * Generate explanation using OpenAI
   */
  private async generateAiExplanation(
    context: ExplanationContext,
  ): Promise<ExplanationResult> {
    if (!this.openai) {
      throw new Error('OpenAI client not available');
    }

    const prompt = this.buildPrompt(context);

    try {
      const completion = await Promise.race([
        this.openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'You are a financial reconciliation expert. Explain why an invoice and bank transaction are likely matched, based on the provided data. Be concise (2-6 sentences) and professional.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          max_tokens: 200,
          temperature: 0.3,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), this.timeoutMs),
        ),
      ]);

      const response = completion.choices[0]?.message?.content?.trim();
      if (!response) {
        throw new Error('Empty response from OpenAI');
      }

      // Determine confidence based on heuristic score
      const confidence = this.determineConfidence(context.heuristicScore);

      return {
        explanation: response,
        confidence,
        source: 'ai',
      };
    } catch (error: any) {
      if (error.message === 'Timeout') {
        this.logger.warn('OpenAI request timed out');
      } else {
        this.logger.error('OpenAI API error', error.stack);
      }
      throw error;
    }
  }

  /**
   * Build the prompt for OpenAI
   */
  private buildPrompt(context: ExplanationContext): string {
    const { invoice, transaction, heuristicScore, heuristicExplanations } =
      context;

    return `Analyze this potential invoice-transaction match:

Invoice:
- Amount: ${invoice.amount} ${invoice.date ? `(${invoice.date})` : ''}
- Vendor: ${invoice.vendor}
- Description: ${invoice.description || 'N/A'}

Transaction:
- Amount: ${transaction.amount} ${transaction.date ? `(${transaction.date})` : ''}
- Description: ${transaction.description || 'N/A'}

Match Score: ${heuristicScore.toFixed(2)}/1.0
Heuristic Indicators: ${heuristicExplanations.join('; ')}

Provide a brief explanation (2-6 sentences) of why these are likely matched, focusing on the strongest indicators.`;
  }

  /**
   * Generate a deterministic fallback explanation
   */
  private generateFallbackExplanation(
    context: ExplanationContext,
  ): ExplanationResult {
    const { invoice, transaction, heuristicScore, heuristicExplanations } =
      context;

    const parts: string[] = [];

    // Amount match
    const amountDiff = Math.abs(invoice.amount - transaction.amount);
    const amountMatchPercent =
      invoice.amount > 0
        ? ((invoice.amount - amountDiff) / invoice.amount) * 100
        : 0;

    if (amountMatchPercent > 99.9) {
      parts.push('The amounts match exactly');
    } else if (amountMatchPercent > 95) {
      parts.push(
        `The amounts are very close (difference of ${amountDiff.toFixed(2)})`,
      );
    } else if (amountMatchPercent > 80) {
      parts.push(
        `The amounts are similar (difference of ${amountDiff.toFixed(2)})`,
      );
    } else {
      parts.push('The amounts differ significantly');
    }

    // Date proximity
    if (invoice.date && transaction.date) {
      const invoiceDate = new Date(invoice.date);
      const transactionDate = new Date(transaction.date);
      const daysDiff = Math.abs(
        (invoiceDate.getTime() - transactionDate.getTime()) /
          (1000 * 60 * 60 * 24),
      );

      if (daysDiff <= 3) {
        parts.push('The dates are very close');
      } else if (daysDiff <= 14) {
        parts.push('The dates are within a reasonable range');
      } else if (daysDiff <= 30) {
        parts.push('The dates are somewhat far apart');
      }
    }

    // Vendor/description matching
    if (invoice.vendor && transaction.description) {
      const vendorLower = invoice.vendor.toLowerCase();
      const descLower = transaction.description.toLowerCase();
      if (descLower.includes(vendorLower)) {
        parts.push('The transaction description mentions the vendor');
      }
    }

    // Add heuristic explanations
    if (heuristicExplanations.length > 0) {
      parts.push(
        `Additional indicators: ${heuristicExplanations.slice(0, 2).join(', ')}`,
      );
    }

    // Score-based conclusion
    if (heuristicScore >= 0.9) {
      parts.push('This is a very strong match');
    } else if (heuristicScore >= 0.7) {
      parts.push('This is a good match');
    } else if (heuristicScore >= 0.5) {
      parts.push('This is a moderate match');
    } else {
      parts.push('This is a weak match');
    }

    const explanation = parts.join('. ') + '.';
    const confidence = this.determineConfidence(heuristicScore);

    return {
      explanation,
      confidence,
      source: 'fallback',
    };
  }

  /**
   * Determine confidence level based on heuristic score
   */
  private determineConfidence(
    score: number,
  ): 'high' | 'medium' | 'low' {
    if (score >= 0.8) {
      return 'high';
    } else if (score >= 0.5) {
      return 'medium';
    } else {
      return 'low';
    }
  }
}

