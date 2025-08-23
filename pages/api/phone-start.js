// pages/api/phone-start.js
import Twilio from "twilio";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { phone } = req.body || {};
    if (!phone || typeof phone !== "string") {
      return res.status(400).json({ ok: false, error: "Missing or invalid phone" });
    }

    const client = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

    const verification = await client.verify.v2
      .services(process.env.TWILIO_VERIFY_SID)
      .verifications.create({ to: phone, channel: "sms" });

    return res.status(200).json({ ok: true, status: verification.status });
  } catch (err) {
    console.error("phone-start error:", err?.message || err);
    return res.status(500).json({ ok: false, error: "Start OTP failed" });
  }
}
