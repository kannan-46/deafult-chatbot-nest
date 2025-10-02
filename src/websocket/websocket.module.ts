import { Module } from '@nestjs/common';
import { WebSocketService } from './websocket.service';
import { DynamoModule } from 'src/dynamo/dynamo.module';
import { ChatModule } from 'src/chat/chat.module';

@Module({
  providers: [WebSocketService],
  exports: [WebSocketService],
  imports:[DynamoModule,ChatModule]
})
export class WebSocketModule {}