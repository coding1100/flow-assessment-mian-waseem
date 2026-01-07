import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ORG_ROLES_KEY } from '../decorators/org-roles.decorator';

@Injectable()
export class OrgRolesGuard extends JwtAuthGuard implements CanActivate {
  constructor(reflector: Reflector) {
    super(reflector);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // First check JWT authentication
    const isAuthenticated = await super.canActivate(context);
    if (!isAuthenticated) {
      return false;
    }

    const requiredOrgRoles = this.reflector.getAllAndOverride<string[]>(ORG_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredOrgRoles || requiredOrgRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not found in request');
    }

    // Super admins bypass org role checks
    if (user.isSuperAdmin) {
      return true;
    }

    // Check if user has orgId
    if (!user.orgId) {
      throw new ForbiddenException('User does not belong to an organization');
    }

    const userOrgRoles = user.orgRoles || [];
    const hasOrgRole = requiredOrgRoles.some((role) => userOrgRoles.includes(role));

    if (!hasOrgRole) {
      throw new ForbiddenException(
        `User does not have required organization role. Required: ${requiredOrgRoles.join(', ')}, User has: ${userOrgRoles.join(', ') || 'none'}`,
      );
    }

    return true;
  }
}

