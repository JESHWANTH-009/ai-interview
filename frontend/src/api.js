// frontend/src/api.js
import axios from 'axios';

// Get the backend API URL from environment variables
// VITE_API_BASE_URL will be set on Vercel's dashboard for production/preview deployments.
// For local development, you'll use a .env file in your 'frontend' directory.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL; // <--- Changed here

// Optional: Add a warning if the API_BASE_URL is not set during development
if (!API_BASE_URL){
    console.warn('API_BASE_URL is not set. Make sure to configure VITE_API_BASE_URL in your .env file or Vercel environment variables.'); // <--- Changed here
}
const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// IMPORTANT: Un-comment and complete this interceptor if your backend
// requires Firebase ID Tokens for authenticated requests.
// Make sure 'auth' is imported correctly from your Firebase setup file.
import { auth } from './firebase'; // Ensure this path is correct

api.interceptors.request.use(async (config) => {
    const user = auth.currentUser;
    if (user) {
        try {
            const idToken = await user.getIdToken();
            config.headers.Authorization = `Bearer ${idToken}`;
        } catch (error) {
            console.error("Error getting Firebase ID Token:", error);
            // Optionally, handle token refresh issues or user re-authentication here
        }
    }
    return config;
}, (error) => {
    // Do something with request error
    return Promise.reject(error);
});

export default api; 