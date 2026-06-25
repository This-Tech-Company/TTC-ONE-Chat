const { logger } = require('@librechat/data-schemas');
const { CacheKeys, SystemRoles } = require('librechat-data-provider');
const {
  getBalanceConfig,
  verifyWorkspaceLaunchToken,
  WORKSPACE_CHAT_AUDIENCE,
  WORKSPACE_OPENID_ISSUER,
} = require('@librechat/api');
const { setAuthTokens } = require('~/server/services/AuthService');
const { getAppConfig } = require('~/server/services/Config');
const { findUser, createUser, updateUser } = require('~/models');
const getLogStores = require('~/cache/getLogStores');

const launchReplayTtlMs = 2 * 60 * 1000;

function getSecret() {
  return process.env.WORKSPACE_LAUNCH_TOKEN_SECRET || '';
}

function getLaunchErrorStatus(error) {
  if (!(error instanceof Error)) {
    return 401;
  }

  if (error.message.includes('secret is not configured')) {
    return 503;
  }

  if (error.message.includes('different external identity')) {
    return 409;
  }

  return 401;
}

function getSafeRedirectPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return '/';
  }

  return value;
}

function getUsername(payload) {
  const email = payload.user.email;
  if (email && email.includes('@')) {
    return email.split('@')[0].toLowerCase();
  }

  return payload.user.workosUserId.toLowerCase();
}

async function consumeLaunchTokenId(payload) {
  const cache = getLogStores(CacheKeys.WORKSPACE_LAUNCH_JTI);
  const cacheKey = `${payload.aud}:${payload.jti}`;
  const existing = await cache.get(cacheKey);
  if (existing) {
    throw new Error('Workspace launch token has already been used.');
  }

  const expiresAtMs =
    typeof payload.exp === 'number' ? payload.exp * 1000 : Date.now() + launchReplayTtlMs;
  const ttl = Math.max(1000, Math.min(launchReplayTtlMs, expiresAtMs - Date.now()));
  await cache.set(cacheKey, true, ttl);
}

async function findWorkspaceUser(payload) {
  const tenantId = payload.organization.id;
  const openidId = payload.user.workosUserId;
  const linkedUser = await findUser({
    provider: 'openid',
    openidId,
    openidIssuer: WORKSPACE_OPENID_ISSUER,
    tenantId,
  });

  if (linkedUser || !payload.user.email) {
    return linkedUser;
  }

  return await findUser({
    email: payload.user.email,
    tenantId,
  });
}

async function upsertWorkspaceUser(payload) {
  const existingUser = await findWorkspaceUser(payload);
  const tenantId = payload.organization.id;
  const openidId = payload.user.workosUserId;
  const email = payload.user.email || `${openidId}@workspace.local`;
  const update = {
    provider: 'openid',
    openidId,
    openidIssuer: WORKSPACE_OPENID_ISSUER,
    idOnTheSource: payload.user.id,
    tenantId,
    email,
    emailVerified: Boolean(payload.user.email),
    username: getUsername(payload),
    name: payload.user.name || payload.user.email || openidId,
    role: existingUser?.role || SystemRoles.USER,
  };

  if (!existingUser) {
    const appConfig = await getAppConfig({ baseOnly: true });
    const balanceConfig = getBalanceConfig(appConfig);
    return await createUser(update, balanceConfig, true, true);
  }

  const hasDifferentExternalIdentity =
    existingUser.openidId &&
    (existingUser.openidId !== openidId || existingUser.openidIssuer !== WORKSPACE_OPENID_ISSUER);

  if (hasDifferentExternalIdentity) {
    throw new Error('Existing Chat user is linked to a different external identity.');
  }

  return await updateUser(existingUser._id.toString(), update);
}

async function workspaceLaunchController(req, res) {
  try {
    const token = req.query.token;
    const redirectTo = getSafeRedirectPath(req.query.redirect_to);
    const payload = verifyWorkspaceLaunchToken({
      token: typeof token === 'string' ? token : '',
      secret: getSecret(),
      audience: WORKSPACE_CHAT_AUDIENCE,
    });

    await consumeLaunchTokenId(payload);
    const user = await upsertWorkspaceUser(payload);
    if (!user?._id) {
      return res.status(500).json({ message: 'Unable to provision Chat user.' });
    }

    req.user = user;
    await setAuthTokens(user._id, res, null, req);
    return res.redirect(redirectTo);
  } catch (error) {
    logger.error('[workspaceLaunchController]', error);
    return res.status(getLaunchErrorStatus(error)).json({
      message: error instanceof Error ? error.message : 'Workspace launch failed.',
    });
  }
}

module.exports = {
  workspaceLaunchController,
};
