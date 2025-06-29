# ai-interview-coach-backend/auth.py
import firebase_admin
from firebase_admin import auth, credentials, firestore
from fastapi import HTTPException, status, Depends, APIRouter # Added APIRouter
from fastapi.security import OAuth2PasswordBearer
import os
from dotenv import load_dotenv
from pydantic import BaseModel

# Load environment variables
load_dotenv()
auth_router = APIRouter()

# --- Firebase Initialization (Ensure this runs only once) ---
# Check if Firebase has already been initialized
if not firebase_admin._apps:
    service_account_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_KEY_PATH")
    if not service_account_path or not os.path.exists(service_account_path):
        raise FileNotFoundError(
            f"Firebase service account key file not found at {service_account_path}. "
            "Please ensure FIREBASE_SERVICE_ACCOUNT_KEY_PATH is set correctly in your .env file."
        )
    cred = credentials.Certificate(service_account_path)
    firebase_admin.initialize_app(cred)
    print("Firebase Admin SDK initialized successfully.")

# Get Firestore client
db = firestore.client()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token") # Corrected tokenUrl to match our actual endpoint

# Define the auth router here
auth_router = APIRouter( # Changed variable name to auth_router
    prefix="/auth",
    tags=["Authentication"]
)

async def get_current_user_data(token: str = Depends(oauth2_scheme)):
    """
    Dependency that extracts and verifies a Firebase ID Token from the Authorization header.
    Returns the decoded token dictionary (which includes uid and email).
    """
    try:
        decoded_token = auth.verify_id_token(token)
        return decoded_token
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired authentication token. Error: {e}"
        )

class Token(BaseModel):
    idToken: str

@auth_router.post("/verify-token")
async def verify_token(token: Token):
    try:
        decoded_token = auth.verify_id_token(token.idToken)
        uid = decoded_token['uid']
        email = decoded_token.get('email')

        # Check if user profile exists in Firestore, create if not
        user_ref = db.collection('users').document(uid)
        # Firestore get() is synchronous, no await needed here
        user_doc = user_ref.get() # <--- CORRECTED: Removed await

        if not user_doc.exists:
            new_profile_data = {
                "uid": uid,
                "email": email,
                "display_name": decoded_token.get('name'), # e.g., for Google sign-in
                "created_at": firestore.SERVER_TIMESTAMP
            }
            # Firestore set() is synchronous, no await needed here
            user_ref.set(new_profile_data) # <--- CORRECTED: Removed await
            print(f"New user profile created for UID: {uid}")

        return {"uid": uid, "email": email, "message": "Token verified successfully"}
    except Exception as e:
        print(f"Token verification failed: {e}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))

class UserCreate(BaseModel):
    email: str
    password: str
    display_name: str | None = None


@auth_router.post("/signup")
async def signup_user(user_data: UserCreate):
    try:
        user = auth.create_user(email=user_data.email, password=user_data.password)
        uid = user.uid
        email = user.email
        display_name = user_data.display_name or None

        # Create user profile in Firestore immediately after signup
        user_ref = db.collection('users').document(uid)
        new_profile_data = {
            "uid": uid,
            "email": email,
            "display_name": display_name, # Will be set by user if desired
            "created_at": firestore.SERVER_TIMESTAMP
        }
        # Firestore set() is synchronous, no await needed here
        user_ref.set(new_profile_data) # <--- CORRECTED: Removed await

        return {"uid": uid, "email": email, "message": "User created successfully"}
    except Exception as e:
        print(f"Signup failed: {e}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))