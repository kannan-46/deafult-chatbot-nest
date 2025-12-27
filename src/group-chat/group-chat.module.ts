import { forwardRef, Module } from '@nestjs/common';
import { GroupChatService } from './group-chat.service';
import { DynamoModule } from '../dynamo/dynamo.module';
import { WebSocketModule } from '../websocket/websocket.module';

@Module({
  providers: [GroupChatService],
  imports: [DynamoModule, forwardRef(() => WebSocketModule)],
  exports: [GroupChatService]
})
export class GroupChatModule { }
