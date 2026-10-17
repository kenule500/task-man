import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/components/ds';
import { notificationHref } from '../lib/format';
import type { AppNotification } from '../types';

/** Marks a notification read and opens its task or channel (or says the subject is gone). */
export const useOpenNotification = (markRead: (id: string) => Promise<void> | void, afterOpen?: () => void) => {
  const navigate = useNavigate();
  return useCallback((notification: AppNotification) => {
    void markRead(notification._id);
    const href = notificationHref(notification);
    afterOpen?.();
    if (href) navigate(href);
    // Chat notifications have no task; only claim a task is gone when one was expected
    else if (notification.type.startsWith('chat.')) toast.info('That conversation is no longer available.');
    else toast.info('That task no longer exists.');
  }, [afterOpen, markRead, navigate]);
};
