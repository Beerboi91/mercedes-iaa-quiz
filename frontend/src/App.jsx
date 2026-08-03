import React, { useState, useEffect } from 'react';
import HostView from './HostView.jsx';
import MobileView from './MobileView.jsx';

export default function App() {
  const [route, setRoute] = useState(window.location.pathname);

  useEffect(() => {
    const handleLocationChange = () => {
      setRoute(window.location.pathname);
    };

    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  const navigate = (path) => {
    window.history.pushState({}, '', path);
    setRoute(path);
  };

  if (route.startsWith('/mobile')) {
    return <MobileView navigate={navigate} />;
  }

  // Default to Host View
  return <HostView navigate={navigate} />;
}
