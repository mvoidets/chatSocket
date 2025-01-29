"use client";
import { useState, useEffect } from 'react';
import DiceCluster from '../components/DiceCluster';


const GamePage: React.FC = () => {
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
 

  useEffect(() => {
    // Retrieve avatar from localStorage on page load
    const storedAvatar = localStorage.getItem('selectedAvatar');
    if (storedAvatar) {
      setSelectedAvatar(storedAvatar);
    }
  }, []);

 
  return (
    <div className="relative min-h-screen bg-transparent">
     {/* game logic here */ }

    </div>
  );
};


export default GamePage;
