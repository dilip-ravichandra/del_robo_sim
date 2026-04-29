# ═══════════════════════════════════════════════
# DELIVERYBOT — Email Service (Gmail SMTP)
# Set GMAIL_USER + GMAIL_APP_PASS in .env
# ═══════════════════════════════════════════════

import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from config import GMAIL_USER, GMAIL_APP_PASS


class EmailService:
    def __init__(self):
        self.sender   = GMAIL_USER
        self.password = GMAIL_APP_PASS

    def _send(self, to: str, subject: str, html: str) -> bool:
        if not self.sender or not self.password:
            print(f"[Email] NOT CONFIGURED — skipping email to {to}: {subject}")
            return False
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"]    = f"DeliveryBot <{self.sender}>"
            msg["To"]      = to
            msg.attach(MIMEText(html, "html"))
            ctx = ssl.create_default_context()
            with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ctx) as s:
                s.login(self.sender, self.password)
                s.sendmail(self.sender, to, msg.as_string())
            print(f"[Email] Sent '{subject}' to {to}")
            return True
        except Exception as e:
            print(f"[Email] Error: {e}")
            return False

    # ── Templates ─────────────────────────────────────────────────────

    def send_otp(self, to: str, name: str, otp: str, purpose: str = "verification") -> bool:
        purpose_label = {
            "register":      "Email Verification",
            "login":         "Login Verification",
            "reset":         "Password Reset",
        }.get(purpose, "Verification")

        html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#060d06;font-family:'Courier New',monospace">
  <div style="max-width:480px;margin:40px auto;background:#0d1a0d;border:1px solid rgba(29,185,84,0.2);border-radius:12px;overflow:hidden">
    <div style="background:linear-gradient(135deg,rgba(29,185,84,0.15),rgba(29,185,84,0.05));padding:28px 32px;border-bottom:1px solid rgba(29,185,84,0.15)">
      <div style="font-size:28px;margin-bottom:8px">🤖</div>
      <div style="font-size:20px;font-weight:800;color:#ffffff;letter-spacing:-0.5px">DeliveryBot</div>
      <div style="font-size:10px;color:#4a784a;letter-spacing:3px;margin-top:2px">AUTONOMOUS CAMPUS DELIVERY</div>
    </div>
    <div style="padding:32px">
      <p style="color:#c8e6c8;font-size:14px;margin-bottom:6px">Hi <strong style="color:#fff">{name}</strong>,</p>
      <p style="color:#6a9a6a;font-size:13px;margin-bottom:24px">Your <strong style="color:#c8e6c8">{purpose_label}</strong> OTP is:</p>
      <div style="background:rgba(29,185,84,0.08);border:1px solid rgba(29,185,84,0.25);border-radius:10px;padding:24px;text-align:center;margin-bottom:24px">
        <div style="font-size:36px;font-weight:700;color:#1db954;letter-spacing:12px">{otp}</div>
        <div style="font-size:11px;color:#4a784a;margin-top:8px;letter-spacing:2px">EXPIRES IN 10 MINUTES</div>
      </div>
      <p style="color:#4a784a;font-size:11px;margin:0">If you did not request this, please ignore this email.</p>
    </div>
    <div style="padding:16px 32px;border-top:1px solid rgba(29,185,84,0.1);font-size:10px;color:#2a482a;text-align:center;letter-spacing:1px">
      DELIVERYBOT SECURITY · DO NOT SHARE THIS CODE
    </div>
  </div>
