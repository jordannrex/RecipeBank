import { z } from "zod";

export const usernameSchema = z
  .string()
  .min(3, "Username must be at least 3 characters")
  .max(64, "Username must be at most 64 characters")
  .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .refine(
    (password) => /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password),
    "Password must contain at least one number or special character",
  );

export const registerSchema = z
  .object({
    email: z.string().email("Please enter a valid email address"),
    username: usernameSchema,
    displayName: z
      .string()
      .min(1, "Display name is required")
      .max(128, "Display name must be at most 128 characters"),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  identifier: z.string().min(1, "Email or username is required"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean(),
});

export type RegisterFormValues = z.infer<typeof registerSchema>;
export type LoginFormValues = z.infer<typeof loginSchema>;
