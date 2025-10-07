import { Injectable } from '@nestjs/common';
import { DynamoService } from 'src/dynamo/dynamo.service'; // Use the central DynamoService
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import { ChatService } from 'src/chat/chat.service';
import { GroupChatService } from 'src/group-chat/group-chat.service';

@Injectable()
export class WebSocketService {
  private readonly apiGatewayClient: ApiGatewayManagementApiClient;

  constructor(
    private readonly dynamoService: DynamoService,
    private readonly chat: ChatService,
    private readonly groupChat: GroupChatService,
  ) {
    this.apiGatewayClient = new ApiGatewayManagementApiClient({
      endpoint: process.env.WEBSOCKET_API_ENDPOINT,
    });
  }

  private async sendJson(connectionId: string, payload: any) {
    const data = Buffer.from(JSON.stringify(payload));
    await this.apiGatewayClient.send(
      new PostToConnectionCommand({ ConnectionId: connectionId, Data: data }),
    );
  }

  async broadcastToConnections(
    connectionIds: string[],
    payload: any,
  ): Promise<void> {
    const data = Buffer.from(JSON.stringify(payload));
    const postCalls = connectionIds.map((id) =>
      this.apiGatewayClient
        .send(new PostToConnectionCommand({ ConnectionId: id, Data: data }))
        .catch((err) => {
          if (err.statusCode === 410) {
            console.log(`Found stale connection, deleting: ${id}`);
            return this.dynamoService.deleteConnection(id);
          }
        }),
    );
    await Promise.allSettled(postCalls);
  }

  async handleConnect(connectionId: string, userId: string): Promise<void> {
    await this.dynamoService.saveConnection(connectionId, userId);
    console.log(`User connected: ${userId} with connectionId: ${connectionId}`);

    const allOtherConnections = (await this.dynamoService.getAllConnections())
        .filter(c => c.connectionId !== connectionId);

    const newUserPayload = {
      type: 'userJoined',
      user: { id: userId, name: userId },
    };
    
    if (allOtherConnections.length > 0) {
        const recipientConnectionIds = allOtherConnections.map(c => c.connectionId);
        await this.broadcastToConnections(recipientConnectionIds, newUserPayload);
    }
  }

  async handleDisconnect(connectionId: string): Promise<void> {
    const connection = await this.dynamoService.getConnections(connectionId);
    await this.dynamoService.deleteConnection(connectionId);
    if (connection) {
      const payload = {
        type: 'userLeft',
        userId: connection.userId,
      };
      const allRemainingConnections =
        await this.dynamoService.getAllConnections();
      const connectionIds = allRemainingConnections.map((c) => c.connectionId);
      await this.broadcastToConnections(connectionIds, payload);
    }
  }

  async handleMessage(connectionId: string, body: any) {
    try {
      const action = body?.action;
      switch (action) {
        case 'startChat': {
          const userId = body.userId ?? 'user 123';
          const chat: any = body.chatId
            ? await this.dynamoService.getChat(userId, body.chatId)
            : await this.dynamoService.createChat(
                userId,
                body.title || 'new chat',
              );
          const messages = await this.dynamoService.getChatMessage(
            userId,
            chat.chatId,
          );
          await this.sendJson(connectionId, {
            type: 'chatStarted',
            chatId: chat.chatId,
            messages,
          });
          return;
        }

        case 'sendMessage': {
          const userId = body.userId ?? 'user123';
          const chatId = body.chatId ?? 'chat 1';
          const model = body.model || 'gemini-2.5-pro';
          const temperature = body.temperature ?? 0.7;
          const webSearch = !!body.webSearch;
          const systemInstruction = body.systemInstruction;

          const messageId = `${new Date().toISOString()}`;
          await this.sendJson(connectionId, { type: 'streamStart', messageId });

          let fullText = '';
          for await (const chunk of this.chat.generateStreamWithHistory(
            body.message,
            userId,
            chatId,
            model,
            webSearch,
            temperature,
            systemInstruction,
          )) {
            fullText += chunk ?? '';
            await this.sendJson(connectionId, {
              type: 'streamChunk',
              messageId,
              fullText,
            });
          }

          await this.sendJson(connectionId, {
            type: 'streamEnd',
            messageId,
            finalMessage: {
              id: messageId,
              role: 'model',
              content: fullText,
              timeStamp: new Date().toISOString(),
            },
          });
          return;
        }

        case 'joinGroup': {
          const { userId, groupId } = body;
          if (userId && groupId) {
            await this.groupChat.handleJoinGroup(userId, groupId);
          }
          return;
        }

        case 'sendGroupMessage': {
          const { userId, groupId, message } = body;
          if (userId && groupId && message) {
            await this.groupChat.handleSendGroupMessage(
              userId,
              groupId,
              message,
            );
          }
          return;
        }

        case 'startTyping': {
          const { userId, groupId } = body;
          if (userId && groupId) {
            await this.groupChat.handleStartTyping(userId, groupId);
          }
          return;
        }

        case 'stopTyping': {
          const { userId, groupId } = body;
          if (userId && groupId) {
            await this.groupChat.handleStopTyping(userId, groupId);
          }
          return;
        }

            case 'requestPresenceState': {
            const allConnections = await this.dynamoService.getAllConnections();
            const userListPayload = {
                type: 'presenceState',
                users: allConnections.map(c => ({ id: c.userId, name: c.userId })),
            };
            await this.sendJson(connectionId, userListPayload);
            return;
        }
        default: {
          await this.sendJson(connectionId, {
            type: 'error',
            message: `Unknown action: ${action}`,
          });
          return;
        }
      }
    } catch (error) {
      if (error?.$metadata?.httpStatusCode === 410) {
        await this.handleDisconnect(connectionId);
      } else {
        await this.sendJson(connectionId, {
          type: 'error',
          message: 'Internal error',
        });
      }
    }
  }
}
