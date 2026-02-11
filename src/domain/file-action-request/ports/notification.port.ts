export interface FileActionRequestNotificationPort {
  /** 승인자에게 새 요청 알림 */
  notifyNewRequest(params: {
    requestId: string;
    requesterId: string;
    approverId: string;
    actionType: string;
    fileName: string;
  }): Promise<void>;

  /** 요청자에게 승인/반려 결과 알림 */
  notifyDecision(params: {
    requestId: string;
    requesterId: string;
    actionType: string;
    decision: string;
    comment?: string;
  }): Promise<void>;

  /** 승인 대기 리마인더 */
  notifyReminder(params: {
    requestId: string;
    approverId: string;
    actionType: string;
    fileName: string;
    pendingSince: Date;
  }): Promise<void>;
}

export const FILE_ACTION_REQUEST_NOTIFICATION_PORT = Symbol('FILE_ACTION_REQUEST_NOTIFICATION_PORT');
