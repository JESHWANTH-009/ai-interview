import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { BrowserRouter } from 'react-router-dom'; 
import React from 'react';
import ReactDOM from 'react-dom/client';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter> {/* <--- WRAP YOUR APP WITH THIS */}
      <App />
    </BrowserRouter> {/* <--- CLOSE THE TAG */}
  </React.StrictMode>,
);
