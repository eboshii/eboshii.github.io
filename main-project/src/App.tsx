import React, { useEffect, useState } from 'react';
import './App.css';

// Make sure zero-md is available globally with correct typing
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'zero-md': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        src: string;
      }, HTMLElement>;
    }
  }
}

interface BlogPost {
  id: number;
  filename: string;
}

function App() {
  const [posts, setPosts] = useState<BlogPost[]>([
    { id: 1, filename: '1.blog_purpose.md' },
    { id: 0, filename: '0.initial.md' }
  ]);

  useEffect(() => {
    // Load zero-md library
    const script = document.createElement('script');
    script.type = 'module';
    script.src = 'https://cdn.jsdelivr.net/gh/zerodevx/zero-md@2/dist/zero-md.min.js';
    document.head.appendChild(script);
    
    return () => {
      document.head.removeChild(script);
    };
  }, []);

  return (
    <div>
      <div className="heading">eboshii</div>
      {posts.map((post) => (
        <div key={post.id} className="markdownContainer">
          <zero-md src={`/posts/${post.filename}`}></zero-md>
        </div>
      ))}
    </div>
  );
}

export default App;
