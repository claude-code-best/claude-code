3.1.0 / 2023-07-06
==================
* replace inlined xmldom with @xmldom/xmldom


3.0.5 / 2022-03-23
==================
* [[`96e2303d05`]](https://github.com/TooTallNate/plist.js/commit/96e2303d059e6be0c9e0c4773226d14b4758de52) Prototype Pollution using .parse() #114 (mario-canva)
* update browserify from 16 to 17


3.0.4 / 2021-08-27
==================
* inline xmldom@0.6.0 to eliminate security warning false positive (Mike Reinstein)


3.0.3 / 2021-08-04
==================
* update xmldom to 0.6.0 to patch critical vulnerability (Mike Reinstein)
* remove flaky saucelabs teseting badge (Mike Reinstein)


3.0.2 / 2021-03-25
==================
* update xmldom to 0.5.0 to patch critical vulnerability (Mike Reinstein)
* update saucelab credentials to point at mreinstein's saucelabs account (Mike Reinstein)
* remove a bunch of test versions from the matrix because they weren't working in zuul + sauce (Mike Reinstein)


3.0.1 / 2018-03-21
==================
* avoid using Buffer constructor nodejs/node#19079


3.0.0 / 2018-03-18
==================
* [[`cb0d8f1bc6`]](https://github.com/TooTallNate/plist.js/commit/cb0d8f1bc60dee423f8fc2cfcac427452dfaddb0) update Makefile, rebuild dist/ (Mike Reinstein)
* [[`9dfeffe73f`]](https://github.com/TooTallNate/plist.js/commit/9dfeffe73fdb447ac5a87ee364a1472975f12adf) remove unsupported browser versions from travis (Mike Reinstein)
* [[`c962bfe1ea`]](https://github.com/TooTallNate/plist.js/commit/c962bfe1ea04dd87966250253d33738bceecab61) update module deps, remove support for node < 6 (Mike Reinstein)


2.1.0 / 2017-05-04
==================

* [[`e4f06669bb`]](https://github.com/TooTallNate/plist.js/commit/e4f06669bb51d2e65654df7c39aab52bc3bf4e8a) - update license (extend copyright term) (Mike Reinstein)
* [[`edc6e41035`]](https://github.com/TooTallNate/plist.js/commit/edc6e4103546b1d7518a577e7c202c305a8abec0) - update module deps (Mike Reinstein)
* [[`85d11c48ef`](https://github.com/TooTallNate/plist.js/commit/85d11c48eff02312cbdd67f46fd8e74b0d372ca1)] - Harden test-cases and implementation to align with other implementations (Björn Brauer)
* [[`7619537eaa`]](https://github.com/TooTallNate/plist.js/commit/7619537eaa9e3e5a80829e759c004d2e017a07d2) review feedback: early returns and constants for nodeTypes (Björn Brauer)


2.0.1 / 2016-08-16
==================

* [[`de136c8388`](https://github.com/TooTallNate/plist/commit/de136c8388)] - bad npm release… (Nathan Rajlich)


2.0.0 / 2016-08-16
==================

* [[`90deef5d43`](https://github.com/TooTallNate/plist/commit/90deef5d43)] - remove deprecated functions (Nathan Rajlich)
* [[`d475cd8ce9`](https://github.com/TooTallNate/plist/commit/d475cd8ce9)] - Added travis ci support for node 6 (Amila Welihinda)
* [[`04c8ee7646`](https://github.com/TooTallNate/plist/commit/04c8ee7646)] - update dependencies (Mitchell Hentges)
* [[`97c02b3f05`](https://github.com/TooTallNate/plist/commit/97c02b3f05)] - **travis**: add `sudo: false` and test more node versions (Nathan Rajlich)
* [[`54c821ec29`](https://github.com/TooTallNate/plist/commit/54c821ec29)] - #71 - fixed and added test (Andrew Goldis)
* [[`4afb7c5079`](https://github.com/TooTallNate/plist/commit/4afb7c5079)] - fix `Cannot read property 'nodeValue' of undefined exception` that is thrown when a `<key></key>` construct appears in plist (Chris Kinsman)
* [[`f360d7d685`](https://github.com/TooTallNate/plist/commit/f360d7d685)] - #66 - fixed empty keys and added tests (Andrew Goldis)
* [[`421c7f26e9`](https://github.com/TooTallNate/plist/commit/421c7f26e9)] - #66 - fixed empty key (Andrew Goldis)
* [[`a88aa4dca7`](https://github.com/TooTallNate/plist/commit/a88aa4dca7)] - add verbose examples (mrzmyr)


1.2.0 / 2015-11-10
==================

  * package: update "browserify" to v12.0.1
  * package: update "zuul" to v3.7.2
  * package: update "xmlbuilder" to v4.0.0
  * package: update "util-deprecate" to v1.0.2
  * package: update "mocha" to v2.3.3
  * package: update "base64-js" to v0.0.8
  * build: omit undefined values
  * travis: add node 4.0 and 4.1 to test matrix


1.1.0 / 2014-08-27
==================

  * package: update "browserify" to v5.10.1
  * package: update "zuul" to v1.10.2
  * README: add "Sauce Test Status" build badge
  * travis: use new "plistjs" sauce credentials
  * travis: set up zuul saucelabs automated testing


1.0.1 / 2014-06-25
==================

  * add .zuul.yml file for browser testing
  * remove Testling stuff
  * build: fix global variable `val` leak
  * package: use --check-leaks when running mocha tests
  * README: update examples to use preferred API
  * package: add "browser" keyword


1.0.0 / 2014-05-20
==================

  * package: remove "android-browser"
  * test: add <dict> build() test
  * test: re-add the empty string build() test
  * test: remove "fixtures" and legacy "tests" dir
  * test: add some more build() tests
  * test: add a parse() CDATA test
  * test: starting on build() tests
  * test: more parse() tests
  * package: attempt to fix "android-browser" testling
  * parse: better <data> with newline handling
  * README: add Testling badge
  * test: add <data> node tests
  * test: add a <date> parse() test
  * travis: don't test node v0.6 or v0.8
  * test: some more parse() tests
  * test: add simple <string> parsing test
  * build: add support for an optional "opts" object
  * package: test mobile devices
  * test: use multiline to inline the XML
  * package: beautify
  * package: fix "mocha" harness
  * package: more testling browsers
  * build: add the "version=1.0" attribute
  * beginnings of "mocha" tests
  * build: more JSDocs
  * tests: add test that ensures that empty string conversion works
  * build: update "xmlbuilder" to v2.2.1
  * parse: ignore comment and cdata nodes
  * tests: make the "Newlines" test actually contain a newline
  * parse: lint
  * test travis
  * README: add Travis CI badge
  * add .travis.yml file
  * build: updated DTD to reflect name change
  * parse: return falsey values in an Array plist
  * build: fix encoding a typed array in the browser
  * build: add support for Typed Arrays and ArrayBuffers
  * build: more lint
  * build: slight cleanup and optimizations
  * build: use .txt() for the "date" value
  * parse: always return a Buffer for <data> nodes
  * build: don't interpret Strings as base64
  * dist: commit prebuilt plist*.js files
  * parse: fix typo in deprecate message
  * parse: fix parse() return value
  * parse: add jsdoc comments for the deprecated APIs
  * parse: add `parse()` function
  * node, parse: use `util-deprecate` module
  * re-implemented parseFile to be asynchronous
  * node: fix jsdoc comment
  * Makefile: fix "node" require stubbing
  * examples: add "browser" example
  * package: tweak "main"
  * package: remove "engines" field
  * Makefile: fix --exclude command for browserify
  * package: update "description"
  * lib: more styling
  * Makefile: add -build.js and -parse.js dist files
  * lib: separate out the parse and build logic into their own files
  * Makefile: add makefile with browserify build rules
  * package: add "browserify" as a dev dependency
  * plist: tabs to spaces (again)
  * add a .jshintrc file
  * LICENSE: update
  * node-webkit support
  * Ignore tests/ in .npmignore file
  * Remove duplicate devDependencies key
  * Remove trailing whitespace
  * adding recent contributors. Bumping npm package number (patch release)
  * Fixed node.js string handling
  * bumping version number
  * Fixed global variable plist leak
  * patch release 0.4.1
  * removed temporary debug output file
  * flipping the cases for writing data and string elements in build(). removed the 125 length check. Added validation of base64 encoding for data fields when parsing. added unit tests.
  * fixed syntax errors in README examples (issue #20)
  * added Sync versions of calls. added deprecation warnings for old method calls. updated documentation. If the resulting object from parseStringSync is an array with 1 element, return just the element. If a plist string or file doesnt have a <plist> tag as the document root element, fail noisily (issue #15)
  * incrementing package version
  * added cross platform base64 encode/decode for data elements (issue #17.) Comments and hygiene.
  * refactored the code to use a DOM parser instead of SAX. closes issues #5 and #16
  * rolling up package version
  * updated base64 detection regexp. updated README. hygiene.
  * refactored the build function. Fixes issue #14
  * refactored tests. Modified tests from issue #9. thanks @sylvinus
  * upgrade xmlbuilder package version. this is why .end() was needed in last commit; breaking change to xmlbuilder lib. :/
  * bug fix in build function, forgot to call .end() Refactored tests to use nodeunit
  * Implemented support for real, identity tests
  * Refactored base64 detection - still sloppy, fixed date building. Passing tests OK.
  * Implemented basic plist builder that turns an existing JS object into plist XML. date, real and data types still need to be implemented.
