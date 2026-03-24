import { Router, Request, Response } from 'express';
import nodemailer from 'nodemailer';

const router = Router();

function createTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_FROM,
      pass: process.env.EMAIL_APP_PASSWORD,
    },
  });
}

// POST /api/notifications/interview
router.post('/notifications/interview', async (req: Request, res: Response) => {
  const { candidateEmail, candidateName, jobTitle, companyName, interviewDate } = req.body;

  if (!candidateEmail || !candidateName || !jobTitle || !companyName) {
    res.status(400).json({ success: false, error: 'candidateEmail, candidateName, jobTitle, and companyName are required' });
    return;
  }

  const interviewDateHtml = interviewDate
    ? `<p style="margin: 0 0 12px 0;"><strong>Interview Date:</strong> ${interviewDate}</p>`
    : '';

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin: 0; padding: 0; background-color: #f4f6f9; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f6f9; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.10);">
          <!-- Header -->
          <tr>
            <td style="background-color: #2d8a4e; padding: 32px 40px; text-align: center;">
              <table cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                <tr>
                  <td style="vertical-align: middle; padding-right: 10px;">
                    <svg width="36" height="36" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="16" cy="16" r="16" fill="rgba(255,255,255,0.2)"/>
                      <path d="M10 16.5L14.5 21L22 12" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </td>
                  <td style="vertical-align: middle;">
                    <span style="color: #ffffff; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">CareerBridge</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 40px 40px 32px;">
              <h1 style="margin: 0 0 8px 0; font-size: 26px; font-weight: 800; color: #1a1a2e; letter-spacing: -0.5px;">
                Congratulations, ${candidateName}! 🎉
              </h1>
              <p style="margin: 0 0 24px 0; color: #4a5568; font-size: 16px; line-height: 1.6;">
                We have great news for you! You have been selected for an interview for the following position:
              </p>

              <div style="background: #e8f5ee; border-left: 4px solid #2d8a4e; border-radius: 8px; padding: 20px 24px; margin-bottom: 24px;">
                <p style="margin: 0 0 8px 0; font-size: 20px; font-weight: 700; color: #1a1a2e;">${jobTitle}</p>
                <p style="margin: 0 0 12px 0; font-size: 15px; color: #2d8a4e; font-weight: 600;">at ${companyName}</p>
                ${interviewDateHtml}
              </div>

              <p style="margin: 0 0 28px 0; color: #4a5568; font-size: 15px; line-height: 1.6;">
                We recommend preparing thoroughly for your interview. Visit CareerBridge to access AI-powered interview preparation tips tailored to your role.
              </p>

              <div style="text-align: center; margin-bottom: 32px;">
                <a href="${process.env.APP_URL || 'http://localhost:3000'}#jobs"
                   style="display: inline-block; background-color: #2d8a4e; color: #ffffff; font-size: 15px; font-weight: 700; padding: 14px 32px; border-radius: 8px; text-decoration: none; letter-spacing: 0.2px;">
                  Prepare for My Interview &rarr;
                </a>
              </div>

              <div style="border-top: 1px solid #e2e8f0; padding-top: 24px;">
                <p style="margin: 0; color: #718096; font-size: 13px; line-height: 1.65;">
                  Best of luck with your interview! If you have any questions or need support, please don't hesitate to reach out to the CareerBridge team.
                </p>
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background: #f8f9fa; padding: 20px 40px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #a0aec0; font-size: 12px;">
                &copy; 2026 CareerBridge &mdash; Your Bridge to the Career You Deserve
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"CareerBridge" <${process.env.EMAIL_FROM}>`,
      to: candidateEmail,
      subject: `🎉 Interview Opportunity: ${jobTitle} at ${companyName}`,
      html: htmlBody,
    });

    res.json({ success: true, message: 'Email sent' });
  } catch (err: any) {
    console.error('Email send error (interview):', err);
    res.json({ success: false, error: err.message || 'Failed to send email' });
  }
});

// POST /api/notifications/application-update
router.post('/notifications/application-update', async (req: Request, res: Response) => {
  const { candidateEmail, candidateName, jobTitle, companyName, status, message } = req.body;

  if (!candidateEmail || !candidateName || !jobTitle || !companyName || !status) {
    res.status(400).json({ success: false, error: 'candidateEmail, candidateName, jobTitle, companyName, and status are required' });
    return;
  }

  const statusColors: Record<string, string> = {
    APPLIED:   '#4a90d9',
    REVIEWING: '#d68910',
    INTERVIEW: '#2d8a4e',
    OFFER:     '#7b2d8a',
    REJECTED:  '#c0392b',
  };

  const statusColor = statusColors[status.toUpperCase()] || '#4a5568';

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin: 0; padding: 0; background-color: #f4f6f9; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f6f9; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.10);">
          <!-- Header -->
          <tr>
            <td style="background-color: #2d8a4e; padding: 32px 40px; text-align: center;">
              <span style="color: #ffffff; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">CareerBridge</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 40px 40px 32px;">
              <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 800; color: #1a1a2e;">
                Application Update
              </h1>
              <p style="margin: 0 0 24px 0; color: #4a5568; font-size: 15px; line-height: 1.6;">
                Hi ${candidateName}, here's an update on your application:
              </p>

              <div style="background: #f8f9fa; border-radius: 8px; padding: 20px 24px; margin-bottom: 24px;">
                <p style="margin: 0 0 6px 0; font-size: 18px; font-weight: 700; color: #1a1a2e;">${jobTitle}</p>
                <p style="margin: 0 0 16px 0; font-size: 14px; color: #4a5568;">at ${companyName}</p>
                <span style="display: inline-block; background-color: ${statusColor}; color: #ffffff; font-size: 13px; font-weight: 700; padding: 5px 16px; border-radius: 20px; letter-spacing: 0.5px;">
                  ${status.toUpperCase()}
                </span>
              </div>

              ${message ? `<p style="margin: 0 0 24px 0; color: #4a5568; font-size: 15px; line-height: 1.6;">${message}</p>` : ''}

              <div style="text-align: center; margin-bottom: 24px;">
                <a href="${process.env.APP_URL || 'http://localhost:3000'}#jobs"
                   style="display: inline-block; background-color: #2d8a4e; color: #ffffff; font-size: 15px; font-weight: 700; padding: 14px 32px; border-radius: 8px; text-decoration: none;">
                  View Jobs &rarr;
                </a>
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background: #f8f9fa; padding: 20px 40px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #a0aec0; font-size: 12px;">
                &copy; 2026 CareerBridge &mdash; Your Bridge to the Career You Deserve
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"CareerBridge" <${process.env.EMAIL_FROM}>`,
      to: candidateEmail,
      subject: `Application Update: ${jobTitle} at ${companyName}`,
      html: htmlBody,
    });

    res.json({ success: true, message: 'Email sent' });
  } catch (err: any) {
    console.error('Email send error (application-update):', err);
    res.json({ success: false, error: err.message || 'Failed to send email' });
  }
});

export default router;
