import { Module } from '@nestjs/common';
import { GptsController } from './gpts.controller';
import { GptsService } from './gpts.service';
import { DynamoModule } from '../dynamo/dynamo.module';
import { GeminiModule } from '../gemini/gemini.module';

@Module({
  imports: [DynamoModule, GeminiModule],
  controllers: [GptsController],
  providers: [GptsService],
})
export class GptsModule { }