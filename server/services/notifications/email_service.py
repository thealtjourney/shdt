"""
Email service for SHDT notifications.

Provides SMTP-based email sending with Jinja2 template support, batch processing,
rate limiting, and delivery tracking.
"""

import logging
import asyncio
import smtplib
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from enum import Enum
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from abc import ABC, abstractmethod
import time

try:
    from jinja2 import Environment, BaseLoader, Template
except ImportError:
    raise ImportError("Jinja2 is required for email template rendering")

logger = logging.getLogger(__name__)


class EmailProviderType(str, Enum):
    """Supported email providers."""
    SMTP = "smtp"
    SENDGRID = "sendgrid"
    MAILGUN = "mailgun"
    AWS_SES = "aws_ses"


@dataclass
class EmailConfig:
    """Configuration for email service."""
    provider: EmailProviderType = EmailProviderType.SMTP
    smtp_host: Optional[str] = None
    smtp_port: int = 587
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_use_tls: bool = True
    from_email: str = "noreply@shdt.example.com"
    from_name: str = "SHDT Alerts"
    rate_limit_per_minute: int = 50
    batch_size: int = 100
    retry_attempts: int = 3
    retry_delay_seconds: int = 5


@dataclass
class EmailMessage:
    """Email message to send."""
    recipient_email: str
    subject: str
    body_html: str
    body_text: Optional[str] = None
    reply_to: Optional[str] = None
    tags: Optional[Dict[str, str]] = None


@dataclass
class SendResult:
    """Result of sending an email."""
    success: bool
    message_id: Optional[str] = None
    error: Optional[str] = None
    timestamp: datetime = None

    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.utcnow()


class BaseEmailProvider(ABC):
    """Base class for email providers."""

    def __init__(self, config: EmailConfig):
        self.config = config

    @abstractmethod
    async def send(self, message: EmailMessage) -> SendResult:
        """Send an email message."""
        pass

    @abstractmethod
    async def send_batch(self, messages: List[EmailMessage]) -> List[SendResult]:
        """Send multiple email messages."""
        pass


class SMTPProvider(BaseEmailProvider):
    """SMTP email provider."""

    def __init__(self, config: EmailConfig):
        super().__init__(config)
        if not config.smtp_host or not config.smtp_username or not config.smtp_password:
            raise ValueError("SMTP configuration incomplete")

        self.connection = None

    def _create_connection(self) -> smtplib.SMTP:
        """Create SMTP connection."""
        try:
            conn = smtplib.SMTP(self.config.smtp_host, self.config.smtp_port)
            if self.config.smtp_use_tls:
                conn.starttls()
            conn.login(self.config.smtp_username, self.config.smtp_password)
            return conn
        except Exception as e:
            logger.error(f"Failed to create SMTP connection: {e}")
            raise

    def _build_message(self, message: EmailMessage) -> MIMEMultipart:
        """Build MIME message."""
        msg = MIMEMultipart("alternative")
        msg["Subject"] = message.subject
        msg["From"] = f"{self.config.from_name} <{self.config.from_email}>"
        msg["To"] = message.recipient_email

        if message.reply_to:
            msg["Reply-To"] = message.reply_to

        # Attach text version
        if message.body_text:
            msg.attach(MIMEText(message.body_text, "plain"))

        # Attach HTML version (preferred)
        msg.attach(MIMEText(message.body_html, "html"))

        return msg

    async def send(self, message: EmailMessage) -> SendResult:
        """Send a single email."""
        retry_count = 0

        while retry_count < self.config.retry_attempts:
            try:
                conn = self._create_connection()
                mime_message = self._build_message(message)

                conn.send_message(mime_message)
                conn.quit()

                message_id = mime_message.get("Message-ID", f"smtp-{time.time()}")
                logger.info(f"Email sent to {message.recipient_email}")

                return SendResult(
                    success=True,
                    message_id=message_id,
                )

            except Exception as e:
                retry_count += 1
                logger.warning(
                    f"Failed to send email to {message.recipient_email} "
                    f"(attempt {retry_count}/{self.config.retry_attempts}): {e}"
                )

                if retry_count < self.config.retry_attempts:
                    await asyncio.sleep(self.config.retry_delay_seconds)
                else:
                    return SendResult(
                        success=False,
                        error=f"Failed after {self.config.retry_attempts} attempts: {str(e)}",
                    )

        return SendResult(success=False, error="Unknown error")

    async def send_batch(self, messages: List[EmailMessage]) -> List[SendResult]:
        """Send multiple emails with rate limiting."""
        results = []
        rate_limit_delay = 60.0 / self.config.rate_limit_per_minute

        for i, message in enumerate(messages):
            result = await self.send(message)
            results.append(result)

            # Apply rate limiting
            if i < len(messages) - 1:
                await asyncio.sleep(rate_limit_delay)

        return results


