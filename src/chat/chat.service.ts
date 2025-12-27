import { Injectable } from '@nestjs/common';
import { Content } from '@google/generative-ai';
import { DynamoService } from '../dynamo/dynamo.service';
import { GeminiService } from '../gemini/gemini.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly client: DynamoService,
    private readonly gemini: GeminiService,
  ) { }

  async createNewChat(userId: string, title?: string) {
    const chat = await this.client.createChat(userId, title || 'New Chat');
    console.log(`Created chat ${chat.chatId}`);
    return chat;
  }

  async *generateStreamWithHistory(
    prompt: string,
    userId: string,
    chatId: string,
    model: string,
    webSearch = false,
    temperature = 0.7,
    systemInstruction?: string,
  ): AsyncGenerator<string> {
    try {
      const chatMessages = await this.client.getChatMessage(userId, chatId);
      console.log(
        `Retrieved ${chatMessages.length} messages for chatId: ${chatId}`,
      );

      const isFirstMessage = chatMessages.length === 0;

      const history: Content[] = chatMessages.slice(-20).map((item) => ({
        role: item.role as 'user' | 'model',
        parts: [{ text: item.content }],
      }));

      await this.client.saveChatMessage(userId, chatId, 'user', prompt);
      console.log(`Saved user message to database`);

      const stream = this.gemini.generateTextStream(
        prompt,
        history,
        model,
        temperature,
        userId,
        webSearch,
        systemInstruction,
      );

      let fullResponse = '';
      for await (const chunk of stream) {
        fullResponse += chunk;
        yield chunk;
      }

      if (fullResponse.trim()) {
        await this.client.saveChatMessage(
          userId,
          chatId,
          'model',
          fullResponse.trim(),
        );
        console.log(`Saved assistant response to database`);

        if (isFirstMessage) {
          await this.autoGenerateChatTitle(
            userId,
            chatId,
            prompt,
            systemInstruction,
          );
        }
      }
    } catch (error) {
      console.error('Stream generation error:', error);
      yield `Error: ${error.message}`;
    }
  }

  private async autoGenerateChatTitle(
    userId: string,
    chatId: string,
    firstMessage: string,
    personaOrSystem?: string,
  ) {
    try {
      const history = await this.client.getChatMessage(userId, chatId);
      const firstAssisstant =
        history.find((m) => m.role === 'model')?.content || '';
      const prompt = `
You are generating a very short chat title (3–5 words, no quotes or emojis). 
Use the bot persona if provided and the first user + assistant messages to infer topic. 
If the user only greeted (e.g., "hi", "hello"), produce a persona-flavored greeting title like:
- "Astro Greeting" for an astrologer persona
- "Coder Hello" for a developer persona
- Otherwise "Chat Greeting".

Persona (optional):
${personaOrSystem || '(none)'}

First user message:
"${firstMessage}"

First assistant reply:
"${firstAssisstant}"

Return only the title text, 3–5 words, Title Case, no punctuation, no quotes, no emojis.
`.trim();
      const titleStream = this.gemini.generateTextStream(
        prompt,
        [],
        'gemini-2.5-pro',
        0.3,
        userId,
        false,
      );

      let generatedTitle = '';
      for await (const chunk of titleStream) {
        generatedTitle += chunk;
      }

      const cleanTitle = generatedTitle
        .trim()
        .replace(/['"*]/g, '')
        .substring(0, 50);

      if (cleanTitle) {
        await this.client.updateChatTitle(userId, chatId, cleanTitle);
        console.log(`Auto-generated title for chat ${chatId}: ${cleanTitle}`);
      }
    } catch (error) {
      console.error('Failed to generate chat title:', error);
    }
  }
}
