
import React from 'react';

const Nav: React.FC = () => {
  return (
    <nav className="fixed top-0 left-0 w-full bg-gray-800 p-4 h-19 text-white flex justify-between items-center z-30">
    
      <div className="text-2xl font-semibold text-center absolute left-1/2 transform -translate-x-1/2">
        Flex-Dice Game
      </div>
    </nav>
  );
};

export default Nav;
