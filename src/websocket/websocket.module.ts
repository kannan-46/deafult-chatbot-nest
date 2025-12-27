import { forwardRef, Module } from '@nestjs/common';
import { WebSocketService } from './websocket.service';
import { DynamoModule } from '../dynamo/dynamo.module';
import { ChatModule } from '../chat/chat.module';
import { GroupChatModule } from '../group-chat/group-chat.module';

@Module({
  providers: [WebSocketService],
  exports: [WebSocketService],
  imports: [DynamoModule, ChatModule, forwardRef(() => GroupChatModule)]
})
export class WebSocketModule { }