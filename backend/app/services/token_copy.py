"""One-shot copies, after issuance. Never retry ambiguous Meta submissions."""
import json
import re
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.config import settings
from app.schemas.token import CopyNotification


def notify_token_copy(*, consent: bool, public: bool, phone: str | None,
                      token_number: str, counter_name: str) -> CopyNotification:
    if not consent:
        return CopyNotification(status="not_requested")
    if public:
        # Only an inbound, signed WhatsApp message may trigger a public copy.
        number = settings.WHATSAPP_BOT_NUMBER
        if not re.fullmatch(r"\+[1-9][0-9]{6,14}", number):
            return CopyNotification(status="unavailable")
        return CopyNotification(status="action_required", action_url=f"https://wa.me/{number[1:]}?text=status")
    if not (settings.WHATSAPP_TOKEN and settings.WHATSAPP_COPY_TEMPLATE
            and settings.WHATSAPP_COPY_LANGUAGE
            and re.fullmatch(r"[0-9]+", settings.PHONE_NUMBER_ID)
            and re.fullmatch(r"v[0-9]+\.[0-9]+", settings.WHATSAPP_API_VERSION)):
        return CopyNotification(status="unavailable")
    if not re.fullmatch(r"\+[1-9][0-9]{6,14}", phone or ""):
        return CopyNotification(status="failed")
    payload = {
        "messaging_product": "whatsapp", "to": phone[1:], "type": "template",
        "template": {
            "name": settings.WHATSAPP_COPY_TEMPLATE,
            "language": {"code": settings.WHATSAPP_COPY_LANGUAGE},
            "components": [{"type": "body", "parameters": [
                {"type": "text", "text": token_number},
                {"type": "text", "text": counter_name},
            ]}],
        },
    }
    try:
        request = Request(
            f"https://graph.facebook.com/{settings.WHATSAPP_API_VERSION}/{settings.PHONE_NUMBER_ID}/messages",
            data=json.dumps(payload).encode(), method="POST",
            headers={"Authorization": f"Bearer {settings.WHATSAPP_TOKEN}", "Content-Type": "application/json"},
        )
        with urlopen(request, timeout=8) as response:
            result = json.load(response)
        message_id = result.get("messages", [{}])[0].get("id")
        if isinstance(message_id, str) and message_id:
            return CopyNotification(status="accepted")
    except HTTPError:
        return CopyNotification(status="failed")
    except (URLError, TimeoutError, OSError, ValueError, KeyError, IndexError, AttributeError, TypeError):
        # A timeout or malformed response does not prove Meta rejected the message.
        pass
    return CopyNotification(status="unknown")
