// src/group-chat/group-chat.service.ts
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { timestamp } from 'rxjs';
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
    // get users in group
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

  async handleJoinGroup(
    userId: string,
    groupId: string,
    connectionId: string,
  ): Promise<void> {
    await this.dynamo.addUserToGroup(userId, groupId);
    console.log(`[GroupChatService] User ${userId} joined group ${groupId}`);

    const pinnedMessage = await this.dynamo.getPinnedMessage(groupId);
    if (pinnedMessage) {
      const payload = {
        type: 'messagePinned',
        pinnedMessage,
      };
      await this.ws.sendJson(connectionId, payload);
    }
  }

  async handleSendGroupMessage(
    fromUserId: string,
    groupId: string,
    message: string,
  ): Promise<void> {
    console.log(
      `[GroupChatService] User ${fromUserId} sending message to group ${groupId}`,
    );
    const messageTimestamp = new Date().toISOString();
    await this.dynamo.saveGroupMessage(
      groupId,
      fromUserId,
      message,
      undefined,
      messageTimestamp,
    );
    console.log(`[GroupChatService] message saved to DB`);
    const payload = {
      type: 'groupMessage',
      groupId,
      fromUserId,
      message,
      timestamp: messageTimestamp,
      reactions: {},
    };
    await this.broadcastToGroup('null', groupId, payload);
  }

  async handleReplyToGroup(
    fromUserId: string,
    groupId: string,
    message: string,
    replyTo: string,
  ): Promise<void> {
    console.log(
      `[GroupChatService] User ${fromUserId} replying to message ${replyTo} in group ${groupId}`,
    );
    const messageTimestamp = new Date().toISOString();
    await this.dynamo.saveGroupMessage(groupId, fromUserId, message, replyTo);
    const payload = {
      type: 'groupMessage',
      groupId,
      fromUserId,
      message,
      replyTo,
      timestamp: messageTimestamp,
      reactions: {},
    };
    await this.broadcastToGroup('null', groupId, payload);
  }

  async handleReactToMessage(
    fromUserId: string,
    groupId: string,
    messageTimestamp: string,
    reaction: string,
  ): Promise<void> {
    console.log(
      `[GroupChatService] User ${fromUserId} reacting to message ${messageTimestamp} with ${reaction}`,
    );

    const updateMessage = await this.dynamo.toggleReaction(
      groupId,
      messageTimestamp,
      fromUserId,
      reaction,
    );
    const payload = {
      type: 'messageReactionUpdate',
      groupId,
      messageTimestamp,
      reactions: updateMessage.reactions,
    };
    await this.broadcastToGroup('null', groupId, payload);
  }

  async handlePinMessage(groupId: string, message: any): Promise<any> {
    await this.dynamo.pinMessage(groupId, message);
    const payload = {
      type: 'messagePinned',
      pinnedMessage: message,
    };
    await this.broadcastToGroup('null', groupId, payload);
  }

  async handleUnPinMessage(groupId: string): Promise<void> {
    await this.dynamo.unpinMessage(groupId);
    const payload = {
      type: 'messageUnPinned',
    };
    await this.broadcastToGroup('null', groupId, payload);
  }
}
