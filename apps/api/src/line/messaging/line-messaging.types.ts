import { NotificationCategory, NotificationReferenceType } from '@japjong/shared';

export interface LineTextMessage {
  type: 'text';
  text: string;
}

export interface LineFlexMessage {
  type: 'flex';
  altText: string;
  contents: Record<string, unknown>;
}

export type LineMessageObject = LineTextMessage | LineFlexMessage;

export interface LinePushResult {
  ok: boolean;
  providerMessageId?: string;
  statusCode?: number;
  errorCode?: string;
  errorMessage?: string;
  retryable: boolean;
  mock?: boolean;
}

export interface LineApiResult<T = unknown> extends LinePushResult {
  data?: T;
}

export interface LineRichMenuArea {
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  action: {
    type: 'uri' | 'message' | 'postback';
    label?: string;
    uri?: string;
    text?: string;
    data?: string;
    displayText?: string;
  };
}

export interface LineRichMenuObject {
  size: {
    width: number;
    height: number;
  };
  selected: boolean;
  name: string;
  chatBarText: string;
  areas: LineRichMenuArea[];
}

export type NotificationEventKey =
  // Booking — Citizen
  | 'BOOKING_SUBMITTED'
  | 'BOOKING_IN_REVIEW'
  | 'BOOKING_NEED_MORE_INFO'
  | 'BOOKING_APPROVED'
  | 'BOOKING_REJECTED'
  | 'BOOKING_REMINDER'
  // Booking — Staff & Approver
  | 'STAFF_NEW_BOOKING'
  | 'STAFF_BOOKING_RESCHEDULED'
  // Borrow — Citizen
  | 'BORROW_SUBMITTED'
  | 'BORROW_IN_REVIEW'
  | 'BORROW_APPROVED'
  | 'BORROW_REJECTED'
  | 'BORROW_PICKUP_REMINDER'
  | 'BORROW_RETURN_REMINDER'
  | 'BORROW_OVERDUE'
  | 'BORROW_RETURNED'
  // Borrow — Staff
  | 'STAFF_NEW_BORROW'
  | 'STAFF_BORROW_RETURN_REQUESTED'
  | 'STAFF_BORROW_OVERDUE'
  // Repair / Maintenance — Citizen
  | 'REPAIR_SUBMITTED'
  | 'REPAIR_ACCEPTED'
  | 'REPAIR_IN_PROGRESS'
  | 'REPAIR_NEED_MORE_INFO'
  | 'REPAIR_APPROVED'
  | 'REPAIR_REJECTED'
  | 'REPAIR_FINISHED'
  | 'REPAIR_DONE'
  // Repair — Staff
  | 'STAFF_NEW_REPAIR'
  | 'STAFF_REPAIR_REOPENED'
  | 'STAFF_REPAIR_CONFIRMED'
  // Document Signing — Citizen & Staff/Approver
  | 'SIGNING_PENDING'
  | 'SIGNING_COMPLETED'
  | 'SIGNING_FULLY_APPROVED'
  | 'STAFF_SIGNING_REQUIRED'
  | 'STAFF_SIGNING_RETURNED'
  // System / Test
  | 'TEST_NOTIFICATION';

export interface NotificationTemplateInput {
  event: NotificationEventKey;
  recipientRole: 'CITIZEN' | 'STAFF';
  requestCode?: string;
  requestId?: string;
  requesterName?: string;
  venueName?: string;
  equipmentSummary?: string;
  location?: string;
  dateText?: string;
  statusLabel?: string;
  reason?: string;
  linkPath?: string;
  useFlex?: boolean;
}

export interface BuiltNotificationContent {
  category: NotificationCategory;
  referenceType: NotificationReferenceType;
  referenceId: string | null;
  inAppTitle: string;
  inAppMessage: string;
  link: string;
  lineMessages: LineMessageObject[];
}

