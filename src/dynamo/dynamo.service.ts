// src/dynamo/dynamo.service.ts
import { Injectable } from '@nestjs/common';
import { DynamoDBClient, DynamoDBClientConfig } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
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
  private readonly CONNECTIONS = 'CONNECTIONS';
  constructor() {
    if (!process.env.CONNECTIONS_TABLE_NAME) {
      throw new Error('Missing DYNAMODB_TABLE environment variable');
    }
    this.messageTableName = process.env.CONNECTIONS_TABLE_NAME;

    const clientConfig: DynamoDBClientConfig = {
      region: process.env.AWS_REGION || 'ap-south-1',
    };
    const client = new DynamoDBClient(clientConfig);
    this.client = DynamoDBDocumentClient.from(client);
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
        TableName: this.messageTableName,
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
        TableName: this.messageTableName,
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

  //connections
  async saveConnection(
    connectionId: string,
    user: { id: string; name: string; avatar: string },
  ): Promise<void> {
    const command = new PutCommand({
      TableName: this.messageTableName,
      Item: {
        PK: this.CONNECTIONS,
        SK: `CONN#${connectionId}`,
        GSI1PK: `USER#${user.id}`,
        GSI1SK: `CONN#${connectionId}`,
        connectionId: connectionId,
        userId: user.id,
        name: user.name,
        avatar: user.avatar,
        createdAt: new Date().toISOString(),
      },
    });
    await this.client.send(command);
  }

  async deleteConnection(connectionId: string): Promise<void> {
    const command = new DeleteCommand({
      TableName: this.messageTableName,
      Key: {
        PK: this.CONNECTIONS,
        SK: `CONN#${connectionId}`,
      },
    });
    await this.client.send(command);
  }

  async addUserToGroup(userId: string, groupId: string): Promise<void> {
    const command = new PutCommand({
      TableName: this.messageTableName,
      Item: {
        PK: `GROUP#${groupId}`,
        SK: `USER#${userId}`,
        userId,
        joinedAt: new Date().toISOString(),
      },
    });
    await this.client.send(command);
  }

  async getUsersInGroup(groupId: string): Promise<{ userId: string }[]> {
    const command = new QueryCommand({
      TableName: this.messageTableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `GROUP#${groupId}`,
        ':sk': `USER#`,
      },
    });
    const result = await this.client.send(command);
    return (result.Items as { userId: string }[]) || [];
  }

  async saveGroupMessage(
    groupId: string,
    fromUserId: string,
    message: string,
    replyTo?: string,
    timestamp?: string,
  ): Promise<void> {
    const now = timestamp || new Date().toISOString();
    const item: any = {
      PK: `GROUP#${groupId}`,
      SK: `MSG#${now}`,
      fromUserId,
      message,
      reactions: {},
    };
    if (replyTo) {
      item.replyTo = replyTo;
    }
    const command = new PutCommand({
      TableName: this.messageTableName,
      Item: item,
    });
    await this.client.send(command);
  }

  async findConnectionForUsers(
    userIds: string[],
  ): Promise<{ connectionId: string }[]> {
    if (userIds.length === 0) {
      return [];
    }

    const queries = userIds.map((userId) => {
      const command = new QueryCommand({
        TableName: this.messageTableName,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
        },
      });
      return this.client.send(command);
    });

    const results = await Promise.all(queries);
    return results.flatMap(
      (result) => (result.Items as { connectionId: string }[]) || [],
    );
  }

  async getConnections(
    connectionId: string,
  ): Promise<{ connectionId: string; userId: string } | null> {
    const res = await this.client.send(
      new GetCommand({
        TableName: this.messageTableName,
        Key: {
          PK: this.CONNECTIONS,
          SK: `CONN#${connectionId}`,
        },
      }),
    );
    return res.Item as { connectionId: string; userId: string } | null;
  }

  async getAllConnections(): Promise<{ connectionId: string; userId: string; name: string; avatar: string }[]> {
    const command = new QueryCommand({
      TableName: this.messageTableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': this.CONNECTIONS,
        ':sk': 'CONN#',
      },
    });
    const res = await this.client.send(command);
    return (
      (res.Items as {
        connectionId: string;
        userId: string;
        name: string;
        avatar: string;
      }[]) || []
    );
  }
  //reactions
  async toggleReaction(
    groupId: string,
    messageTimestamp: string,
    userId: string,
    reaction: string,
  ): Promise<any> {
    const messageSK = `MSG#${messageTimestamp}`;
    const tableKey = { PK: `GROUP#${groupId}`, SK: messageSK };

    // New log statement
    console.log(`[DynamoService] Toggling reaction for message:`, tableKey);

    try {
      // Step 1: Get the current message
      const getCommand = new GetCommand({
        TableName: this.messageTableName,
        Key: tableKey,
      });
      const { Item } = await this.client.send(getCommand);

      if (!Item) {
        console.error(
          `[DynamoService] ERROR: Message not found with SK: ${messageSK}`,
        );
        throw new Error('Message not found');
      }

      // New log statement
      console.log(
        `[DynamoService] Found item. Current reactions:`,
        JSON.stringify(Item.reactions || {}),
      );

      // Step 2: Modify the reactions map
      const reactions = Item.reactions || {};
      const usersForReaction = reactions[reaction] || [];
      const userIndex = usersForReaction.indexOf(userId);

      if (userIndex > -1) {
        usersForReaction.splice(userIndex, 1); // Remove user
      } else {
        usersForReaction.push(userId); // Add user
      }

      if (usersForReaction.length === 0) {
        delete reactions[reaction];
      } else {
        reactions[reaction] = usersForReaction;
      }

      // New log statement
      console.log(
        `[DynamoService] Updating item with new reactions:`,
        JSON.stringify(reactions),
      );

      // Step 3: Update the item in DynamoDB
      const updateCommand = new UpdateCommand({
        TableName: this.messageTableName,
        Key: tableKey,
        UpdateExpression: 'SET reactions = :reactions',
        ExpressionAttributeValues: { ':reactions': reactions },
        ReturnValues: 'ALL_NEW',
      });

      const result = await this.client.send(updateCommand);
      console.log(`[DynamoService] Successfully updated reactions.`);
      return result.Attributes;
    } catch (error) {
      // This will catch any error (like permissions) and log it clearly
      console.error(`[DynamoService] FATAL ERROR in toggleReaction:`, error);
      throw error; // Stop execution and report the error
    }
  }
  //pinning
  async getPinnedMessage(groupId: string): Promise<any> {
    console.log('getting pinned message');
    try {
      const res = await this.client.send(
        new GetCommand({
          TableName: this.messageTableName,
          Key: {
            PK: `GROUP#${groupId}`,
            SK: 'PINNED_MESSAGE',
          },
        }),
      );
      return res.Item;
    } catch (error) {
      console.error('error in getting pinned message', error);
    }
  }

  async pinMessage(groupId: string, message: any): Promise<void> {
    console.log('pinning message');

    try {
      await this.client.send(
        new PutCommand({
          TableName: this.messageTableName,
          Item: {
            PK: `GROUP#${groupId}`,
            SK: 'PINNED_MESSAGE',
            pinnedMessage: message,
            pinnedAt: new Date().toISOString(),
          },
        }),
      );
    } catch (error) {
      console.error('error in pin message', error);
    }
  }

  async unpinMessage(groupId: string): Promise<void> {
    console.log('unpinning message');

    try {
      const res = await this.client.send(
        new DeleteCommand({
          TableName: this.messageTableName,
          Key: {
            PK: `GROUP#${groupId}`,
            SK: 'PINNED_MESSAGE',
          },
        }),
      );
    } catch (error) {
      console.error('error in unpinning message');
    }
  }

  //read receipts

  async updateLastRead(
    userId: string,
    groupId: string,
    messageTimestamp: string,
  ) {
    await this.client.send(
      new PutCommand({
        TableName: this.messageTableName,
        Item: {
          PK: `GROUP#${groupId}`,
          SK: `READSTATE#${userId}`,
          lastRead: messageTimestamp,
        },
      }),
    );
  }

  async seenBy(groupId: string, messageTimestamp: string) {
    const res = await this.client.send(
      new QueryCommand({
        TableName: this.messageTableName,
        KeyConditionExpression: 'PK = :pk and begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `GROUP#${groupId}`,
          ':sk': 'READSTATE#',
        },
      }),
    );
    return res.Items?.filter((i) => i.lastRead >= messageTimestamp).map((i) =>
      i.SK.split('#')[1]
    ).filter(Boolean) as string[]||[]
  }
}
