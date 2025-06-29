// src/App.jsx
import React, { useState, useEffect } from 'react';
import Signup from './components/Signup';

import Login from './components/Login';
import Dashboard from './components/Dashboard'; // We'll create this next
import './index.css'; // Global styles

// Import Firebase auth from our setup file
import { auth } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth'; // Import listener and signOut function

function App() {
  // State to track if the login form should be shown or the signup form
  const [showLogin, setShowLogin] = useState(true);
  // State to store the current authenticated user (Firebase User object)
  const [user, setUser] = useState(null);
  // State to store the Firebase ID Token received from client-side login
  const [idToken, setIdToken] = useState(null);

  // Effect hook to listen for Firebase authentication state changes
  useEffect(() => {
    // This listener automatically updates 'user' state when user logs in/out
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // User is logged in via Firebase client SDK
        setUser(currentUser);
        // Get the ID token for backend authentication
        const token = await currentUser.getIdToken();
        setIdToken(token);
        console.log("Firebase client-side user logged in:", currentUser.email, "UID:", currentUser.uid);
      } else {
        // User is logged out
        setUser(null);
        setIdToken(null);
        console.log("Firebase client-side user logged out.");
      }
    });

    // Cleanup subscription on component unmount
    return () => unsubscribe();
  }, []); // Empty dependency array means this runs once on mount

  const handleAuthSuccess = (uid, email, token = null) => {
  // This is called after successful signup or login
  // Firebase auth state listener (onAuthStateChanged) will update the 'user' state naturally
  // We explicitly set idToken here just for immediate use if needed, though the listener will also update it.
  if (token) {
    // This branch is executed after a successful CLIENT-SIDE login (Email/Password or Google)
    // The onAuthStateChanged listener will automatically update the 'user' state
    // and cause the Dashboard to render.
    setIdToken(token); // Set ID token if provided (from login)
    console.log(`User ${email} (${uid}) successfully logged in.`);
  } else {
    // This branch is typically executed after a successful backend SIGNUP
    // (where 'token' is not yet available because the user isn't client-side logged in)
    console.log(`User ${email} (${uid}) successfully signed up via backend.`);
    // AFTER SIGNUP: Force the view to switch to the Login component
    setShowLogin(true); // <--- ADD THIS LINE HERE
  }
};
  const handleLogout = async () => {
    try {
      await signOut(auth); // Sign out from Firebase client-side
      // The onAuthStateChanged listener will handle setting user to null
      console.log("User logged out successfully.");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  // Render logic based on user authentication status
  return (
    <div className="app-container">
      {user ? (
        // User is logged in, show Dashboard (we'll create this component next)
        <Dashboard user={user} idToken={idToken} onLogout={handleLogout} />
      ) : (
        // User is not logged in, show Auth forms
        <>
          {showLogin ? (
            <Login onLoginSuccess={handleAuthSuccess} onToggleView={() => setShowLogin(false)} />
          ) : (
            <Signup onSignupSuccess={handleAuthSuccess} onToggleView={() => setShowLogin(true)} />
          )}
        </>
      )}
    </div>
  );
}

export default App;