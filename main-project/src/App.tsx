import React, { useEffect } from 'react';
import './App.css';

function App() {
  return (
    <div className="app-container">
      <section className="hero-section">
        <div className="heading">Laniakea</div>
        <div className="subtitle">AI-Driven High-Frequency Trading</div>
      </section>

      <section className="about-section">
        <h2>Our Approach</h2>
        <div className="about-content">
          <p>At Laniakea, we harness the power of artificial intelligence to revolutionize high-frequency trading. 
             Our advanced algorithms operate at unprecedented speeds, identifying and capitalizing on market opportunities 
             in microseconds.</p>
        </div>
      </section>

      <section className="capabilities-section">
        <h2>Core Capabilities</h2>
        <div className="capabilities-grid">
          <div className="capability-card">
            <h3>AI-Powered Analysis</h3>
            <p>Machine learning models processing vast amounts of market data in real-time</p>
          </div>
          <div className="capability-card">
            <h3>Ultra-Low Latency</h3>
            <p>State-of-the-art infrastructure enabling microsecond execution times</p>
          </div>
          <div className="capability-card">
            <h3>Risk Management</h3>
            <p>Sophisticated risk assessment and management systems</p>
          </div>
        </div>
      </section>

      <section className="technology-section">
        <h2>Our Technology</h2>
        <div className="tech-content">
          <p>Our proprietary trading systems leverage cutting-edge AI and machine learning technologies, 
             coupled with high-performance computing infrastructure to maintain our competitive edge in 
             the market.</p>
        </div>
      </section>

      <footer className="footer">
        <p>© {new Date().getFullYear()} Laniakea. All rights reserved.</p>
      </footer>
    </div>
  );
}

export default App;
