import { Module, Global } from '@nestjs/common';
import { DatabaseService } from './services/database.service';
import { AiExplanationService } from './services/ai-explanation.service';

/**
 * Common module that provides shared services
 * Made global so it can be imported anywhere
 * ConfigModule is already global, so we don't need to import it here
 */
@Global()
@Module({
  providers: [DatabaseService, AiExplanationService],
  exports: [DatabaseService, AiExplanationService],
})
export class CommonModule {}

