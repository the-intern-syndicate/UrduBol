from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from app.websocket import router as websocket_router

app = FastAPI(title="Urdu Lecture Transcriber", version="1.0.0")

# CORS setup for local testing flexibility
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files (HTML, CSS, JS)
app.mount("/static", StaticFiles(directory="app/static"), name="static")

# Include WebSocket routing
app.include_router(websocket_router)

@app.get("/")
async def get_index():
    return FileResponse("app/static/index.html")