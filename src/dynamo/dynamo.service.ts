// src/dynamo/dynamo.service.ts
import { Injectable } from '@nestjs/common';
import { DynamoDBClient,DynamoDBClientConfig } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { v4 as uuid } from 'uuid';

export interface userProfile {
  name?: string;
  about?: string;
  botPersonality?: string;
  botImage?: string;
}

export interface Chat {
  chatId: string;
  title: string;
  createdAt: string;
  lastMessageAt: string;
  messageCount: number;
  itemType?: 'CHAT';
}

export interface chatMessage {
  chatId: string;
  role: 'user' | 'model';
  content: string;
  timeStamp: string;
  itemType?: 'MSG';
}

export interface Gpt {
  gptId: string;
  creatorId: string;
  name: string;
  description: string;
  avatarUrl: string;
  persona: string;
  createdAt: string;
  isPublic: boolean;
}
@Injectable()
export class DynamoService {
  private readonly client: DynamoDBDocumentClient;
 private readonly messageTableName: string;
constructor() {
   if (!process.env.CONNECTIONS_TABLE_NAME) {
      throw new Error("Missing DYNAMODB_TABLE environment variable");
    }
    this.messageTableName = process.env.CONNECTIONS_TABLE_NAME;

  const clientConfig: DynamoDBClientConfig = {
    region: process.env.AWS_REGION || 'ap-south-1',

  };
  const client = new DynamoDBClient(clientConfig);
  this.client = DynamoDBDocumentClient.from(client);
}

  async saveConnection(connectionId: string): Promise<void> {
    const command = new PutCommand({
      TableName: this.messageTableName,
      Item: {
        PK: `CONN#${connectionId}`,
        SK: `CONN#${connectionId}`,
        connectionId: connectionId,
        createdAt: new Date().toISOString(),
      },
    });
    await this.client.send(command);
  }

  async deleteConnection(connectionId: string): Promise<void> {
    const command = new DeleteCommand({
      TableName: this.messageTableName,
      Key: {
        PK: `CONN#${connectionId}`,
        SK: `CONN#${connectionId}`,
      },
    });
    await this.client.send(command);
  }
  // CHAT

  async createChat(userId: string, title: string | 'New Chat'): Promise<Chat> {
    const chatId = uuid();
    const now = new Date().toISOString();

    const chat: Chat = {
      chatId,
      title,
      createdAt: now,
      lastMessageAt: now,
      messageCount: 0,
      itemType: 'CHAT',
    };

    await this.client.send(
      new PutCommand({
        TableName:this.messageTableName,
        Item: {
          PK: userId,
          SK: `CHAT#${chatId}`,
          ...chat,
        },
      }),
    );

    return chat;
  }

