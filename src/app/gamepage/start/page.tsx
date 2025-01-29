"use client";
import { useEffect, useState } from 'react';

const StartGame = () => {
  const [avatar, setAvatar] = useState<string | null>(null);

  useEffect(() => {
    
    const params = new URLSearchParams(window.location.search);
    const avatarFromURL = params.get('avatar');
    setAvatar(avatarFromURL);
  }, []);

  return (
    <div>
      <h1>Game Starting!</h1>
      {avatar ? (
        <p>You selected avatar: {avatar}</p>
      ) : (
        <p>No avatar selected.</p>
      )}
      {/* Render your game or avatar */}
    </div>
  );
};

export default StartGame;
