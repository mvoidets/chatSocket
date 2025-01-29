import React from 'react';
import CustomDice from './CustomDice'; 

const DiceCluster = () => (
  <div className="relative flex justify-center items-center">
    {/* Bottom Die (Largest and at the base) */}
    <div
      className="absolute"
      style={{
        transform: 'rotate(-10deg)', 
        top: '15px',
        left: '10px',
      }}
    >
      <CustomDice label="L" />
    </div>

    {/* Center Die */}
    <div
      className="absolute"
      style={{
        transform: 'rotate(15deg)', 
        top: '10px', 
      }}
    >
      <CustomDice label="C" />
    </div>

    {/* Top Die (Smallest and at the peak) */}
    <div
      className="absolute"
      style={{
        transform: 'rotate(-15deg)', 
        top: '-50px', 
        left: '5px', 
      }}
    >
      <CustomDice label="R" />
    </div>
  </div>
);

export default DiceCluster;
