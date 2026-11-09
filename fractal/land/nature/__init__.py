"""land.nature: the forest on the hills, the map decals and the nature patches laid over the base grass"""
from fractal.holon import Holon

HOLON = Holon(
    id="land.nature", rung=2, title="Nature dressing",
    purpose="the forest on the hills, the map decals and the nature patches laid over the base grass",
    requires=["Forest cells take the map seed (forestCell in forest.ts), so the same map is dressed the same way."],
)
