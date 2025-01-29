"use client";

import React, { useState } from "react";

const Dice = () => {
  const [diceNumber, setDiceNumber] = useState<number>(1);
  const [isRolling, setIsRolling] = useState<boolean>(false);

  const rollDice = () => {
    setIsRolling(true);
    let rollCount = 0;
    let speed = 100; // Initial speed (ms)
    const maxRolls = 30; // Total number of rolls
    const rampUpRolls = 15; // Number of rolls to ramp up
    const rampDownRolls = 5; // Number of rolls to ramp down
    let interval: NodeJS.Timeout;

    // Function to adjust the speed dynamically
    const adjustSpeed = (count: number) => {
      if (count < rampUpRolls) {
        // Ramp up speed by decreasing interval time
        speed = Math.max(20, 100 - (100 * count) / rampUpRolls);
      } else if (count >= maxRolls - rampDownRolls) {
        // Ramp down speed by increasing interval time
        speed = Math.min(
          200,
          100 + ((count - (maxRolls - rampDownRolls)) * 100) / rampDownRolls
        );
      }
    };

    interval = setInterval(() => {
      setDiceNumber(Math.floor(Math.random() * 6) + 1);
      rollCount++;
      adjustSpeed(rollCount);

      if (rollCount === maxRolls) {
        clearInterval(interval);
        setIsRolling(false);
      }
    }, speed); // Update speed dynamically based on rollCount
  };

  return (
    <div className="flex flex-col items-center space-y-4">
      <div
        className={`w-32 h-32 flex items-center justify-center bg-gray-200 rounded-lg ${
          isRolling ? "animate-pulse" : ""
        }`}
      >
        <span className="text-4xl font-bold">{diceNumber}</span>
      </div>
      <button
        onClick={rollDice}
        className="px-4 py-2 bg-blue-500 text-white rounded-md"
      >
        Roll Dice
      </button>
    </div>
  );
};

export default Dice;
