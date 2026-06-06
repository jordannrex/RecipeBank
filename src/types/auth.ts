export type InitialsAvatar = { type: "initials"; letter: string; bgColor: string };
export type PhotoAvatar = { type: "photo"; url: string };
export type AvatarConfig = InitialsAvatar | PhotoAvatar;

export type RegisterInput = {
  email: string;
  username: string;
  displayName: string;
  password: string;
  confirmPassword: string;
};

export type LoginInput = {
  identifier: string;
  password: string;
  rememberMe: boolean;
};

export type AuthUser = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  avatarConfig: AvatarConfig | null;
  avatarHistory: AvatarConfig[];
  deletionScheduledAt: Date | null;
  createdAt: Date;
};
