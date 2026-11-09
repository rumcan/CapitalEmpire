"""art: the game's pictures, from making them to getting them into the game (the EXAMPLE domain: the mappers fill in its other children)."""
from fractal.holon import Holon

HOLON = Holon(
    id="art", rung=1, title="Art pipeline",
    purpose="Make the game's pictures (ChatGPT runner, Idol 3D), check them, key and cut them, and bring them into the game's libraries.",
    requires=[
        "Every picture is lit by one sun at the screen's upper right, its shadows falling at 145 degrees.",
        "A lit picture is never mirrored to make another facing: every facing is its own picture.",
        "New art replaces the old everywhere it was used, and the old look stays as an option.",
    ],
    below=["render"], above=["town", "course", "people", "play"],
    rules=["sun upper right, shadows 145 degrees", "never mirror lit sprites", "straight views turned 8 degrees", "new art used everywhere"],
)
