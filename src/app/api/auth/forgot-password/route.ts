import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api";
import { createPasswordResetToken } from "@/lib/auth/password-reset";
import { sendEmail } from "@/lib/email";
import { prisma } from "@/lib/db";

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const GENERIC_MESSAGE =
  "If an account exists for that email, you will receive a password reset link shortly.";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiError("Invalid request body", 400);
  }

  const parsed = forgotPasswordSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  if (user) {
    const token = await createPasswordResetToken(user.id);
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const resetUrl = `${appUrl}/reset-password?token=${token}`;

    await sendEmail({
      to: user.email,
      subject: "Reset your RecipeBank password",
      text: `Reset your password using this link (expires in 1 hour): ${resetUrl}`,
      html: `<p>Reset your password using this link (expires in 1 hour):</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
    });
  }

  return apiSuccess({ message: GENERIC_MESSAGE });
}
