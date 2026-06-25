import jwt, { type JwtPayload } from 'jsonwebtoken';

export const WORKSPACE_LAUNCH_ISSUER = 'ttc-one-workspace';
export const WORKSPACE_OPENID_ISSUER = 'ttc-one-workspace';
export const WORKSPACE_CHAT_AUDIENCE = 'chat';

export type WorkspaceLaunchPayload = JwtPayload & {
  application: {
    id: string;
    slug: string;
  };
  user: {
    id: string;
    workosUserId: string;
    email?: string;
    name?: string;
  };
  organization: {
    id: string;
    slug?: string;
    name?: string;
    workosOrganizationId?: string;
  };
  permissions: string[];
};

export type VerifyWorkspaceLaunchTokenOptions = {
  token: string;
  secret: string;
  audience?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function assertWorkspaceLaunchPayload(
  value: string | JwtPayload,
): asserts value is WorkspaceLaunchPayload {
  if (!isRecord(value)) {
    throw new Error('Workspace launch token payload is invalid.');
  }

  const application = value.application;
  const user = value.user;
  const organization = value.organization;

  if (!isRecord(application) || !hasString(application.id) || !hasString(application.slug)) {
    throw new Error('Workspace launch token is missing application context.');
  }

  if (!isRecord(user) || !hasString(user.id) || !hasString(user.workosUserId)) {
    throw new Error('Workspace launch token is missing user context.');
  }

  if (!isRecord(organization) || !hasString(organization.id)) {
    throw new Error('Workspace launch token is missing organization context.');
  }

  if (!hasStringArray(value.permissions)) {
    throw new Error('Workspace launch token permissions are invalid.');
  }

  if (!hasString(value.sub) || !hasString(value.jti)) {
    throw new Error('Workspace launch token is missing required claims.');
  }
}

export function verifyWorkspaceLaunchToken({
  token,
  secret,
  audience = WORKSPACE_CHAT_AUDIENCE,
}: VerifyWorkspaceLaunchTokenOptions): WorkspaceLaunchPayload {
  if (!hasString(token)) {
    throw new Error('Workspace launch token is required.');
  }

  if (!hasString(secret) || secret.length < 32) {
    throw new Error('Workspace launch token secret is not configured.');
  }

  const payload = jwt.verify(token, secret, {
    issuer: WORKSPACE_LAUNCH_ISSUER,
    audience,
    algorithms: ['HS256'],
    clockTolerance: 5,
  });

  assertWorkspaceLaunchPayload(payload);

  if (payload.application.slug !== audience) {
    throw new Error('Workspace launch token application does not match audience.');
  }

  if (payload.sub !== payload.user.workosUserId) {
    throw new Error('Workspace launch token subject does not match user context.');
  }

  return payload;
}
