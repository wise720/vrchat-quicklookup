export type VrchatSeverity = "warn" | "problem";

export type VrchatUser = {
  id: string;
  displayName: string;
  bio?: string;
  bioLinks?: string[];
  status?: string;
  statusDescription?: string;
  tags?: string[];
  date_joined?: string;
  last_login?: string;
  last_platform?: string;
  profilePicOverride?: string;
  userIcon?: string;
  currentAvatarImageUrl?: string;
  currentAvatarThumbnailImageUrl?: string;
  isFriend?: boolean;
  pronouns?: string;
  developerType?: string;
  [key: string]: unknown;
};

export type VrchatGroupMembership = {
  groupId: string;
  name: string;
  shortCode?: string;
  discriminator?: string;
  description?: string;
  iconUrl?: string;
  bannerUrl?: string;
  privacy?: string;
  ownerId?: string;
  memberCount?: number;
  memberVisibility?: string;
  isRepresenting?: boolean;
  mutualGroup?: boolean;
  [key: string]: unknown;
};

export type VrchatGroup = {
  id: string;
  name: string;
  shortCode?: string;
  discriminator?: string;
  description?: string;
  iconUrl?: string;
  memberCount?: number;
  [key: string]: unknown;
};

export type VrchatSession = {
  authCookie: string;
  twoFactorAuthCookie?: string;
  updatedAt: string;
};

export type SessionCookies = {
  authCookie: string;
  twoFactorAuthCookie?: string;
};

export type TwoFactorMethod = "totp" | "otp" | "emailotp";

export type LoginResult =
  | { status: "ok"; user: VrchatUser }
  | { status: "twoFactorRequired"; methods: TwoFactorMethod[] };
