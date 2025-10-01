import { Injectable } from '@nestjs/common';
import { DynamoService } from 'src/dynamo/dynamo.service'; // Use the central DynamoService
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';

@Injectable()
export class WebSocketService {
  private readonly apiGatewayClient: ApiGatewayManagementApiClient;

  // Inject the DynamoService instead of creating a new client
  constructor(private readonly dynamoService: DynamoService) {
    this.apiGatewayClient = new ApiGatewayManagementApiClient({
      endpoint: process.env.WEBSOCKET_API_ENDPOINT,
    });
  }

  // Use the injected service to handle database operations
  async handleConnect(connectionId: string): Promise<void> {
    await this.dynamoService.saveConnection(connectionId);
  }

  async handleDisconnect(connectionId: string): Promise<void> {
    await this.dynamoService.deleteConnection(connectionId);
  }

  async handleMessage(connectionId: string, message: string): Promise<void> {
    // For now, just echo the message back
    const response = `Echo from server: ${message}`;
    const command = new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: response,
    });
    
    try {
        await this.apiGatewayClient.send(command);
    } catch (error) {
        // If the connection is gone, remove it from the DB
        if (error.$metadata?.httpStatusCode === 410) {
            await this.handleDisconnect(connectionId);
        } else {
            console.error('Failed to send message:', error);
        }
    }
  }
}