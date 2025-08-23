// pages/api/phone-check.js
import Twilio from "twilio";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { phone, code } = req.body || {};
    if (!phone || !code) {
      return res.status(400).json({ ok: false, error: "Missing phone or code" });
    }

    const client = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

    const check = await client.verify.v2
      .services(process.env.TWILIO_VERIFY_SID)
      .verificationChecks.create({ to: phone, code });

    return res.status(200).json({ ok: true, status: check.status });
  } catch (err) {
    console.error("phone-check error:", err?.message || err);
    return res.status(500).json({ ok: false, error: "Check OTP failed" });
  }
}
