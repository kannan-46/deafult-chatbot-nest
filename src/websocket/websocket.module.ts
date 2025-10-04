import { forwardRef, Module } from '@nestjs/common';
import { WebSocketService } from './websocket.service';
import { DynamoModule } from 'src/dynamo/dynamo.module';
import { ChatModule } from 'src/chat/chat.module';
import { GroupChatModule } from 'src/group-chat/group-chat.module';

@Module({
  providers: [WebSocketService],
  exports: [WebSocketService],
  imports:[DynamoModule,ChatModule,forwardRef(()=>GroupChatModule)]
})
export class WebSocketModule {}