// src/user/user.controller.ts

import { Body, Controller, Param, Put, Get, Post, UseGuards, Req } from '@nestjs/common'; 
import  { DynamoService,type userProfile} from 'src/dynamo/dynamo.service'; 
// import { GeminiService } from 'src/gemini/gemini.service';
import type { Request } from 'express';

interface AuthenticatedRequest extends Request {
  auth: { userId: string };
}

@Controller('users') 
export class UserController {
  constructor(
    private readonly dynamoService: DynamoService,
    // private readonly geminiService: GeminiService, 
  ) {}

  @Get(':userId/profile')
  async getUserProfile(@Req() request: AuthenticatedRequest) {
    const userId = request.auth.userId;
    const profile = await this.dynamoService.getUserProfile(userId);
    return profile || {};
  }

  @Put(':userId/profile')
  async saveUserProfile(
    @Req() request: AuthenticatedRequest,
    @Body() userProfile: userProfile, // Use the UserProfile interface
  ) {
    const userId = request.auth.userId;
    await this.dynamoService.saveUserProfile(userId, userProfile);
    return { success: true, message: 'Profile saved' };
  }

  // @Post(':userId/generate-image')
  // async generateImage(
  //   @Param('userId') userId: string,
  //   @Body() body: { prompt: string }
  // ) {
  //   try {
  //     const s3ImageUrl = await this.geminiService.generateAndUpload(body.prompt, userId);
  //     return { imageUrl: s3ImageUrl };
  //   } catch (error) {
  //     console.error('Image generation failed:', error);
  //     return {imageUrl:'👤'}
  //     throw new Error('Image generation failed');
  //   }
  // }
}