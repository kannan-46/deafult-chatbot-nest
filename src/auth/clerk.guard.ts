// src/auth/clerk.guard.ts

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { clerkClient } from '@clerk/clerk-sdk-node';

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const sessionToken = request.headers.authorization?.split('Bearer ')[1];

    if (!sessionToken) {
      throw new UnauthorizedException('Authorization token is missing.');
    }

    try {
      const claims = await clerkClient.verifyToken(sessionToken);
      if (!claims) {
        throw new UnauthorizedException('Invalid token.');
      }
      request.auth = { userId: claims.sub };
      return true; 
    } catch (error) {
      console.error('Clerk token verification failed:', error);
      throw new UnauthorizedException('Invalid token.');
    }
  }
}