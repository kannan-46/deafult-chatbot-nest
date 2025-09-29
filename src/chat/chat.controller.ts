// src/chat/chat.controller.ts
import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  Get,
  Param,
  Logger,
  Res,
  Put,
  Delete
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ChatService } from './chat.service';
import { DynamoService } from 'src/dynamo/dynamo.service';

interface AuthenticatedRequest extends Request {
  auth: { userId: string };
}

class ChatPromptDto {
  prompt: string;
  model: string;
  webSearch: boolean;
  temperature: number;
  chatId:string
  systemInstruction:string
}

class createChatDto{
  title:string
}

@Controller('chat')
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly dynamoDbService: DynamoService,
  ) {}


  // MESSAGE OPERATIONS
  @Post('stream')
  async chatStream(
    @Req() request: AuthenticatedRequest,
    @Body() chatPromptDto: ChatPromptDto,
    @Res() response: Response,
  ): Promise<void> {
    const userId = request.auth.userId;
    
    this.logger.log(`Chat request from user ${userId}: webSearch=${chatPromptDto.webSearch}, model=${chatPromptDto.model}, temp=${chatPromptDto.temperature}`);
    
    // Set SSE headers manually
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Headers', 'Cache-Control, Authorization, Content-Type');

    try {
      const stream = this.chatService.generateStreamWithHistory(
        chatPromptDto.prompt,
        userId,
        chatPromptDto.chatId,
        chatPromptDto.model,
        chatPromptDto.webSearch,
        chatPromptDto.temperature,
        chatPromptDto.systemInstruction
      );

      let chunkCount = 0;
      for await (const chunk of stream) {
        if (chunk) {
          chunkCount++;
          response.write(`data: ${chunk}\n\n`);
        }
      }

      this.logger.log(`Stream completed for user ${userId}: ${chunkCount} chunks sent`);
      response.write('data: [DONE]\n\n');
      response.end();
    } catch (error) {
      this.logger.error('Streaming error:', error);
      response.write(`data: Error: ${error.message}\n\n`);
      response.write('data: [DONE]\n\n');
      response.end();
    }
  }

@Get(':chatId/history')
  async getChatHistory(
    @Req() request: AuthenticatedRequest,
    @Param('chatId') chatId: string,
  ) {
    const userId = request.auth.userId;
    const messages = await this.dynamoDbService.getChatMessage(userId, chatId);
    
    this.logger.log(`Retrieved ${messages.length} messages for chat ${chatId}`);
    return { messages };
  }

  //CHAT MANAGEMENT
  @Post('create')
  async createChat(
    @Req() request:AuthenticatedRequest,
    @Body() dto:createChatDto
  ){
    const userId=request.auth.userId
    console.log(`creating new chat for user`);
    
    const chat=await this.chatService.createNewChat(
      userId,
      dto.title
    )
    return {success:true,chat}
  }

  @Get('list')
  async getUserChats(
    @Req()request:AuthenticatedRequest
  ){
    const userId=request.auth.userId
    const chats=await this.dynamoDbService.getUserChats(userId)
    console.log(`retrieved ${chats.length} for user: ${userId}`);
    return {chats}
  }

  @Get(':chatId')
  async getChat(
    @Req() request: AuthenticatedRequest,
    @Param('chatId') chatId: string,
  ) {
    const userId = request.auth.userId;
    const chat = await this.dynamoDbService.getChat(userId, chatId);
    
    if (!chat) {
      return { error: 'Chat not found' };
    }
    
    return { chat };
  }

  @Put(':chatId/title')
  async updateChatTitle(
    @Req() request: AuthenticatedRequest,
    @Param('chatId') chatId: string,
    @Body() { title }: { title: string },
  ) {
    const userId = request.auth.userId;
    await this.dynamoDbService.updateChatTitle(userId, chatId, title);
    
    return { success: true, message: 'Chat title updated' };
  }

  @Delete(':chatId')
  async deleteChat(
    @Req() request: AuthenticatedRequest,
    @Param('chatId') chatId: string,
  ) {
    const userId = request.auth.userId;
    await this.dynamoDbService.deleteChat(userId, chatId);
    
    return { success: true, message: 'Chat deleted' };
  }  
}
