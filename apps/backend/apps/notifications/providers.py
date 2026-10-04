"""
Notification provider abstraction.

Similar to OTP, this allows swapping between a Mock provider during dev
and real providers (Twilio, SendGrid, etc.) in production.
"""
import logging
from abc import ABC, abstractmethod
from typing import Optional

from django.conf import settings

logger = logging.getLogger('lifelink.notifications')

class NotificationProvider(ABC):
    @abstractmethod
    def send_sms(self, phone: str, title: str, body: str) -> bool:
        raise NotImplementedError
        
    @abstractmethod
    def send_email(self, email: str, title: str, body: str) -> bool:
        raise NotImplementedError


class MockNotificationProvider(NotificationProvider):
    def send_sms(self, phone: str, title: str, body: str) -> bool:
        logger.info('notification_sms_mock phone=%s title="%s"', phone, title)
        return True
        
    def send_email(self, email: str, title: str, body: str) -> bool:
        logger.info('notification_email_mock email=%s title="%s"', email, title)
        return True


def get_notification_provider() -> NotificationProvider:
    provider_name = getattr(settings, 'NOTIFICATION_PROVIDER', 'mock')
    if provider_name == 'mock':
        return MockNotificationProvider()
    raise NotImplementedError(
        f"Notification provider '{provider_name}' is not wired in this build. "
    )
