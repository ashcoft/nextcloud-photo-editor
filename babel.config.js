// Babel is used for two different targets:
//
//  - Jest runs the sources in Node, so they are compiled for the current Node
//    version, which keeps test output close to what the bundler produces.
//  - Webpack builds the browser bundle, which must run in the browsers
//    Nextcloud supports, not only in the Node version used to build it.
//
// NODE_ENV/BABEL_ENV selects between them; the production bundle is therefore
// not compiled down to whatever Node happens to be current.
const isTest = process.env.NODE_ENV === 'test' || process.env.BABEL_ENV === 'test'

module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        targets: isTest
          ? { node: 'current' }
          : {
              // The oldest browsers Nextcloud 34 supports.
              browsers: ['last 2 versions', 'not dead', 'not ie 11'],
            },
      },
    ],
    ['@babel/preset-typescript', { ignoreExtensions: true }],
  ],
}
