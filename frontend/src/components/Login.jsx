// src/components/Login.jsx
import React, { useState } from 'react';
import axios from 'axios';
import { signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth'; // Import Firebase auth functions
import { auth, googleProvider } from '../firebase'; // Import auth instance and googleProvider
import './Login.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

function Login({ onLoginSuccess, onToggleView }) { // Receive props for success and toggle
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // 1. Authenticate with Firebase client-side using email/password
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. Get the Firebase ID Token
      const idToken = await user.getIdToken();
      console.log('Firebase ID Token:', idToken);

      // 3. Send the ID Token to your FastAPI backend for verification
      const response = await axios.post(`${API_BASE_URL}/auth/verify-token`, { idToken: idToken });

      console.log('Login successful:', response.data);
      onLoginSuccess(user.uid, user.email, idToken); // Pass ID token back if needed by App.jsx
    } catch (err) {
      console.error('Login error:', err.message);
      let errorMessage = 'Login failed. Please check your credentials.';
      if (err.code === 'auth/user-not-found') {
        errorMessage = 'No user found with this email.';
      } else if (err.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect password.';
      } else if (err.response && err.response.data && err.response.data.detail) {
        errorMessage = err.response.data.detail; // FastAPI error message
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);

    try {
      // 1. Authenticate with Firebase client-side using Google Popup
      const userCredential = await signInWithPopup(auth, googleProvider);
      const user = userCredential.user;

      // 2. Get the Firebase ID Token
      const idToken = await user.getIdToken();
      console.log('Google Sign-in successful. Firebase ID Token:', idToken);

      // 3. Send the ID Token to your FastAPI backend for verification
      const response = await axios.post(`${API_BASE_URL}/auth/verify-token`, { idToken: idToken });

      console.log('Backend verification successful:', response.data);
      onLoginSuccess(user.uid, user.email, idToken); // Pass ID token back if needed by App.jsx
    } catch (err) {
      console.error('Google login error:', err.message);
      setError(err.message === 'Firebase: Error (auth/popup-closed-by-user).' ? 'Google login cancelled.' : 'Google login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <h2>Log In to Your Account</h2>
      <form className="login-form" onSubmit={handleEmailLogin}>
        {error && <p className="error-message">{error}</p>}
        <div className="form-group">
          <label htmlFor="email">Email:</label>
          <input
            type="email"
            id="email"
            name="email"
            placeholder="Enter your email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
        </div>
        <div className="form-group">
          <label htmlFor="password">Password:</label>
          <input
            type="password"
            id="password"
            name="password"
            placeholder="Enter your password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
        </div>
        <button type="submit" className="login-button" disabled={loading}>
          {loading ? 'Logging In...' : 'Log In'}
        </button>
      </form>
      <div className="social-login">
        <p>- OR -</p>
        <button onClick={handleGoogleLogin} className="google-button" disabled={loading}>
          {loading ? 'Signing in with Google...' : 'Sign in with Google'}
        </button>
      </div>
      <div className="auth-toggle">
        <p>Don't have an account? <button onClick={onToggleView} className="toggle-button">Sign Up</button></p>
      </div>
    </div>
  );
}

export default Login;