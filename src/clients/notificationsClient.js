const { env } = require('../config/env');

const notificationsClient = {
  async sendNotification(userId, { title, body, data }) {
    if (!env.NOTIFICATIONS_SERVICE_URL) {
      console.warn('[NotificationsClient] NOTIFICATIONS_SERVICE_URL not configured. Skipping push.');
      return;
    }

    try {
      const url = `${env.NOTIFICATIONS_SERVICE_URL}/notify`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': env.INTERNAL_SECRET,
        },
        body: JSON.stringify({
          user_id: userId,
          title,
          body,
          data,
        }),
      });

      if (!response.ok) {
        console.error(`[NotificationsClient] Failed to send push notification: ${response.statusText}`);
      } else {
        const result = await response.json();
        console.log(`[NotificationsClient] Push notification triggered:`, result);
      }
    } catch (error) {
      console.error('[NotificationsClient] Error calling notifications service:', error.message);
    }
  },
};

module.exports = { notificationsClient };
