import { Injectable } from '@nestjs/common';
import {
  GoogleGenerativeAI,
  Content,
  Tool,
  GoogleSearchRetrieval,
} from '@google/generative-ai';
import { GoogleGenAI, GeneratedImage } from '@google/genai';
import { DynamoService } from '../dynamo/dynamo.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

@Injectable()
export class GeminiService {
  private readonly genAi: GoogleGenerativeAI;
  private readonly imgAi: GoogleGenAI;

  constructor(
    private readonly client: DynamoService,
    private readonly cloudinary: CloudinaryService,
  ) {
    const apiKey = process.env.GEMINI_API;
    if (!apiKey) {
      console.error('FATAL: GEMINI_API environment variable is missing.');
      // We don't throw here to allow NestJS to finish initialization so we can see other errors,
      // but the service will fail when used.
    }
    this.genAi = new GoogleGenerativeAI(apiKey || 'MISSING_API_KEY');
    this.imgAi = new GoogleGenAI({ apiKey: apiKey || 'MISSING_API_KEY' });
  }

  async *generateTextStream(
    prompt: string,
    history: Content[],
    modelName: string,
    temperature: number,
    userId: string,
    webSearch: boolean,
    systemInstructionOverride?: string,
  ): AsyncGenerator<string> {
    try {
      let finalSystemInstruction = '';
      if (systemInstructionOverride) {
        finalSystemInstruction = systemInstructionOverride;
      } else {
        const userProfile = await this.client.getUserProfile(userId);
        finalSystemInstruction = userProfile?.botPersonality
          ? userProfile.botPersonality
          : `You are a friendly and helpful AI assistant named "Kannan's AI".`;

        if (userProfile) {
          const nameLine = userProfile.name ? `- The user's name is "${userProfile.name}".` : '';
          const aboutLine = userProfile.about ? `- About the user: "${userProfile.about}".` : '';
          finalSystemInstruction += `\n\n### User Context\n${nameLine}\n${aboutLine}`;
        }
      }

      const tools: Tool[] = webSearch
        ? [{ googleSearchRetrieval: {} as GoogleSearchRetrieval }]
        : [];

      const model = this.genAi.getGenerativeModel({
        model: 'gemini-2.5-pro',
        generationConfig: { temperature },
        tools,
        systemInstruction: finalSystemInstruction, // Use the final chosen instruction
      });

      const chat = model.startChat({ history });
      const result = await chat.sendMessageStream(prompt);

      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
          yield text;
        }
      }
    } catch (error) {
      console.error('An error occurred in generateTextStream:', error);
      yield 'Sorry, something went wrong while processing your request. Please try again.';
    }
  }

  async generateAndUpload(prompt: string, userId: string): Promise<string> {
    console.log(`Generating image for prompt: ${prompt}`);
    const response = await this.imgAi.models.generateImages({
      model: 'imagen-4.0-ultra-generate-001',
      prompt,
    });

    const imgs = response.generatedImages;
    if (!imgs?.length) {
      throw new Error('no images returned from imagen api');
    }
    const first = imgs[0];
    let base64Data: string;
    if ('uri' in first && typeof first.uri === 'string') {
      throw new Error('URI response not implemented - expected base64');
    } else if (first.image && typeof first.image.imageBytes === 'string') {
      base64Data = first.image.imageBytes;
    } else {
      throw new Error('Imagen response missing image data');
    }
    const cloudinaryUrl = await this.cloudinary.uploadBase64Image(base64Data, userId);
    console.log(`image uploaded to s3: ${cloudinaryUrl}`);

    return cloudinaryUrl;
  }
}