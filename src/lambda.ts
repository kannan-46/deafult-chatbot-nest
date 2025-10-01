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
      case '$connect':
        await webSocketService.handleConnect(connectionId);
        break;
      case '$disconnect':
        await webSocketService.handleDisconnect(connectionId);
        break;
      case '$default':
        await webSocketService.handleMessage(connectionId, event.body);
        break;
    }
    return { statusCode: 200 };
  } catch (err) {
    console.error(err);
    return { statusCode: 500 };
  }
};