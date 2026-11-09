"""land.bake: the ground painted into chunks: the worker, the cache on the main thread, the layers and the messages between them"""
from fractal.holon import Holon

HOLON = Holon(
    id="land.bake", rung=2, title="Ground bake",
    purpose="the ground painted into chunks: the worker, the cache on the main thread, the layers and the messages between them",
    requires=["A chunk is baked in a worker and the main thread keeps a GL texture per chunk (ground-cache.ts GroundCache)."],
)
