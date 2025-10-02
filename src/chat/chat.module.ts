import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { GeminiModule } from 'src/gemini/gemini.module';
import { DynamoModule } from 'src/dynamo/dynamo.module';

@Module({
  imports: [GeminiModule, DynamoModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports:[ChatService]
})
export class ChatModule {}