import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Observable } from 'rxjs';

// This guard is for local development only.
// It mocks a logged-in user by attaching a default auth object to the request.
@Injectable()
export class DevAuthGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    // Attach a mock auth object for local testing
    request.auth = { userId: 'user_dev_123' }; 
    return true;
  }
}