</body>
</html>"""
        return self._send(to, f"DeliveryBot — {purpose_label} OTP: {otp}", html)

    def send_pickup_lock(
        self,
        to: str,
        name: str,
        item: str,
        pickup: str,
        otp: str,
    ) -> bool:
        html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#060d06;font-family:'Courier New',monospace">
  <div style="max-width:480px;margin:40px auto;background:#0d1a0d;border:1px solid rgba(59,130,246,0.25);border-radius:12px;overflow:hidden">
    <div style="background:linear-gradient(135deg,rgba(59,130,246,0.12),rgba(59,130,246,0.04));padding:28px 32px;border-bottom:1px solid rgba(59,130,246,0.15)">
      <div style="font-size:28px;margin-bottom:8px">🤖📦</div>
      <div style="font-size:20px;font-weight:800;color:#ffffff;letter-spacing:-0.5px">Robot at Pickup!</div>
      <div style="font-size:10px;color:#4a6a9a;letter-spacing:3px;margin-top:2px">LOAD PACKAGE TO PROCEED</div>
    </div>
    <div style="padding:32px">
      <p style="color:#c8e6c8;font-size:14px;margin-bottom:6px">Hi <strong style="color:#fff">{name}</strong>,</p>
      <p style="color:#6a9a6a;font-size:13px;margin-bottom:16px">The robot has arrived at <strong style="color:#c8e6c8">{pickup}</strong> and is ready to receive:</p>
      <div style="background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.15);border-radius:8px;padding:12px 16px;margin-bottom:20px">
        <div style="font-size:11px;color:#4a6a9a;margin-bottom:4px;letter-spacing:1px">ITEM</div>
        <div style="font-size:14px;color:#c8e6c8">{item}</div>
      </div>
      <p style="color:#6a9a6a;font-size:13px;margin-bottom:20px">Use this code to open the compartment and load the package:</p>
      <div style="background:rgba(59,130,246,0.08);border:2px solid rgba(59,130,246,0.35);border-radius:10px;padding:24px;text-align:center;margin-bottom:24px">
        <div style="font-size:36px;font-weight:700;color:#3b82f6;letter-spacing:12px">{otp}</div>
        <div style="font-size:11px;color:#4a6a9a;margin-top:8px;letter-spacing:2px">PICKUP UNLOCK CODE</div>
      </div>
      <p style="color:#4a784a;font-size:11px;margin:0">Enter this code on the DeliveryBot dashboard to load the package. The robot will proceed once the compartment is closed.</p>
    </div>
    <div style="padding:16px 32px;border-top:1px solid rgba(59,130,246,0.1);font-size:10px;color:#2a3a5a;text-align:center;letter-spacing:1px">
      DELIVERYBOT SECURE PICKUP · DO NOT SHARE THIS CODE
    </div>
  </div>
</body>
</html>"""
        return self._send(to, f"DeliveryBot — Robot at Pickup! Load Code: {otp}", html)

    def send_delivery_lock(
        self,
        to: str,
        name: str,
        item: str,
        dest: str,
        otp: str,
    ) -> bool:
        html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#060d06;font-family:'Courier New',monospace">
  <div style="max-width:480px;margin:40px auto;background:#0d1a0d;border:1px solid rgba(239,68,68,0.25);border-radius:12px;overflow:hidden">
    <div style="background:linear-gradient(135deg,rgba(239,68,68,0.12),rgba(239,68,68,0.04));padding:28px 32px;border-bottom:1px solid rgba(239,68,68,0.15)">
      <div style="font-size:28px;margin-bottom:8px">📦🔒</div>
      <div style="font-size:20px;font-weight:800;color:#ffffff;letter-spacing:-0.5px">Package Arrived!</div>
      <div style="font-size:10px;color:#784a4a;letter-spacing:3px;margin-top:2px">DELIVERY LOCK ACTIVE</div>
    </div>
    <div style="padding:32px">
      <p style="color:#c8e6c8;font-size:14px;margin-bottom:6px">Hi <strong style="color:#fff">{name}</strong>,</p>
      <p style="color:#6a9a6a;font-size:13px;margin-bottom:16px">Your package has arrived at <strong style="color:#c8e6c8">{dest}</strong>.</p>
      <div style="background:rgba(29,185,84,0.06);border:1px solid rgba(29,185,84,0.15);border-radius:8px;padding:12px 16px;margin-bottom:20px">
        <div style="font-size:11px;color:#4a784a;margin-bottom:4px;letter-spacing:1px">ITEM</div>
        <div style="font-size:14px;color:#c8e6c8">{item}</div>
      </div>
      <p style="color:#6a9a6a;font-size:13px;margin-bottom:20px">Use this unlock code to release the delivery compartment:</p>
      <div style="background:rgba(239,68,68,0.08);border:2px solid rgba(239,68,68,0.3);border-radius:10px;padding:24px;text-align:center;margin-bottom:24px">
        <div style="font-size:36px;font-weight:700;color:#ef4444;letter-spacing:12px">{otp}</div>
        <div style="font-size:11px;color:#784a4a;margin-top:8px;letter-spacing:2px">DELIVERY UNLOCK CODE</div>
      </div>
      <p style="color:#4a784a;font-size:11px;margin:0">Enter this code on the DeliveryBot dashboard to unlock your package.</p>
    </div>
    <div style="padding:16px 32px;border-top:1px solid rgba(239,68,68,0.1);font-size:10px;color:#482a2a;text-align:center;letter-spacing:1px">
      DELIVERYBOT SECURE DELIVERY · DO NOT SHARE THIS CODE
    </div>
  </div>
</body>
</html>"""
        return self._send(to, f"DeliveryBot — Package Arrived! Unlock Code: {otp}", html)


email_service = EmailService()
