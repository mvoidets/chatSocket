import React, { useState } from "react";

interface AvatarCarouselProps {
  onSelectAvatar: (avatar: string) => void;
}

const AvatarCarousel: React.FC<AvatarCarouselProps> = ({ onSelectAvatar }) => {
  const avatars = [
    "darth.jpg",
    "baby_yoda.jpg",
    "chewie.jpg",
    "mando.jpg",
    "r2d2.jpg",
    "storm_trooper.jpg",
  ];
  const [currentIndex, setCurrentIndex] = useState(0);

  const nextAvatar = () => {
    setCurrentIndex((prevIndex) => (prevIndex + 1) % avatars.length);
  };

  const prevAvatar = () => {
    setCurrentIndex((prevIndex) => (prevIndex - 1 + avatars.length) % avatars.length);
  };

  // Handle avatar selection
  const handleAvatarClick = () => {
    const selectedAvatar = `/images/${avatars[currentIndex]}`;
    onSelectAvatar(selectedAvatar); // Pass selected avatar to parent component
  };


  return (
    <div className="avatar-carousel flex items-center justify-center space-x-4">
      <button onClick={prevAvatar} className="px-4 py-2 bg-black-300 rounded">
        Prev
      </button>

      {/* Avatar Image */}
      <div className="avatar-image-container">
        <img
          src={`/images/${avatars[currentIndex]}`}
          alt={`Avatar ${currentIndex}`}
          className="w-32 h-32 rounded-full cursor-pointer"
          onClick={handleAvatarClick} // Pass selected avatar to parent
        />
      </div>

      <button onClick={nextAvatar} className="px-4 py-2 bg-black-300 rounded">
        Next
      </button>
    </div>
  );
};

export default AvatarCarousel;
