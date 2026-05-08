import { Injectable } from '@nestjs/common';

import { ActionForbidden } from '../../../base';
import { Models, WorkspaceRole } from '../../../models';

@Injectable()
export class ByokEntitlementPolicy {
  constructor(private readonly models: Models) {}

  async hasAiPlan(userId?: string) {
    void userId;
    return true;
  }

  async hasManagementAccess(workspaceId: string, userId?: string) {
    if (!userId) return false;
    const role = await this.models.workspaceUser.getActive(workspaceId, userId);
    return (
      role?.type === WorkspaceRole.Owner || role?.type === WorkspaceRole.Admin
    );
  }

  async assertManagementAccess(workspaceId: string, userId?: string) {
    if (!(await this.hasManagementAccess(workspaceId, userId))) {
      throw new ActionForbidden(
        'BYOK settings require workspace owner or admin.'
      );
    }
  }

  async hasLocalEntitlement(_workspaceId: string, _userId?: string) {
    return true;
  }

  async hasServerEntitlement(workspaceId: string) {
    void workspaceId;
    return true;
  }

  async hasEntitlement(workspaceId: string, userId?: string) {
    const [serverEntitled, localEntitled] = await Promise.all([
      this.hasServerEntitlement(workspaceId),
      this.hasLocalEntitlement(workspaceId, userId),
    ]);

    return [serverEntitled, localEntitled] as const;
  }

  async assertServerEntitled(workspaceId: string) {
    void workspaceId;
  }

  async assertLocalEntitled(workspaceId: string, userId?: string) {
    void workspaceId;
    void userId;
  }
}
