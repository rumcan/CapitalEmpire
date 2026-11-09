"""land.living: the ground that changes with what is on it: casters, roads, water, sand, leaves, shine, lawns, base grass"""
from fractal.holon import Holon

HOLON = Holon(
    id="land.living", rung=2, title="Living ground",
    purpose="the ground that changes with what is on it: casters, roads, water, sand, leaves, shine, lawns, base grass",
    requires=["The living ground is computed per chunk from its sources (living-ground.ts influence), and its signature (livingSignature) says when a chunk must be redone."],
)
