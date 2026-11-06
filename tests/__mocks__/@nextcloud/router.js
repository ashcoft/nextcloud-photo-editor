/* SPDX-FileCopyrightText: 2026 Photo Editor Contributors */
/* SPDX-License-Identifier: MIT */

/**
 * Stand-in for `@nextcloud/router` in tests.
 *
 * `generateUrl` substitutes `{placeholder}` segments and returns an absolute
 * URL, so the mock reproduces both: a test asserting on a raw `{fileId}` would
 * pass against a mock that no longer matched how the app builds URLs.
 */
function generateUrl(url, params = {}) {
  let path = url.replace(/\{([^}]+)\}/g, (match, key) =>
    params[key] === undefined ? match : encodeURIComponent(String(params[key])),
  )

  if (!path.startsWith('/')) {
    path = `/${path}`
  }

  return `http://localhost${path}`
}

module.exports = {
  generateUrl,
  generateOcsUrl: (url, params) => generateUrl(`/ocs/v2.php${url}`, params),
  generateRemoteUrl: (url) => `http://localhost/remote.php/${url}`,
  getRootUrl: () => '',
  getCurrentUser: () => null,
}