  async getUserChats(userId: string): Promise<Chat[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.messageTableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': userId,
          ':sk': 'CHAT#',
          ':chat': 'CHAT',
        },
        ExpressionAttributeNames: {
          '#type': 'itemType',
        },
        FilterExpression: '#type = :chat',
      }),
    );

    const chats = (result.Items || []) as Chat[];

    return chats.sort(
      (a, b) =>
        new Date(b.lastMessageAt).getTime() -
        new Date(a.lastMessageAt).getTime(),
    );
  }

  async getChat(userId: string, chatId: string): Promise<Chat | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.messageTableName,
        Key: {
          PK: userId,
          SK: `CHAT#${chatId}`,
        },
      }),
    );
    return (result.Item as Chat) || null;
  }

  async updateChatTitle(userId: string, chatId: string, newTitle: string) {
    await this.client.send(
      new UpdateCommand({
        TableName: this.messageTableName,
        Key: {
          PK: userId,
          SK: `CHAT#${chatId}`,
        },
        UpdateExpression: 'SET title = :title, lastMessageAt = :now',
        ExpressionAttributeValues: {
          ':title': newTitle,
          ':now': new Date().toISOString(),
        },
      }),
    );
  }

  async deleteChat(userId: string, chatId: string) {
    await this.client.send(
      new DeleteCommand({
        TableName: this.messageTableName,
        Key: {
          PK: userId,
          SK: `CHAT#${chatId}`,
        },
      }),
    );
  }

  //GPTS
  async createGpt(
    creatorId: string,
    name: string,
    description: string,
    avatarUrl: string,
    persona: string,
    isPublic: boolean,
  ): Promise<Gpt> {
    const gptId = uuid();
    const now = new Date().toISOString();

    const gpt: Gpt = {
      gptId,
      creatorId,
      name,
      description,
      avatarUrl,
      persona,
      isPublic,
      createdAt: now,
    };

    const itemToPut: any = {
      PK: `USER#${creatorId}`,
      SK: `GPT#${gptId}`,
      ...gpt,
    };

    if (isPublic) {
      itemToPut.GSI1PK = 'PUBLIC_GPTS';
      itemToPut.GSI1SK = now;
    }

    await this.client.send(
      new PutCommand({
        TableName: this.messageTableName,
        Item: itemToPut,
      }),
    );
    return gpt;
  }

  async getUserGpts(userId: string): Promise<Gpt[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.messageTableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':sk': `GPT#`,
        },
      }),
    );
    return (result.Items as Gpt[]) || [];
  }

  async getGpt(userId: string, gptId: string): Promise<Gpt | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.messageTableName,
        Key: {
          PK: `USER#${userId}`,
          SK: `GPT#${gptId}`,
        },
      }),
    );
    return (result.Item as Gpt) || null;
  }

  async getPublicGpts(): Promise<Gpt[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.messageTableName,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: {
          ':pk': 'PUBLIC_GPTS',
        },
      }),
    );
    return (result.Items as Gpt[]) || [];
  }

  //MESSAGES
  async saveChatMessage(
    userId: string,
    chatId: string,
    role: 'user' | 'model',
    content: string,
  ) {
    const now = new Date().toISOString();
    const message: chatMessage = {
      chatId,
      role,
      content,
      timeStamp: now,
      itemType: 'MSG',
    };

    await this.client.send(
      new PutCommand({
        TableName: this.messageTableName,
        Item: {
          PK: userId,
          SK: `CHAT#${chatId}#MSG#${now}`,
          ...message,
        },
      }),
    );

    await this.client.send(
      new UpdateCommand({
        TableName:this.messageTableName,
        Key: {
          PK: userId,
          SK: `CHAT#${chatId}`,
        },
        UpdateExpression: 'SET lastMessageAt = :now ADD messageCount :inc',
        ExpressionAttributeValues: {
          ':now': now,
          ':inc': 1,
        },
      }),
    );
  }

  async getChatMessage(userId: string, chatId: string) {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.messageTableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': userId,
          ':sk': `CHAT#${chatId}#MSG#`,
        },
      }),
    );

    const messages = (result.Items || []) as chatMessage[];
    return messages.sort(
      (a, b) =>
        new Date(a.timeStamp).getTime() - new Date(b.timeStamp).getTime(),
    );
  }

  async saveUserProfile(userId: string, profile: userProfile): Promise<void> {
    const command = new PutCommand({
      TableName: this.messageTableName,
      Item: {
        PK: userId,
        SK: '#PROFILE',
        name: profile.name,
        about: profile.about,
        botPersonality: profile.botPersonality,
        botImage: profile.botImage,
        updatedAt: new Date().toISOString(),
      },
    });
    await this.client.send(command);
    console.log('profile saved');
  }

  async getUserProfile(userId: string): Promise<userProfile | null> {
    const command = new GetCommand({
      TableName: this.messageTableName,
      Key: {
        PK: userId,
        SK: '#PROFILE',
      },
    });
    const res = await this.client.send(command);
    return res.Item as userProfile | null;
  }
}
