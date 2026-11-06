/* SPDX-FileCopyrightText: 2026 Photo Editor Contributors */
/* SPDX-License-Identifier: MIT */

const axios = jest.fn(() => Promise.resolve({ data: {} }))
axios.get = jest.fn(() => Promise.resolve({ data: {} }))
axios.post = jest.fn(() => Promise.resolve({ data: {} }))
axios.put = jest.fn(() => Promise.resolve({ data: {} }))
axios.delete = jest.fn(() => Promise.resolve({ data: {} }))

module.exports = axios
module.exports.default = axios
