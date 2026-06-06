type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export async function sendEmail({ to, subject, text, html }: SendEmailInput): Promise<void> {
  const from = process.env.EMAIL_FROM ?? "noreply@recipebank.app";

  if (!process.env.SMTP_HOST) {
    console.info("[email:dev-fallback]", { from, to, subject, text });
    return;
  }

  // SMTP integration deferred until credentials are configured.
  console.info("[email:queued]", { from, to, subject, text, html });
}
