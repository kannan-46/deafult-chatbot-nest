// src/lambda.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WebSocketService } from './websocket/websocket.service';
import { INestApplicationContext } from '@nestjs/common';

let app: INestApplicationContext;

async function bootstrap() {
  if (!app) {
    app = await NestFactory.createApplicationContext(AppModule);
  }
  return app;
}

export const handler = async (event: any) => {
  const nestApp = await bootstrap();
  const webSocketService = nestApp.get(WebSocketService);

  const connectionId = event.requestContext.connectionId;
  const routeKey = event.requestContext.routeKey;

  try {
    switch (routeKey) {
      case '$connect': {
        let user = { id: 'anonymous', name: 'anonymous', avatar: '' };
        if (event.queryStringParameters?.userInfo) {
          try {
            user = JSON.parse(
              decodeURIComponent(event.queryStringParameters.userInfo),
            );
          } catch (error) {
            console.error('failed to parse user info on connect', error);
          }
        }
        await webSocketService.handleConnect(connectionId, user);
        return { statusCode: 200 };
      }
      case '$disconnect': {
        await webSocketService.handleDisconnect(connectionId);
        console.log(
          `[Lambda] $disconnect event for connectionId: ${connectionId}`,
        );
        return { statusCode: 200 };
      }
      default: {
        const body =
          typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
        await webSocketService.handleMessage(connectionId, body);
        return { statusCode: 200 };
      }
    }
  } catch (err) {
    console.error('Error in Lambda handler:', err);
    return { statusCode: 500 };
  }
};
