import { registerEnumType } from '@nestjs/graphql';

export enum SubscriptionRecurring {
  Monthly = 'monthly',
  Yearly = 'yearly',
  Lifetime = 'lifetime',
}

export enum SubscriptionPlan {
  Free = 'free',
  Pro = 'pro',
  AI = 'ai',
  Team = 'team',
  SelfHostedTeam = 'selfhostedteam',
}

export enum SubscriptionVariant {
  Onetime = 'onetime',
}

registerEnumType(SubscriptionRecurring, { name: 'SubscriptionRecurring' });
registerEnumType(SubscriptionVariant, { name: 'SubscriptionVariant' });
registerEnumType(SubscriptionPlan, { name: 'SubscriptionPlan' });

declare global {
  interface Events {
    'workspace.subscription.activated': {
      workspaceId: string;
      plan: SubscriptionPlan;
      recurring: SubscriptionRecurring;
      quantity: number;
    };
    'workspace.subscription.canceled': {
      workspaceId: string;
      plan: SubscriptionPlan;
      recurring: SubscriptionRecurring;
    };
  }
}
