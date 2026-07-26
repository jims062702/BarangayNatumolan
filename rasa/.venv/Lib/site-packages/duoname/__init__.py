import os
import random

__version__ = "0.0.2"
__all__ = ["duoname"]


def pkgfile(name):
    return os.path.join(os.path.dirname(__file__), name)

def collect(name):
    data = []
    with open(pkgfile(name), encoding='utf-8') as f:
        for line in f:
                yield line.strip()

_ADJ  = list(collect('adjective.txt'))
_NOUN = list(collect('noun.txt'))

def duoname():
    return random.choice(_ADJ) + '-' + random.choice(_NOUN)

