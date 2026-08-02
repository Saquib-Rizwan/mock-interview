from fastapi import FastAPI

app = FastAPI(title="mock-interview ml-service")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ml-service"}
