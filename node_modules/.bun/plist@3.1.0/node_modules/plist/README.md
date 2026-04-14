plist.js
========
### Apple's Property list parser/builder for Node.js and browsers

[![ci](https://github.com/TooTallNate/plist.js/actions/workflows/ci.yml/badge.svg)](https://github.com/TooTallNate/plist.js/actions/workflows/ci.yml)

Provides facilities for reading and writing Plist (property list) files.
These are often used in programming OS X and iOS applications, as well
as the iTunes configuration XML file.

Plist files represent stored programming "object"s. They are very similar
to JSON. A valid Plist file is representable as a native JavaScript Object
and vice-versa.


## Usage

### Node.js

Install using `npm`:

``` bash
$ npm install --save plist
```

Then `require()` the _plist_ module in your file:

``` js
var plist = require('plist');

// now use the `parse()` and `build()` functions
var val = plist.parse('<plist><string>Hello World!</string></plist>');
console.log(val);  // "Hello World!"
```


### Browser

Include the `dist/plist.js` in a `<script>` tag in your HTML file:

``` html
<script src="plist.js"></script>
<script>
  // now use the `parse()` and `build()` functions
  var val = plist.parse('<plist><string>Hello World!</string></plist>');
  console.log(val);  // "Hello World!"
</script>
```


## API

### Parsing

Parsing a plist from filename:

``` javascript
var fs = require('fs');
var plist = require('plist');

var obj = plist.parse(fs.readFileSync('myPlist.plist', 'utf8'));
console.log(JSON.stringify(obj));
```

Parsing a plist from string payload:

``` javascript
var plist = require('plist');

var xml =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">' +
  '<plist version="1.0">' +
    '<key>metadata</key>' +
    '<dict>' +
      '<key>bundle-identifier</key>' +
      '<string>com.company.app</string>' +
      '<key>bundle-version</key>' +
      '<string>0.1.1</string>' +
      '<key>kind</key>' +
      '<string>software</string>' +
      '<key>title</key>' +
      '<string>AppName</string>' +
    '</dict>' +
  '</plist>';

console.log(plist.parse(xml));

// [
//   "metadata",
//   {
//     "bundle-identifier": "com.company.app",
//     "bundle-version": "0.1.1",
//     "kind": "software",
//     "title": "AppName"
//   }
// ]
```

### Building

Given an existing JavaScript Object, you can turn it into an XML document
that complies with the plist DTD:

``` javascript
var plist = require('plist');

var json = [
  "metadata",
  {
    "bundle-identifier": "com.company.app",
    "bundle-version": "0.1.1",
    "kind": "software",
    "title": "AppName"
  }
];

console.log(plist.build(json));

// <?xml version="1.0" encoding="UTF-8"?>
// <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
// <plist version="1.0">
//   <key>metadata</key>
//   <dict>
//     <key>bundle-identifier</key>
//     <string>com.company.app</string>
//     <key>bundle-version</key>
//     <string>0.1.1</string>
//     <key>kind</key>
//     <string>software</string>
//     <key>title</key>
//     <string>AppName</string>
//   </dict>
// </plist>
```

## Cross Platform Testing Credits

Much thanks to Sauce Labs for providing free resources that enable cross-browser testing on this project!

[![Testing Powered By SauceLabs](https://opensource.saucelabs.com/images/opensauce/powered-by-saucelabs-badge-red.png?sanitize=true "Testing Powered By SauceLabs")](https://saucelabs.com)


## License

[(The MIT License)](LICENSE)
