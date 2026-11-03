export interface LineWebhookSource {
  type: 'user' | 'group' | 'room';
  userId?: string;
  groupId?: string;
  roomId?: string;
}

export interface LineWebhookEventPayload {
  type: 'follow' | 'unfollow' | 'message' | 'accountLink' | string;
  webhookEventId?: string;
  timestamp?: number;
  source?: LineWebhookSource;
  replyToken?: string;
  mode?: 'active' | 'standby';
  deliveryContext?: {
    isRedelivery?: boolean;
  };
  message?: {
    id: string;
    type: string;
    text?: string;
  };
}

export interface LineWebhookRequestBody {
  destination?: string;
  events?: LineWebhookEventPayload[];
}

