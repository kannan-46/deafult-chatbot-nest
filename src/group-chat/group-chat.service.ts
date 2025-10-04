import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { privateDecrypt } from 'crypto';
import { from } from 'rxjs';
import { DynamoService } from 'src/dynamo/dynamo.service';
import { WebSocketService } from 'src/websocket/websocket.service';

@Injectable()
export class GroupChatService {
  constructor(
    private readonly dynamo: DynamoService,
    @Inject(forwardRef(() => WebSocketService))
    private readonly ws: WebSocketService,
  ) {}
  //user joins a group
  async handleJoinGroup(userId: string, groupId: string): Promise<void> {
    await this.dynamo.addUserToGroup(userId, groupId);
    console.log(`[GroupChatService] User ${userId} joined group ${groupId}`);
  }
  //send group message
  async handleSendGroupMessage(
    fromUserId: string,
    groupId: string,
    message: string,
  ): Promise<void> {
    console.log(
      `[GroupChatService] User ${fromUserId} sending message to group ${groupId}`,
    );
    //save message to group's history in DB
    await this.dynamo.saveMessageGroup(groupId, fromUserId, message);
    console.log(`[GroupChatService] message saved to DB`);

    //get users in group
    const users = await this.dynamo.getUsersInGroup(groupId);
    console.log(
      `[GroupChatService] Found ${users.length} users in group:`,
      JSON.stringify(users),
    );
    // 3. Filter out the sender to get recipient user IDs
    const recipientUserIds = users
      .map((u) => u.userId)
      .filter((id) => id !== fromUserId);
    console.log(
      `[GroupChatService] Recipient user IDs:`,
      JSON.stringify(recipientUserIds),
    );

    if (recipientUserIds.length === 0) {
      console.log(
        '[GroupChatService] No other users in the group to send the message to. Aborting broadcast.',
      );
      return;
    }
    //find all active connections
    const connections =
      await this.dynamo.findConnectionForUsers(recipientUserIds);
    if (connections.length === 0) {
      console.log('No other active users in the group to send the message to.');
      return;
    }

    //create message payload to broadcast
    const payload = {
      type: 'groupMessage',
      groupId,
      fromUserId,
      message,
      timestamp: new Date().toISOString(),
    };

    const connectionIds = connections.map((c) => c.connectionId);
    await this.ws.broadcastToConnections(connectionIds, payload);
  }
}
