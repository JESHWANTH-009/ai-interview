
import React,{useState} from 'react';
import './Signup.css'; // Import the CSS file for this component
import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

function Signup({ onSignupSuccess, onToggleView }) { // Receive props for success and toggle
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e) => {
    e.preventDefault(); // Prevent default form submission
    setError(''); // Clear previous errors

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);
    try {
      // Send signup data to your FastAPI backend
      const response = await axios.post(`${API_BASE_URL}/auth/signup`, {
        email: email,
        password: password,
        display_name: displayName,
      });

      console.log('Signup successful:', response.data);
      // Call the success callback passed from App.jsx
      onSignupSuccess(response.data.uid, response.data.email);
    } catch (err) {
      console.error('Signup error:', err.response ? err.response.data : err.message);
      setError(err.response ? err.response.data.detail || 'Signup failed.' : 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="signup-container">
      <h2>Create an Account</h2>
      <form className="signup-form" onSubmit={handleSignup}>
        {error && <p className="error-message">{error}</p>}
        <div className="form-group">
          <label htmlFor="displayName">Display Name:</label>
          <input
            type="text"
            id="displayName"
            name="displayName"
            placeholder="Enter your name"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={loading}
          />
        </div>
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
        <div className="form-group">
          <label htmlFor="confirmPassword">Confirm Password:</label>
          <input
            type="password"
            id="confirmPassword"
            name="confirmPassword"
            placeholder="Confirm your password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={loading}
          />
        </div>
        <button type="submit" className="signup-button" disabled={loading}>
          {loading ? 'Signing Up...' : 'Sign Up'}
        </button>
      </form>
      <div className="auth-toggle">
        <p>Already have an account? <button onClick={onToggleView} className="toggle-button">Log In</button></p>
      </div>
    </div>
  );
}

export default Signup;