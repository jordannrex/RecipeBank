import type { User } from "@prisma/client";
import type { AuthUser, AvatarConfig } from "@/types/auth";

export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    avatarConfig: (user.avatarConfig as AvatarConfig | null) ?? null,
    avatarHistory: (user.avatarHistory as AvatarConfig[] | null) ?? [],
    deletionScheduledAt: user.deletionScheduledAt,
    createdAt: user.createdAt,
  };
}
