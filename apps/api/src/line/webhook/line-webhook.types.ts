/**
 * โครงสร้างข้อมูลระบุแหล่งที่มาของอีเวนต์ Webhook จาก LINE (ผู้ใช้, กลุ่ม, ห้องสนทนา)
 */
export interface LineWebhookSource {
  type: 'user' | 'group' | 'room';
  userId?: string;
  groupId?: string;
  roomId?: string;
}

/**
 * โครงสร้างข้อมูลอีเวนต์ (Event Payload) ที่ LINE Messaging API ส่งมาให้ Webhook
 */
export interface LineWebhookEventPayload {
  // ประเภทอีเวนต์ เช่น follow (เพิ่มเพื่อน), unfollow (บล็อก), message (ส่งข้อความ), postback (กดปุ่ม)
  type: 'follow' | 'unfollow' | 'message' | 'postback' | 'accountLink' | string;
  webhookEventId?: string;
  timestamp?: number;
  source?: LineWebhookSource;
  replyToken?: string;
  mode?: 'active' | 'standby';
  deliveryContext?: {
    isRedelivery?: boolean;
  };
  // รายละเอียดกรณีเป็นข้อความ (Message Event)
  message?: {
    id: string;
    type: string;
    text?: string;
  };
  // รายละเอียดกรณีเป็นการกดปุ่ม Postback (Postback Event)
  postback?: {
    data: string;
    params?: Record<string, any>;
  };
}

/**
 * โครงสร้าง HTTP Request Body ของ LINE Webhook
 */
export interface LineWebhookRequestBody {
  destination?: string;
  events?: LineWebhookEventPayload[];
}
