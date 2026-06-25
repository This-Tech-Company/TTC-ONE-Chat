import jwt from 'jsonwebtoken';
import {
  WORKSPACE_CHAT_AUDIENCE,
  WORKSPACE_LAUNCH_ISSUER,
  verifyWorkspaceLaunchToken,
} from './workspace';

const secret = 'workspace-launch-secret-for-tests-32-chars';

function createPayload(overrides = {}) {
  return {
    application: {
      id: 'app-chat',
      slug: 'chat',
    },
    user: {
      id: 'workspace-user-id',
      workosUserId: 'workos-user-id',
      email: 'user@example.com',
      name: 'Example User',
    },
    organization: {
      id: 'workspace-org-id',
      slug: 'example',
      name: 'Example',
    },
    permissions: ['chat:read'],
    ...overrides,
  };
}

function sign(payload = createPayload(), audience = WORKSPACE_CHAT_AUDIENCE) {
  return jwt.sign(payload, secret, {
    issuer: WORKSPACE_LAUNCH_ISSUER,
    audience,
    subject: 'workos-user-id',
    jwtid: 'launch-id',
    expiresIn: '60s',
    algorithm: 'HS256',
  });
}

describe('verifyWorkspaceLaunchToken', () => {
  it('returns a valid Workspace launch payload', () => {
    const payload = verifyWorkspaceLaunchToken({
      token: sign(),
      secret,
    });

    expect(payload.user.workosUserId).toBe('workos-user-id');
    expect(payload.application.slug).toBe('chat');
    expect(payload.permissions).toEqual(['chat:read']);
  });

  it('rejects tokens for a different audience', () => {
    expect(() =>
      verifyWorkspaceLaunchToken({
        token: sign(createPayload(), 'gxp'),
        secret,
      }),
    ).toThrow();
  });

  it('rejects tokens missing required Workspace context', () => {
    const token = sign(createPayload({ organization: undefined }));

    expect(() =>
      verifyWorkspaceLaunchToken({
        token,
        secret,
      }),
    ).toThrow('Workspace launch token is missing organization context.');
  });
});
