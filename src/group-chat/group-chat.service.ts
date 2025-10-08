// src/group-chat/group-chat.service.ts
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { DynamoService } from 'src/dynamo/dynamo.service';
import { WebSocketService } from 'src/websocket/websocket.service';

@Injectable()
export class GroupChatService {
  constructor(
    private readonly dynamo: DynamoService,
    @Inject(forwardRef(() => WebSocketService))
    private readonly ws: WebSocketService,
  ) {}
  private async broadcastToGroup(
    fromUserId: string,
    groupId: string,
    payload: any,
  ): Promise<void> {
    const users = await this.dynamo.getUsersInGroup(groupId);
    const recipientUserIds = users
      .map((u) => u.userId)
      .filter((id) => id !== fromUserId);

    if (recipientUserIds.length > 0) {
      const connections =
        await this.dynamo.findConnectionForUsers(recipientUserIds);

      if (connections.length > 0) {
        const connectionIds = connections.map((c) => c.connectionId);
        await this.ws.broadcastToConnections(connectionIds, payload);
      }
    }
  }

  async handleStartTyping(fromUserId: string, groupId: string): Promise<void> {
    console.log(
      `[GroupChatService] User ${fromUserId} started typing in group ${groupId}`,
    );
    const payload = {
      type: 'startTyping',
      groupId,
      userId: fromUserId,
    };
    await this.broadcastToGroup(fromUserId, groupId, payload);
  }

  async handleStopTyping(fromUserId: string, groupId: string): Promise<void> {
    console.log(
      `[GroupChatService] User ${fromUserId} stopped typing in group ${groupId}`,
    );
    const payload = {
      type: 'stopTyping',
      groupId,
      userId: fromUserId,
    };
    await this.broadcastToGroup(fromUserId, groupId, payload);
  }

  async handleJoinGroup(userId: string, groupId: string): Promise<void> {
    await this.dynamo.addUserToGroup(userId, groupId);
    console.log(`[GroupChatService] User ${userId} joined group ${groupId}`);
  }

  async handleSendGroupMessage(
    fromUserId: string,
    groupId: string,
    message: string,
  ): Promise<void> {
    console.log(
      `[GroupChatService] User ${fromUserId} sending message to group ${groupId}`,
    );
    await this.dynamo.saveGroupMessage(groupId, fromUserId, message);
    console.log(`[GroupChatService] message saved to DB`);
    const payload = {
      type: 'groupMessage',
      groupId,
      fromUserId,
      message,
      timestamp: new Date().toISOString(),
    };
    await this.broadcastToGroup(fromUserId, groupId, payload);
  }
}
