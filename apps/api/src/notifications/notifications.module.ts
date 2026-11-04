import { Global, Module } from '@nestjs/common';
import { LineAdminController } from '../admin/line-admin.controller';
import { LineMessageTemplateService } from '../line/messaging/line-message-template.service';
import { LineMessagingService } from '../line/messaging/line-messaging.service';
import { LineRichMenuService } from '../line/rich-menu/line-rich-menu.service';
import { LineWebhookController } from '../line/webhook/line-webhook.controller';
import { LineWebhookService } from '../line/webhook/line-webhook.service';
import { NotificationEventsService } from './notification-events.service';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationQueueService } from './notification-queue.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Global()
@Module({
  controllers: [NotificationsController, LineWebhookController, LineAdminController],
  providers: [
    LineMessagingService,
    LineMessageTemplateService,
    LineRichMenuService,
    LineWebhookService,
    NotificationPreferencesService,
    NotificationQueueService,
    NotificationsService,
    NotificationEventsService,
  ],
  exports: [
    LineMessagingService,
    LineMessageTemplateService,
    LineRichMenuService,
    LineWebhookService,
    NotificationPreferencesService,
    NotificationQueueService,
    NotificationsService,
    NotificationEventsService,
  ],
})
export class NotificationsModule {}