class EmailService:
    """
    Email service for sending notifications.

    Supports multiple email providers (SMTP, SendGrid, Mailgun, AWS SES),
    Jinja2 template rendering, batch sending, and rate limiting.
    """

    def __init__(self, config: EmailConfig):
        self.config = config
        self.provider = self._create_provider()
        self.jinja_env = Environment(loader=BaseLoader())
        self.sent_count = 0
        self.failed_count = 0
        self.last_sent_time: Optional[datetime] = None

    def _create_provider(self) -> BaseEmailProvider:
        """Create the email provider based on configuration."""
        if self.config.provider == EmailProviderType.SMTP:
            return SMTPProvider(self.config)
        else:
            raise NotImplementedError(f"Provider {self.config.provider} not yet implemented")

    async def send(self, message: EmailMessage) -> SendResult:
        """Send a single email."""
        result = await self.provider.send(message)

        if result.success:
            self.sent_count += 1
        else:
            self.failed_count += 1

        self.last_sent_time = result.timestamp
        return result

    async def send_batch(self, messages: List[EmailMessage]) -> List[SendResult]:
        """Send multiple emails with rate limiting."""
        results = await self.provider.send_batch(messages)

        for result in results:
            if result.success:
                self.sent_count += 1
            else:
                self.failed_count += 1

        if results:
            self.last_sent_time = results[-1].timestamp

        return results

    def render_template(self, template_str: str, context: Dict[str, Any]) -> str:
        """
        Render a Jinja2 template with context.

        Args:
            template_str: Jinja2 template string
            context: Template context variables

        Returns:
            Rendered template string
        """
        try:
            template = self.jinja_env.from_string(template_str)
            return template.render(context)
        except Exception as e:
            logger.error(f"Template rendering error: {e}")
            raise

    def render_email_message(
        self,
        recipient_email: str,
        subject_template: str,
        body_html_template: str,
        body_text_template: Optional[str],
        context: Dict[str, Any],
    ) -> EmailMessage:
        """
        Create an email message from templates.

        Args:
            recipient_email: Recipient email address
            subject_template: Subject line template
            body_html_template: HTML body template
            body_text_template: Plain text body template
            context: Template context variables

        Returns:
            EmailMessage object ready to send
        """
        subject = self.render_template(subject_template, context)
        body_html = self.render_template(body_html_template, context)
        body_text = (
            self.render_template(body_text_template, context)
            if body_text_template
            else None
        )

        return EmailMessage(
            recipient_email=recipient_email,
            subject=subject,
            body_html=body_html,
            body_text=body_text,
        )

    def get_stats(self) -> Dict[str, Any]:
        """Get email service statistics."""
        return {
            'sent_count': self.sent_count,
            'failed_count': self.failed_count,
            'total_attempted': self.sent_count + self.failed_count,
            'last_sent_time': self.last_sent_time,
            'success_rate': (
                self.sent_count / (self.sent_count + self.failed_count)
                if (self.sent_count + self.failed_count) > 0
                else 0
            ),
        }

    def reset_stats(self):
        """Reset service statistics."""
        self.sent_count = 0
        self.failed_count = 0
        self.last_sent_time = None
