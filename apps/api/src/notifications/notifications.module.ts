import { Global, Module } from '@nestjs/common';
import { LineMessageTemplateService } from '../line/messaging/line-message-template.service';
import { LineMessagingService } from '../line/messaging/line-messaging.service';
import { LineWebhookController } from '../line/webhook/line-webhook.controller';
import { LineWebhookService } from '../line/webhook/line-webhook.service';
import { NotificationEventsService } from './notification-events.service';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationQueueService } from './notification-queue.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Global()
@Module({
  controllers: [NotificationsController, LineWebhookController],
  providers: [
    LineMessagingService,
    LineMessageTemplateService,
    LineWebhookService,
    NotificationPreferencesService,
    NotificationQueueService,
    NotificationsService,
    NotificationEventsService,
  ],
  exports: [
    LineMessagingService,
    LineMessageTemplateService,
    LineWebhookService,
    NotificationPreferencesService,
    NotificationQueueService,
    NotificationsService,
    NotificationEventsService,
  ],
})
export class NotificationsModule {}

