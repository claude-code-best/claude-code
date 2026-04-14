asciichart
==========

|npm| |Travis| |Coverage Status| |license|

Console ASCII line charts in pure Javascript (for NodeJS and browsers) with no dependencies. This code is absolutely free for any usage, you just do whatever the fuck you want.

Usage
-----

NodeJS
~~~~~~

.. code:: sh

    npm install asciichart

.. code:: javascript

    var asciichart = require ('asciichart')
    var s0 = new Array (120)
    for (var i = 0; i < s0.length; i++)
        s0[i] = 15 * Math.sin (i * ((Math.PI * 4) / s0.length))
    console.log (asciichart.plot (s0))

Browsers
~~~~~~~~

.. code:: html

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

Options
~~~~~~~

The width of the chart will always equal the length of data series. The height and range are determined automatically.

.. code:: javascript

    var s0 = new Array (120)
    for (var i = 0; i < s0.length; i++)
        s0[i] = 15 * Math.sin (i * ((Math.PI * 4) / s0.length))
    console.log (asciichart.plot (s0))

The output can be configured by passing a second parameter to the ``plot (series, config)`` function. The following options are supported:

.. code:: javascript

    var config = {

        offset:  3,          // axis offset from the left (min 2)
        padding: '       ',  // padding string for label formatting (can be overrided)
        height:  10,         // any height you want

        // the label format function applies default padding
        format:  function (x, i) { return (padding + x.toFixed (2)).slice (-padding.length) }
    }

Scale To Desired Height
~~~~~~~~~~~~~~~~~~~~~~~

.. code:: javascript

    var s = []
    for (var i = 0; i < 120; i++)
        s[i] = 15 * Math.cos (i * ((Math.PI * 8) / 120)) // values range from -15 to +15
    console.log (asciichart.plot (s, { height: 6 }))     // this rescales the graph to ±3 lines

Auto-range
~~~~~~~~~~

.. code:: javascript

    var s2 = new Array (120)
    s2[0] = Math.round (Math.random () * 15)
    for (i = 1; i < s2.length; i++)
        s2[i] = s2[i - 1] + Math.round (Math.random () * (Math.random () > 0.5 ? 2 : -2))
    console.log (asciichart.plot (s2))

See Also
~~~~~~~~

A util by `madnight <https://github.com/madnight>`__ for drawing Bitcoin/Ether/altcoin charts in command-line console: `bitcoin-chart-cli <https://github.com/madnight/bitcoin-chart-cli>`__.

.. figure:: https://camo.githubusercontent.com/494806efd925c4cd56d8370c1d4e8b751812030a/68747470733a2f2f692e696d6775722e636f6d2f635474467879362e706e67
   :alt: bitcoin-chart-cli

   bitcoin-chart-cli

Special thx to `MitchTalmadge <https://github.com/MitchTalmadge>`__ for porting this package to Java! If you're a Java-guy, check it out here: `ASCIIGraph <https://github.com/MitchTalmadge/ASCIIGraph>`__.

.. |npm| image:: https://img.shields.io/npm/v/asciichart.svg
   :target: https://npmjs.com/package/asciichart
.. |Travis| image:: https://travis-ci.org/kroitor/asciichart.svg?branch=master
   :target: https://travis-ci.org/kroitor/asciichart
.. |Coverage Status| image:: https://coveralls.io/repos/github/kroitor/asciichart/badge.svg?branch=master
   :target: https://coveralls.io/github/kroitor/asciichart?branch=master
.. |license| image:: https://img.shields.io/github/license/kroitor/asciichart.svg
   :target: 
