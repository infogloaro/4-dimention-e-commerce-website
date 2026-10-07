import { z } from "zod";
import { email, password, phone, plainText, mediaUrl } from "./common";

export const registerBody = z.object({
  name: plainText(80, 2),
  email,
  password,
  phone: phone.optional(),
});

export const loginBody = z.object({
  email,
  password: z.string().min(1).max(128),
});

export const forgotPasswordBody = z.object({ email });
export const resetPasswordBody = z.object({ token: z.string().min(20).max(200), password });
export const verifyEmailBody = z.object({ token: z.string().min(20).max(200) });
export const changePasswordBody = z.object({ currentPassword: z.string().min(1).max(128), newPassword: password });

export const updateProfileBody = z
  .object({
    name: plainText(80, 2).optional(),
    phone: phone.nullable().optional(),
    avatarUrl: mediaUrl.nullable().optional(),
    marketingOptIn: z.boolean().optional(),
    preferences: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const phoneOtpRequestBody = z.object({ phone });
export const phoneOtpVerifyBody = z.object({ code: z.string().regex(/^\d{6}$/) });
