import { severityFor, targetUserFor, titleFor } from '../domain/notification.js';

export function createNotificationHandler({ db, broker, logger }) {
  return async (event) => {
    const user = targetUserFor(event);
    if (!user) {
      logger.warn(`[notify] evento ${event.type} sem usuário de destino; ignorado`);
      return;
    }

    const title = titleFor(event.type);
    const severity = severityFor(event.type);
    const message = event.message || `Evento ${event.type} processado.`;

    const inserted = db.insert({
      id: event.id,
      user,
      source: event.source,
      title,
      message,
      severity,
      originalType: event.type,
      payload: event.payload || {},
      occurredAt: event.occurredAt || new Date().toISOString()
    });

    if (!inserted) {
      logger.info(`[notify] notificação duplicada ignorada: ${event.id}`);
      return;
    }

    await broker.publish('notification.created', {
      user,
      message,
      payload: {
        ...event.payload,
        title,
        severity,
        source: event.source,
        originalType: event.type,
        originalEventId: event.id
      },
      correlationId: event.correlationId
    });
  };
}
