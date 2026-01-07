import { SetMetadata } from '@nestjs/common';

export const ORG_ROLES_KEY = 'orgRoles';
export const OrgRoles = (...orgRoles: string[]) => SetMetadata(ORG_ROLES_KEY, orgRoles);

