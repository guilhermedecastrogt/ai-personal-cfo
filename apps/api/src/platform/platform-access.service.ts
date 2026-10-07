import { Injectable } from '@nestjs/common';
import type { RequestContext } from '../households/request-context.js';
import { PlatformAdminsRepository, type PlatformAdmin } from './platform-admins.repository.js';

@Injectable()
export class PlatformAccessService {
  constructor(private readonly admins: PlatformAdminsRepository) {}

  isPlatformAdmin(context: RequestContext): Promise<boolean> {
    return this.admins.isAdmin(context.householdId, context.memberId);
  }

  listAdmins(): Promise<PlatformAdmin[]> {
    return this.admins.list();
  }
}
