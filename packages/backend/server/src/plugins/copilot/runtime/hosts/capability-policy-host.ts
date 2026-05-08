import { Injectable } from '@nestjs/common';

import type { ChatSession } from '../../session';
import { type ToolsConfig } from '../../types';
import { getTools } from '../../utils';
import {
  ModelSelectionPolicy,
  type ResolveModelInput,
} from '../model-selection-policy';

export type ChatSelectionOptions = {
  responseMode: 'text' | 'object' | 'image';
  modelId?: string;
  reasoning?: boolean;
  webSearch?: boolean;
  toolsConfig?: ToolsConfig;
  byokLeaseId?: string;
  billingUnitId?: string;
  featureKind?: 'chat' | 'action' | 'image';
  quotaBackedRoutesAllowed?: boolean;
};

type ResolvePolicyModelInput = ResolveModelInput & {
  proModels?: string[] | null;
  userId?: string;
};

@Injectable()
export class CapabilityPolicyHost {
  constructor(private readonly modelSelection: ModelSelectionPolicy) {}

  private async resolveModel(input: ResolvePolicyModelInput) {
    const resolved = this.modelSelection.resolveRequestedModel(input);
    return resolved.selectedModel;
  }

  async selectChat(session: ChatSession, options: ChatSelectionOptions) {
    const model = await this.resolveChatModel({
      userId: session.config.userId,
      defaultModel: session.model,
      optionalModels: session.optionalModels,
      proModels: session.config.promptConfig?.proModels,
      requestedModelId: options.modelId,
    });
    const tools = getTools(
      session.config.promptConfig?.tools,
      options.toolsConfig
    );
    return {
      model,
      providerOptions: {
        ...session.config.promptConfig,
        user: session.config.userId,
        session: session.config.sessionId,
        workspace: session.config.workspaceId,
        byokLeaseId: options.byokLeaseId,
        billingUnitId: options.billingUnitId,
        featureKind: options.featureKind ?? 'chat',
        quotaBackedRoutesAllowed: options.quotaBackedRoutesAllowed,
        reasoning: options.reasoning,
        webSearch: options.webSearch,
        tools,
      },
    };
  }

  async resolveChatModel(input: ResolvePolicyModelInput) {
    return await this.resolveModel(input);
  }

  async resolvePromptModel(input: ResolveModelInput) {
    return this.modelSelection.resolveRequestedModel(input).selectedModel;
  }

  async resolveFixedTaskModel(input: ResolveModelInput) {
    return this.modelSelection.resolveRequestedModel(input).selectedModel;
  }
}
