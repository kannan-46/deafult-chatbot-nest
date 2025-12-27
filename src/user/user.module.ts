import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { DynamoModule } from '../dynamo/dynamo.module';
import { GeminiModule } from 'src/gemini/gemini.module';

@Module({
  controllers: [UserController],
  imports: [DynamoModule, GeminiModule],

})
export class UserModule { }
