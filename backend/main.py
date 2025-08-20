from fastapi import FastAPI

app = FastAPI()

@app.get("/saludo")
def read_root():
    return {"message": "Hola, este es un saludo desde el back"}