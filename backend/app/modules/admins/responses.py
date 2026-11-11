from fastapi import Response


def prevent_caching(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"
