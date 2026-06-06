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
  deletionScheduledAt: Date | null;
  createdAt: Date;
};
