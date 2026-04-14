"use strict";

var asciichart = require ('./asciichart')

var width = 60
var line = "\n" + '='.repeat (width + 9) + "\n"

console.log ("\nbasic\n")

var s0 = new Array (width)
for (var i = 0; i < s0.length; i++)
    s0[i] = 15 * Math.sin (i * ((Math.PI * 4) / s0.length))
console.log (asciichart.plot (s0))

console.log (line)
console.log ("configuring / scale to desired height\n")

var config = {
    padding: '       ',  // padding string for label formatting (can be overrided)
    offset:  3,  // axis offset from the left (min 2)
    height:  10, // any height you want
    format: function (x, i) {
        return ('       ' + x.toFixed (2)).slice (-'       '.length)
    }
}

var s = []
for (var i = 0; i < width; i++)
    s[i] = 15 * Math.cos (i * ((Math.PI * 8) / width)) // values range from -15 to +15
console.log (asciichart.plot (s, config)) // this rescales the graph to ±3 lines

console.log (line)
console.log ("\configuring y-axis bounds and symbols\n")
config.min = -20;
config.max = 20;
config.symbols = [ '┣', '┣', '╶', '╴', '─', '╰', '╭', '╮', '╯', '│' ];
console.log (asciichart.plot (s, config));

console.log (line)
console.log ("auto-range\n")

var s2 = new Array (width)
s2[0] = Math.round (Math.random () * 15)
for (i = 1; i < s2.length; i++)
    s2[i] = s2[i - 1] + Math.round (Math.random () * (Math.random () > 0.5 ? 2 : -2))
console.log (asciichart.plot (s2) + "\n")

console.log (line)
console.log ("single value\n")

var s3 = new Array (width)
for (i = 0; i < width; i++)
    s3[i] = 1.0
console.log (asciichart.plot (s3) + "\n")

// test multiple
console.log (line)
console.log ("multiple disjoint array test\n")


var arr1 = new Array (width)
for (var i = 0; i < arr1.length; i++)
    arr1[i] = 5 * Math.sin (i * ((Math.PI * 4) / arr1.length))

var arr2 = new Array (width)
for (var i = 0; i < arr2.length; i++)
    arr2[i] = arr1[i] + 2

console.log (asciichart.plot ([ arr1, arr2 ]))

// test multiple
console.log (line)
console.log ("multiple intersecting arrays test\n")

var arr1 = new Array (width)
for (var i = 0; i < arr1.length; i++)
    arr1[i] = 5 * Math.sin (i * ((Math.PI * 4) / arr1.length))

var arr2 = new Array (width)
for (var i = 0; i < arr2.length; i++)
    arr2[i] = 5 *  Math.sin (Math.PI + i * ((Math.PI * 4) / arr2.length))


console.log (asciichart.plot ([ arr1, arr2 ]))

// test multiple colored
console.log (line)
console.log ("multiple intersecting arrays with colors test\n")

var arr1 = new Array (width)
for (var i = 0; i < arr1.length; i++)
    arr1[i] = 5 * Math.sin (i * ((Math.PI * 4) / arr1.length))

var arr2 = new Array (width)
for (var i = 0; i < arr2.length; i++)
    arr2[i] = 5 * Math.sin (Math.PI + i * ((Math.PI * 4) / arr2.length))

var arr3 = new Array (width)
for (var i = 0; i < arr3.length; i++)
    arr3[i] = 5 - i * 0.2

var arr4 = new Array (width)
for (var i = 0; i < arr4.length; i++)
    arr4[i] = 10 + 5 * Math.cos (i * ((Math.PI * 4) / arr1.length))

var config = {
    colors: [
        asciichart.blue,
        asciichart.green,
        asciichart.magenta,
        asciichart.red
    ]
}

var series = [ arr1, arr2, arr3, arr4 ]

console.log (asciichart.plot (series, config))
