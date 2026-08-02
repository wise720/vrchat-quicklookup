export type Role = "owner" | "admin" | "user";

export const ROLE_RANK: Record<Role, number> = {
  user: 1,
  admin: 2,
  owner: 3,
};

export function hasMinRole(userRole: Role, required: Role): boolean {
  return ROLE_RANK[userRole] >= ROLE_RANK[required];
}

export type GroupListEntry = {
  id: string;
  name?: string;
};

export type GroupsCheckConfig = {
  enabled: boolean;
  warnGroups: GroupListEntry[];
  problemGroups: GroupListEntry[];
};

export type EmptyBioCheckConfig = {
  enabled: boolean;
};

export type NewAccountCheckConfig = {
  enabled: boolean;
  maxAgeDays: number;
};

export type FilterConfig = {
  checks: {
    groups: GroupsCheckConfig;
    "empty-bio": EmptyBioCheckConfig;
    "new-account": NewAccountCheckConfig;
    [checkId: string]: { enabled: boolean } & Record<string, unknown>;
  };
};

export const DEFAULT_FILTER_CONFIG: FilterConfig = {
  checks: {
    groups: {
      enabled: true,
      warnGroups: [],
      problemGroups: [],
    },
    "empty-bio": { enabled: true },
    "new-account": { enabled: true, maxAgeDays: 7 },
  },
};

export type Severity = "warn" | "problem";

export type Warning = {
  id: string;
  severity: Severity;
  label: string;
  detail?: string;
  checkId: string;
};

export type PublicUser = {
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
  pronouns?: string;
  isFriend?: boolean;
  developerType?: string;
  currentAvatarThumbnailImageUrl?: string;
  currentAvatarImageUrl?: string;
  userIcon?: string;
  profilePicOverride?: string;
};

export type AuthUser = {
  id: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
};

export type UserGroupSummary = {
  groupId: string;
  name: string;
  shortCode?: string;
  discriminator?: string;
  iconUrl?: string;
  memberCount?: number;
  privacy?: string;
  isRepresenting?: boolean;
};

export type LookupResult = {
  user: PublicUser;
  groups: UserGroupSummary[];
  warnings: Warning[];
  profileUrl: string;
  cachedAt: string | null;
  fromCache: boolean;
};
