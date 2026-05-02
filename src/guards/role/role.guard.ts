import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from './role.enums';
import { ROLES_KEYS } from './role.decorators';

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // 1. Get the required roles for the route
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEYS, [
      context.getHandler(), 
      context.getClass(),
    ]);

    // 2. If roles are strictly required, do not allow access (Private route)
    if (!requiredRoles || requiredRoles.length === 0) {
      return false;
    }

    // 3. Get the request object
    const request = context.switchToHttp().getRequest();
    
    // 4. Get the user object (This is attached by your JwtAuthGuard)
    const user = request.user;

    // 5. If there is no user, it means JwtAuthGuard wasn't used or failed
    if (!user) {
      throw new UnauthorizedException('User is not authenticated');
    }

    // 6. Check if the user's role from the JWT matches the required roles
    const hasRole = requiredRoles.includes(user.role);

    // 7. Throw a clean error if they don't match
    if (!hasRole) {
      throw new ForbiddenException(`Access denied for role: ${user.role}`);
    }

    return true;
  }
}