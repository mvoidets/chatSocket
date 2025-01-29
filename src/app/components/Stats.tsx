"use client";

import { useState, useEffect } from "react";

export default function Stats() {
  const [winnings, setWinnings] = useState(0);
  const [losses, setLosses] = useState(0);
  const [gamesPlayed, setGamesPlayed] = useState(0);
  const [userName, setUserName] = useState("");
  

  // Simulating game stats for demonstration
  useEffect(() => {
    // Here you can replace this with real data or fetch it from your state/store
    setWinnings(10);
    setLosses(5);
    setGamesPlayed(15);
    const storedUserName = localStorage.getItem("userName");
    if (storedUserName) {
      setUserName(storedUserName);
    }

  }, []);

  return (
    <div className="fixed bottom-4 right-4 w-80 h-70 max-w-4xl mx-auto p-4 bg-white border rounded-lg shadow-lg">
      <h3 className="text-2xl  font-bold text-gray-900 ">{userName} Stats</h3>
      <div className="flex justify-between text-black text-sm mb-2">
        <span>Winnings:</span>
        <span>{winnings}</span>
      </div>
      <div className="flex justify-between text-black text-sm mb-2">
        <span>Losses:</span>
        <span>{losses}</span>
      </div>
      <div className="flex justify-between text-black text-sm mb-2">
        <span>Games Played:</span>
        <span>{gamesPlayed}</span>
      </div>
    </div>
  );
}
