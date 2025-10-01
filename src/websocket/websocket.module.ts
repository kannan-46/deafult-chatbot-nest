import { Module } from '@nestjs/common';
import { WebSocketService } from './websocket.service';
import { DynamoModule } from 'src/dynamo/dynamo.module';

@Module({
  providers: [WebSocketService],
  exports: [WebSocketService],
  imports:[DynamoModule]
})
export class WebSocketModule {}