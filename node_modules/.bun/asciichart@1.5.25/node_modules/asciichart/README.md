# asciichart

[![npm](https://img.shields.io/npm/v/asciichart.svg)](https://npmjs.com/package/asciichart) [![PyPI](https://img.shields.io/pypi/v/asciichartpy.svg)](https://pypi.python.org/pypi/asciichartpy) [![Travis](https://travis-ci.org/kroitor/asciichart.svg?branch=master)](https://travis-ci.org/kroitor/asciichart) [![Coverage Status](https://coveralls.io/repos/github/kroitor/asciichart/badge.svg?branch=master)](https://coveralls.io/github/kroitor/asciichart?branch=master) [![license](https://img.shields.io/github/license/kroitor/asciichart.svg)](https://github.com/kroitor/asciichart/blob/master/LICENSE.txt)

Console ASCII line charts in pure Javascript (for NodeJS and browsers) with no dependencies. This code is absolutely free for any usage, you just do whatever the fuck you want.

<img width="789" alt="Console ASCII Line charts in pure Javascript (for NodeJS and browsers)" src="https://cloud.githubusercontent.com/assets/1294454/22818709/9f14e1c2-ef7f-11e6-978f-34b5b595fb63.png">

## Usage

### NodeJS

```sh
npm install asciichart
```

```javascript
var asciichart = require ('asciichart')
var s0 = new Array (120)
for (var i = 0; i < s0.length; i++)
    s0[i] = 15 * Math.sin (i * ((Math.PI * 4) / s0.length))
console.log (asciichart.plot (s0))
```

### Browsers

```html
<!DOCTYPE html>
<html>
    <head>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
        <meta charset="UTF-8">
        <title>asciichart</title>
        <script src="asciichart.js"></script>
        <script type="text/javascript">
            var s0 = new Array (120)
            for (var i = 0; i < s0.length; i++)
                s0[i] = 15 * Math.sin (i * ((Math.PI * 4) / s0.length))
            console.log (asciichart.plot (s0))
        </script>
    </head>
    <body>
    </body>
</html>
```

### Options

The width of the chart will always equal the length of data series. The height and range are determined automatically.

```javascript
var s0 = new Array (120)
for (var i = 0; i < s0.length; i++)
    s0[i] = 15 * Math.sin (i * ((Math.PI * 4) / s0.length))
console.log (asciichart.plot (s0))
```

<img width="788" alt="Console ASCII Line charts in pure Javascript (for NodeJS and browsers)" src="https://cloud.githubusercontent.com/assets/1294454/22818807/313cd636-ef80-11e6-9d1a-7a90abdb38c8.png">

The output can be configured by passing a second parameter to the `plot (series, config)` function. The following options are supported:
```javascript
var config = {

    offset:  3,          // axis offset from the left (min 2)
    padding: '       ',  // padding string for label formatting (can be overrided)
    height:  10,         // any height you want

    // the label format function applies default padding
    format:  function (x, i) { return (padding + x.toFixed (2)).slice (-padding.length) }
}
```

### Scale To Desired Height

<img width="791" alt="Console ASCII Line charts in pure Javascript (for NodeJS and browsers)" src="https://cloud.githubusercontent.com/assets/1294454/22818711/9f166128-ef7f-11e6-9748-b23b151974ed.png">

```javascript
var s = []
for (var i = 0; i < 120; i++)
    s[i] = 15 * Math.cos (i * ((Math.PI * 8) / 120)) // values range from -15 to +15
console.log (asciichart.plot (s, { height: 6 }))     // this rescales the graph to ±3 lines
```

<img width="787" alt="Console ASCII Line charts in pure Javascript (for NodeJS and browsers)" src="https://cloud.githubusercontent.com/assets/1294454/22825525/dd295294-ef9e-11e6-93d1-0beb80b93133.png">

### Auto-range

```javascript
var s2 = new Array (120)
s2[0] = Math.round (Math.random () * 15)
for (i = 1; i < s2.length; i++)
    s2[i] = s2[i - 1] + Math.round (Math.random () * (Math.random () > 0.5 ? 2 : -2))
console.log (asciichart.plot (s2))
```

<img width="788" alt="Console ASCII Line charts in pure Javascript (for NodeJS and browsers)" src="https://cloud.githubusercontent.com/assets/1294454/22818710/9f157a74-ef7f-11e6-893a-f7494b5abef1.png">

### Multiple Series

```javascript
var s2 = new Array (120)
s2[0] = Math.round (Math.random () * 15)
for (i = 1; i < s2.length; i++)
    s2[i] = s2[i - 1] + Math.round (Math.random () * (Math.random () > 0.5 ? 2 : -2))

var s3 = new Array (120)
s3[0] = Math.round (Math.random () * 15)
for (i = 1; i < s3.length; i++)
    s3[i] = s3[i - 1] + Math.round (Math.random () * (Math.random () > 0.5 ? 2 : -2))

console.log (asciichart.plot ([ s2, s3 ]))
```

<img width="788" alt="Console ASCII Line charts in pure Javascript (for NodeJS and browsers)" src="https://user-images.githubusercontent.com/27967284/79398277-5322da80-7f91-11ea-8da8-e47976b76c12.png">

### Colors

```javascript
var arr1 = new Array (120)
arr1[0] = Math.round (Math.random () * 15)
for (i = 1; i < arr1.length; i++)
    arr1[i] = arr1[i - 1] + Math.round (Math.random () * (Math.random () > 0.5 ? 2 : -2))

var arr2 = new Array (120)
arr2[0] = Math.round (Math.random () * 15)
for (i = 1; i < arr2.length; i++)
    arr2[i] = arr2[i - 1] + Math.round (Math.random () * (Math.random () > 0.5 ? 2 : -2))

var arr3 = new Array (120)
arr3[0] = Math.round (Math.random () * 15)
for (i = 1; i < arr3.length; i++)
    arr3[i] = arr3[i - 1] + Math.round (Math.random () * (Math.random () > 0.5 ? 2 : -2))

var arr4 = new Array (120)
arr4[0] = Math.round (Math.random () * 15)
for (i = 1; i < arr4.length; i++)
    arr4[i] = arr4[i - 1] + Math.round (Math.random () * (Math.random () > 0.5 ? 2 : -2))

var config = {
    colors: [
        asciichart.blue,
        asciichart.green,
        asciichart.default, // default color
        undefined, // equivalent to default
    ]
}

console.log (asciichart.plot([ arr1, arr2, arr3, arr4 ], config))
```

<img width="788" alt="Console ASCII Line charts in pure Javascript (for NodeJS and browsers)" src="https://user-images.githubusercontent.com/27967284/79398700-51a5e200-7f92-11ea-9048-8dbdeeb60830.png">

### See Also

A util by [madnight](https://github.com/madnight) for drawing Bitcoin/Ether/altcoin charts in command-line console: [bitcoin-chart-cli](https://github.com/madnight/bitcoin-chart-cli).

![bitcoin-chart-cli](https://camo.githubusercontent.com/494806efd925c4cd56d8370c1d4e8b751812030a/68747470733a2f2f692e696d6775722e636f6d2f635474467879362e706e67)

### Ports

Special thx to all who helped port it to other languages, great stuff!

- [Python port](https://pypi.org/project/asciichartpy) included!
- Java: [ASCIIGraph](https://github.com/MitchTalmadge/ASCIIGraph), ported by [MitchTalmadge](https://github.com/MitchTalmadge). If you're a Java-person, check it out!
- Go: [asciigraph](https://github.com/guptarohit/asciigraph), ported by [guptarohit](https://github.com/guptarohit), Go people! )
- Haskell: [asciichart](https://github.com/madnight/asciichart), ported by [madnight](https://github.com/madnight) to Haskell world!
- Ruby: [ascii_chart](https://github.com/zhustec/ascii_chart), ported by [zhustec](https://github.com/zhustec)!
- Elixir: [asciichart](https://github.com/sndnv/asciichart), ported by [sndv](https://github.com/sndnv)!
- Perl: [App::AsciiChart](https://github.com/vti/app-asciichart), ported by [vti](https://github.com/vti)!
- C: [plot](https://github.com/annacrombie/plot), ported by [annacrombie](https://github.com/annacrombie) with a ruby extension!
- R: [asciichartr](https://github.com/blmayer/asciichartr), ported by [blmayer](https://github.com/blmayer)!
- Rust: [rasciigraph](https://github.com/orhanbalci/rasciigraph), ported by [orhanbalci](https://github.com/orhanbalci)!
- PHP: [PHP-colored-ascii-linechart](https://github.com/noximo/PHP-colored-ascii-linechart), ported by [noximo](https://github.com/noximo)!
- C#: [asciichart-sharp](https://github.com/samcarton/asciichart-sharp), ported by [samcarton](https://github.com/samcarton)!

### Future work (coming soon, hopefully)

- levels and points on the graph!
- even better value formatting and auto-scaling!

![preview](https://user-images.githubusercontent.com/1294454/31798504-ca2af4cc-b53c-11e7-946c-620d744f6d16.gif)

