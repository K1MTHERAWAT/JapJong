import { Injectable } from '@nestjs/common';
import {
  NotificationCategory,
  NotificationChannel,
  UserNotificationPreference,
} from '@jongwen/shared';
import { DbService } from '../db/db.service';

@Injectable()
export class NotificationPreferencesService {
  constructor(private readonly db: DbService) {}

  async getPreferences(userId: string): Promise<UserNotificationPreference[]> {
    return this.db.getUserNotificationPreferences(userId);
  }

  async updatePreferences(
    userId: string,
    items: {
      channel: NotificationChannel;
      notificationType: NotificationCategory;
      isEnabled: boolean;
    }[],
  ): Promise<UserNotificationPreference[]> {
    return this.db.upsertUserNotificationPreferences(userId, items);
  }

  async isChannelEnabled(
    userId: string,
    channel: NotificationChannel,
    notificationType: NotificationCategory | string,
  ): Promise<boolean> {
    return this.db.isChannelEnabled(userId, channel, notificationType);
  }
}

