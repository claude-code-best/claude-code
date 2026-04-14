# -*- coding: utf-8 -*-

# ------------------------------------------------------------------------------

from math import cos
from math import pi

# ------------------------------------------------------------------------------

from asciichartpy import plot

# ------------------------------------------------------------------------------

width = 90
series = [7 * round(cos(i * ((pi * 4) / width)), 2) for i in range(width)]

print(plot(series))

series = [2.0] * width

print(plot(series))
print(plot(series, {'height':5}))

series = [0.0] * width

print(plot(series))
print(plot(series, {'height':5}))
