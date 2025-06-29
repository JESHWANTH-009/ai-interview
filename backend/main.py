from fastapi import FastAPI
from routes.user import router as user_router
from routes.interview import router as interview_router
from fastapi.middleware.cors import CORSMiddleware
# Corrected: Import 'router' as 'auth_router' from the 'auth' module
from auth import auth_router # <--- CORRECTED IMPORT
from dotenv import load_dotenv
import os

app = FastAPI()

FRONT_END_API = os.getenv("FRONT_END_API")


origins = [
    # React app development server
    "https://ai-interview-gold.vercel.app" # For cases where browser uses localhost
    # Add your deployed frontend URL here when you deploy, e.g., "https://your-frontend-app.vercel.app"
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include your routes
# Use the aliased name 'auth_router' here
app.include_router(auth_router) # <--- CORRECTED USAGE
app.include_router(user_router,prefix="/user")
app.include_router(interview_router, tags=["Interview Flow"]) 

@app.get("/")
async def read_root():
    """
    Root endpoint for the AI Interview Coach Backend.
    """
    return {"message": "Welcome to the AI Interview Coach Backend!"}