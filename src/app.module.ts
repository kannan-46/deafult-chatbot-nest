import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatModule } from './chat/chat.module';
import { GeminiModule } from './gemini/gemini.module';
import { DynamoModule } from './dynamo/dynamo.module';
// import { WikiModule } from './wiki/wiki.module';
import { UserModule } from './user/user.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { GptsModule } from './gpts/gpts.module';
import { WebSocketModule } from './websocket/websocket.module'
import { GroupChatModule } from './group-chat/group-chat.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ChatModule,
    GeminiModule,
    DynamoModule,
    UserModule,
    CloudinaryModule,
    GptsModule,
    WebSocketModule,
    GroupChatModule
  ],
  providers: [CloudinaryModule],
})
export class AppModule {}