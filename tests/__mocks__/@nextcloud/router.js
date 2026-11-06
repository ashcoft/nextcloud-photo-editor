/* SPDX-FileCopyrightText: 2026 Photo Editor Contributors */
/* SPDX-License-Identifier: MIT */

module.exports = {
  generateUrl: (url) => `http://localhost${url}`,
  generateOcsUrl: (url) => `http://localhost/ocs/v2.php${url}`,
  generateRemoteUrl: (url) => `http://localhost/remote.php/${url}`,
  getRootUrl: () => '',
}
