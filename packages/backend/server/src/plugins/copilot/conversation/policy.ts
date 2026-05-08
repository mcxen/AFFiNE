import { Injectable } from '@nestjs/common';

import { CopilotQuotaExceeded } from '../../../base';
import type { Turn } from '../core';
import type { ResolvedPrompt } from '../prompt';

@Injectable()
export class ConversationPolicy {
  constructor(...args: unknown[]) {
    void args;
  }

  async getQuota(userId: string) {
    void userId;

    return { limit: undefined, used: 0 };
  }

  async checkQuota(userId: string) {
    if (!(await this.hasQuota(userId))) {
      throw new CopilotQuotaExceeded();
    }
  }

  async hasQuota(userId: string) {
    void userId;
    return true;
  }

  shouldScheduleTitle(prompt: Pick<ResolvedPrompt, 'action'>) {
    return !prompt.action;
  }

  shouldGenerateTitle(input: { title: string | null; turns: Turn[] }) {
    if (input.title || !input.turns.length) {
      return false;
    }

    let hasUser = false;
    let hasAssistant = false;
    for (const turn of input.turns) {
      if (turn.role === 'user') {
        hasUser = true;
      } else if (turn.role === 'assistant') {
        hasAssistant = true;
      }
      if (hasUser && hasAssistant) {
        return true;
      }
    }

    return false;
  }

  buildTitlePromptContent(turns: Turn[]) {
    return turns.map(turn => `[${turn.role}]: ${turn.content}`).join('\n');
  }
}
