import { randomUUID } from 'node:crypto';

import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { Public } from '../../../core/auth';
import { SubscriptionPlan, SubscriptionRecurring } from '../types';

const LOCAL_LICENSE_QUANTITY = 100000;
const LOCAL_LICENSE_END_AT = new Date('2099-12-31T23:59:59.999Z').getTime();

@Public()
@Controller('/api/team/licenses')
export class LicenseController {
  @Post('/:license/activate')
  async activate(@Res() res: Response, @Param('license') key: string) {
    void key;
    this.respondWithLocalLicense(res);
  }

  @Post('/:license/deactivate')
  async deactivate(@Param('license') key: string) {
    void key;
    return {
      success: true,
    };
  }

  @Get('/:license/health')
  async health(
    @Res() res: Response,
    @Param('license') key: string,
    @Headers('x-validate-key') revalidateKey: string
  ) {
    void key;
    void revalidateKey;
    this.respondWithLocalLicense(res);
  }

  @Post('/:license/seats')
  async updateSeats(@Param('license') key: string, @Body() body: unknown) {
    void key;
    void body;
  }

  @Post('/:license/recurring')
  async updateRecurring(@Param('license') key: string, @Body() body: unknown) {
    void key;
    void body;
  }

  @Post('/:license/create-customer-portal')
  async createCustomerPortal(@Param('license') key: string) {
    void key;
    return { url: 'about:blank' };
  }

  private respondWithLocalLicense(res: Response) {
    res
      .status(HttpStatus.OK)
      .header('x-next-validate-key', randomUUID())
      .json(this.license());
  }

  private license() {
    return {
      plan: SubscriptionPlan.SelfHostedTeam,
      recurring: SubscriptionRecurring.Lifetime,
      quantity: LOCAL_LICENSE_QUANTITY,
      endAt: LOCAL_LICENSE_END_AT,
    };
  }
}
