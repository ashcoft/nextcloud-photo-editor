# [1.7.0](https://github.com/ashcoft/nextcloud-photo-editor/compare/v1.6.0...v1.7.0) (2026-11-10)


### Bug Fixes

* **deps:** automate PhotoCraft updates and bump the vendored editor to 0.22.0 ([b996307](https://github.com/ashcoft/nextcloud-photo-editor/commit/b9963075b71b9e8d1c354f810cfa63eeaba8f69a))
* **deps:** harden the PhotoCraft updater and address review feedback ([4cf6d29](https://github.com/ashcoft/nextcloud-photo-editor/commit/4cf6d295e4de35afe838026503c566347ad43882))

# [1.6.0](https://github.com/ashcoft/nextcloud-photo-editor/compare/v1.5.0...v1.6.0) (2026-11-08)


### Bug Fixes

* classify a file by one rule so both actions cannot match ([1fc5e16](https://github.com/ashcoft/nextcloud-photo-editor/commit/1fc5e16aa28caad12309bcda4a58bc546a395271))


### Features

* open only Photoshop documents on a single click ([9c7c3b0](https://github.com/ashcoft/nextcloud-photo-editor/commit/9c7c3b0be7bf187b3cd99da95b011c922dfaeb7f))

# [1.5.0](https://github.com/ashcoft/nextcloud-photo-editor/compare/v1.4.0...v1.5.0) (2026-11-08)


### Bug Fixes

* **deps:** update dependency vue to v3.5.45 ([f1a5d14](https://github.com/ashcoft/nextcloud-photo-editor/commit/f1a5d1463dfdb50a6c25e54e07757adbd1d62dde))

# [1.4.0](https://github.com/ashcoft/nextcloud-photo-editor/compare/v1.3.0...v1.4.0) (2026-11-08)


### Bug Fixes

* address the remaining analysis findings ([ce2322e](https://github.com/ashcoft/nextcloud-photo-editor/commit/ce2322e559081ac37c03163259a79fab3792eebd))
* address the review findings ([70487b7](https://github.com/ashcoft/nextcloud-photo-editor/commit/70487b762975b8314c3143e615cd23869dede9eb))
* correct the PSB layout and the remaining review findings ([16cb3dc](https://github.com/ashcoft/nextcloud-photo-editor/commit/16cb3dcc9c80c65b2d8d982346ca3c6f5779f9c8))
* keep SonarCloud off the vendored editor and simplify the PSD check ([80f5bff](https://github.com/ashcoft/nextcloud-photo-editor/commit/80f5bff6648ef6e1da0329effc5d6c9564118680))


### Features

* replace the editor with the embedded PhotoCraft app ([9632098](https://github.com/ashcoft/nextcloud-photo-editor/commit/963209875e137e039f01f975e336339ef4520571))

# [1.3.0](https://github.com/ashcoft/nextcloud-photo-editor/compare/v1.2.0...v1.3.0) (2026-11-08)


### Bug Fixes

* **deps:** patch deepmerge prototype poisoning (GHSA-gcqx-w48m-w2h4) ([928629a](https://github.com/ashcoft/nextcloud-photo-editor/commit/928629a466b18e7facb2132ad6ecccd7e89bc19b)), closes [TehShrike/deepmerge#274](https://github.com/TehShrike/deepmerge/issues/274)

# [1.2.0](https://github.com/ashcoft/nextcloud-photo-editor/compare/v1.1.0...v1.2.0) (2026-11-08)


### Bug Fixes

* **deps:** force minimatch to the patched line for GHSA-g3hv-75wg-m249 ([355a60e](https://github.com/ashcoft/nextcloud-photo-editor/commit/355a60eb10bb074d34495237d6aad6f5256f74ec))

# [1.1.0](https://github.com/ashcoft/nextcloud-photo-editor/compare/v1.0.0...v1.1.0) (2026-11-08)


### Bug Fixes

* address four bugs found in the re-review ([aa117f9](https://github.com/ashcoft/nextcloud-photo-editor/commit/aa117f96e5b6b9677d460980833f7a68c4af4be5))
* **deps:** keep TypeScript 7 working with the TS 6 compiler API ([05f2ed6](https://github.com/ashcoft/nextcloud-photo-editor/commit/05f2ed6ecb76872ef94946f3789d7d84503c8ba7))
* **deps:** migrate pnpm settings to pnpm-workspace.yaml for v12 ([73b52c9](https://github.com/ashcoft/nextcloud-photo-editor/commit/73b52c963a073a9e86fb8343bcc9955f61f8de71))
* **deps:** pin the typescript alias to the TS 6 compat package ([ceb4c44](https://github.com/ashcoft/nextcloud-photo-editor/commit/ceb4c4435fe852e155702846b12e3fc7a88013e5))
* **deps:** update dependency vue to v3.5.44 ([58a5706](https://github.com/ashcoft/nextcloud-photo-editor/commit/58a570671c4b2abe1720d8ed44d61ef6f96f250d))
* point the repository URL at the renamed GitHub repo ([293bb89](https://github.com/ashcoft/nextcloud-photo-editor/commit/293bb8913a0ef220bf32213b075ed1d7296a413a))
* stop the release-age guard from breaking the dependency bots ([e4dbbbb](https://github.com/ashcoft/nextcloud-photo-editor/commit/e4dbbbb2d8dbe5dcf64bb1fe841f10729776c0d3))
* stop the release-age guard from breaking the dependency bots ([b5fd760](https://github.com/ashcoft/nextcloud-photo-editor/commit/b5fd7603d41edbcf723b14b924ba31a51f83e784))

# 1.0.0 (2026-11-06)


### Bug Fixes

* address correctness findings from review ([aafcf5c](https://github.com/ashcoft/photo-editor/commit/aafcf5cf96670a69d1500df4b281e9101341eb36))
* correct the README claims and the remaining lint findings ([60900e1](https://github.com/ashcoft/photo-editor/commit/60900e1d7e18d4933b700f77d6f85f11b79f483f))
* enforce commitlint and finish the review fixes ([9ce243c](https://github.com/ashcoft/photo-editor/commit/9ce243c59760d64a865f79603e28423d2d1f43b6))
* size the editor to the content area instead of the viewport ([69caf6f](https://github.com/ashcoft/photo-editor/commit/69caf6ff8d89920578336d23cc9cfdfdcc5ccd5d))


### Features

* add a photo editor that opens PSD files ([cc91931](https://github.com/ashcoft/photo-editor/commit/cc91931eb52eabcde96994d3f7ecb2ecddbb946e))
