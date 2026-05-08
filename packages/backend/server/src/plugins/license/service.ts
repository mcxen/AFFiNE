import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaClient } from '@prisma/client';

import { EventBus, OnEvent } from '../../base';
import { WorkspacePolicyService } from '../../core/permission';
import { Models } from '../../models';
import {
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionVariant,
} from '../payment/types';

const LOCAL_LICENSE_QUANTITY = 100000;
const LOCAL_LICENSE_EXPIRES_AT = new Date('2099-12-31T23:59:59.999Z');

@Injectable()
export class LicenseService {
  constructor(
    private readonly db: PrismaClient,
    private readonly event: EventBus,
    private readonly models: Models,
    private readonly policy: WorkspacePolicyService
  ) {}

  @OnEvent('workspace.subscription.activated')
  async onWorkspaceSubscriptionUpdated({
    workspaceId,
    plan,
    recurring,
    quantity,
  }: Events['workspace.subscription.activated']) {
    if (plan !== SubscriptionPlan.SelfHostedTeam) {
      return;
    }

    await this.models.workspaceFeature.add(
      workspaceId,
      'team_plan_v1',
      `${recurring} team subscription activated`,
      {
        memberLimit: quantity,
      }
    );
    this.event.emit('workspace.members.allocateSeats', {
      workspaceId,
      quantity,
    });
    await this.policy.reconcileWorkspaceQuotaState(workspaceId);
  }

  @OnEvent('workspace.subscription.canceled')
  async onWorkspaceSubscriptionCanceled({
    workspaceId,
    plan,
  }: Events['workspace.subscription.canceled']) {
    if (plan !== SubscriptionPlan.SelfHostedTeam) {
      return;
    }

    await this.ensureTeamLicense(workspaceId);
  }

  async getLicense(workspaceId: string) {
    return this.ensureTeamLicense(workspaceId);
  }

  async installLicense(workspaceId: string, license: Buffer) {
    void license;
    return this.ensureTeamLicense(workspaceId);
  }

  async activateTeamLicense(workspaceId: string, licenseKey: string) {
    void licenseKey;
    return this.ensureTeamLicense(workspaceId);
  }

  async removeTeamLicense(workspaceId: string) {
    await this.ensureTeamLicense(workspaceId);
    return true;
  }

  async deactivateTeamLicense() {
    return;
  }

  async updateTeamRecurring(key: string, recurring: SubscriptionRecurring) {
    void key;
    void recurring;
  }

  async createCustomerPortal(
    workspaceId: string
  ): Promise<{ url: string; res: null }> {
    await this.ensureTeamLicense(workspaceId);
    return { url: 'about:blank', res: null };
  }

  @OnEvent('workspace.members.updated')
  async updateTeamSeats(payload: Events['workspace.members.updated']) {
    const license = await this.ensureTeamLicense(payload.workspaceId);
    this.event.emit('workspace.members.allocateSeats', {
      workspaceId: payload.workspaceId,
      quantity: license.quantity,
    });
  }

  @Cron(CronExpression.EVERY_10_MINUTES, { disabled: !env.selfhosted })
  async licensesHealthCheck() {
    return;
  }

  private async ensureTeamLicense(
    workspaceId: string,
    quantity = LOCAL_LICENSE_QUANTITY
  ) {
    const installed = await this.db.installedLicense.upsert({
      where: {
        workspaceId,
      },
      update: {
        validatedAt: new Date(),
        expiredAt: LOCAL_LICENSE_EXPIRES_AT,
        recurring: SubscriptionRecurring.Lifetime,
        quantity,
        variant: SubscriptionVariant.Onetime,
      },
      create: {
        key: `local-unlimited-${workspaceId}`,
        workspaceId,
        expiredAt: LOCAL_LICENSE_EXPIRES_AT,
        validateKey: '',
        validatedAt: new Date(),
        recurring: SubscriptionRecurring.Lifetime,
        quantity,
        variant: SubscriptionVariant.Onetime,
      },
    });

    await this.event.emitAsync('workspace.subscription.activated', {
      workspaceId,
      plan: SubscriptionPlan.SelfHostedTeam,
      recurring: SubscriptionRecurring.Lifetime,
      quantity,
    });

    return installed;
  }
}
