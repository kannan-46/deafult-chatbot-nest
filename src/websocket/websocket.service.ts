import { Injectable } from '@nestjs/common';
import { DynamoService } from 'src/dynamo/dynamo.service'; // Use the central DynamoService
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { ChatService } from 'src/chat/chat.service';

@Injectable()
export class WebSocketService {
  private readonly apiGatewayClient: ApiGatewayManagementApiClient;

  // Inject the DynamoService instead of creating a new client
  constructor(private readonly dynamoService: DynamoService,private readonly chat:ChatService) {
    this.apiGatewayClient = new ApiGatewayManagementApiClient({
      endpoint: process.env.WEBSOCKET_API_ENDPOINT,
    });
  }

  private async sendJson(connectionId:string,payload:any){
    const data=Buffer.from(JSON.stringify(payload))
    await this.apiGatewayClient.send(new PostToConnectionCommand({ConnectionId:connectionId,Data:data}))
  }

  // Use the injected service to handle database operations
  async handleConnect(connectionId: string,userId:string): Promise<void> {
    await this.dynamoService.saveConnection(connectionId,userId);
  }

  async handleDisconnect(connectionId: string): Promise<void> {
    await this.dynamoService.deleteConnection(connectionId);
  }

async handleMessage(connectionId:string,body:any){
  try {
    const action=body?.action
    switch(action){
      case 'startChat':{
        const userId=body.userId ?? 'user 123'
        const chat:any=body.chatId ? await this.dynamoService.getChat(userId,body.chatId)
        : await this.dynamoService.createChat(userId,body.title||'new chat')
          const messages = await this.dynamoService.getChatMessage(userId, chat.chatId);
          await this.sendJson(connectionId, { type: 'chatStarted', chatId: chat.chatId, messages });
          return;
      }

      case 'sendMessage':{
          const userId = body.userId ?? 'user123'; 
          const chatId = body.chatId;
          const model = body.model || 'gemini-2.5-pro';
          const temperature = body.temperature ?? 0.7;
          const webSearch = !!body.webSearch;
          const systemInstruction = body.systemInstruction;

          const messageId=`${new Date().toISOString()}`
          await this.sendJson(connectionId,{type:'streamStart',messageId})

          let fullText=''
          for await(const chunk of this.chat.generateStreamWithHistory(
            body.message,
            userId,
            chatId,
            model,
            webSearch,
            temperature,
            systemInstruction
          )){
            fullText += chunk ??''
            await this.sendJson(connectionId,{type:'streamChunk',messageId,fullText})
          }

          await this.sendJson(connectionId,{
            type:'streamEnd',
            messageId,
            finalMessage:{
              id:messageId,
              role:'model',
              content:fullText,
              timeStamp:new Date().toISOString()
            }
          })
          return
      }
      default:{
           await this.sendJson(connectionId, { type: 'error', message: `Unknown action: ${action}` });
          return;
      }
    }
  } catch (error) {
     if (error?.$metadata?.httpStatusCode === 410) {
        await this.handleDisconnect(connectionId);
      } else {
        await this.sendJson(connectionId, { type: 'error', message: 'Internal error' });
      }
  }
}
}