import type { User } from "@prisma/client";
import type { AuthUser } from "@/types/auth";

export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    deletionScheduledAt: user.deletionScheduledAt,
    createdAt: user.createdAt,
  };
}
