# ai-interview-coach-backend/routes/user.py
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from firebase_admin import firestore
# Corrected import path: assuming auth.py is one level up (in backend root)
from auth import get_current_user_data # <--- CORRECTED IMPORT

# Get Firestore client instance
db = firestore.client()

router = APIRouter()

class UserProfile(BaseModel):
    uid: str
    email: str
    display_name: str | None = None
    created_at: str # Use string for datetime from Firestore for simplicity in Pydantic

@router.get("/profile", response_model=UserProfile)
async def get_user_profile(user_data: dict = Depends(get_current_user_data)):
    """
    Retrieves the profile of the current authenticated user.
    If no profile exists, a basic one is created.
    """
    current_user_uid = user_data['uid']
    user_email = user_data['email']

    user_ref = db.collection('users').document(current_user_uid)
    # Firestore get() is synchronous, no await needed here
    user_doc = user_ref.get() # <--- CORRECTED: Removed await

    if user_doc.exists:
        profile_data = user_doc.to_dict()
        if 'uid' not in profile_data:
            profile_data['uid'] = current_user_uid
        if 'email' not in profile_data:
            profile_data['email'] = user_email
        if 'created_at' in profile_data and hasattr(profile_data['created_at'], 'isoformat'):
             profile_data['created_at'] = profile_data['created_at'].isoformat()
        
        return UserProfile(**profile_data)
    else:
        new_profile = {
            "uid": current_user_uid,
            "email": user_email,
            "display_name": user_data.get('name'),
            "created_at": firestore.SERVER_TIMESTAMP
        }
        # Firestore set() is synchronous, no await needed here
        user_ref.set(new_profile) # <--- CORRECTED: Removed await

        # Fetch the just-created document (synchronously) to get the server timestamp and return
        created_doc = user_ref.get() # <--- CORRECTED: Removed await
        profile_data = created_doc.to_dict()
        if 'created_at' in profile_data and hasattr(profile_data['created_at'], 'isoformat'):
             profile_data['created_at'] = profile_data['created_at'].isoformat()
        return UserProfile(**profile_data)