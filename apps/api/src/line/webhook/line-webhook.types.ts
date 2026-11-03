export interface LineWebhookSource {
  type: 'user' | 'group' | 'room';
  userId?: string;
  groupId?: string;
  roomId?: string;
}

export interface LineWebhookEventPayload {
  type: 'follow' | 'unfollow' | 'message' | 'postback' | 'accountLink' | string;
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
  postback?: {
    data: string;
    params?: Record<string, any>;
  };
}

export interface LineWebhookRequestBody {
  destination?: string;
  events?: LineWebhookEventPayload[];
}

